# Cloudflare Free Tier Audit

## 目的

Cloudflare へ realtime を移す場合に、無料枠で private beta まで耐えられるかを見積もる。

この監査は issue #22 の成果物であり、issue #21 の移行追跡にぶら下がる。

## 監査対象

- Workers Free plan
- Durable Objects on Workers Free plan
- Durable Object SQLite storage

## 参照した現状実装

- `apps/web/app/page.tsx` は `typing:progress` / `typing:finish` を keydown ごとに送る。
- `packages/shared/src/cloudflare-events.ts` は command ごとに ack を返す前提になっている。
- `packages/shared/src/room-engine.ts` の `BOT_TICK_MS` は 500 ms。
- `apps/cloudflare-worker/src/worker.ts` は全 room を単一 gateway Durable Object へ振り分ける構成で、room state は gateway 内の room engine が管理する。

## 公式ドキュメントの要点

以下は Cloudflare 公式ドキュメントの現時点の上限。

- Workers Free: `100,000` requests / day、CPU `10 ms` / HTTP request、Subrequests `50` / request、Memory `128 MB`。
- Durable Objects Free: SQLite-backed Durable Objects のみ利用可、最大 class 数 `100`、account storage `5 GB`、WebSocket message size `32 MiB`、CPU per request `30 s`（WebSocket messages を含む）、単一 DO の soft limit は `1,000 requests / sec`。
- D1: database size `10 GB`、Worker invocation あたりの D1 同時接続 `6`。現時点では D1 は未使用で、guest session / match result は Durable Object SQLite storage に保存する。

参考:

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/

## 見積もりの前提

以下はこの repo の current implementation からの推定。

- 1 keydown = 1 `typing:progress` または `typing:finish`
- 1 accepted typing update = 1 room authoritative update
- 1 room authoritative update = 1 gateway DO message 相当
- 1 update につき、少なくとも 1 ack と 1 room broadcast が発生する
- 2 人対戦が基本で、room 1 つあたりの同時接続は最大 2 人
- gateway DO は単一 object のため、room 数が増えると CPU、WebSocket、rate limit state が同じ object に集まる

## 1 試合あたりの概算モデル

### Human-only race

保守的に、1 試合あたり 1 人 150 回前後の keydown を見込む。

- 2 人対戦
- 1 人あたり 150 keydown
- 1 試合あたりの client command は約 `300` 件
- `match:start` / countdown / result / rematch などの制御メッセージを足しても、合計はおおむね `310` から `340` 件程度

この値は「1 request = 1 authoritative update」とみなした概算。
WebSocket の ack や broadcast を含めた message 数はこれより多いが、Workers / DO の制約を見るときはまず authoritative update 数を数えるのが実用的。

### COM match

COM ありの試合では、人間の typing update に加えて bot tick が入る。

- `BOT_TICK_MS = 500 ms`
- 30 秒試合なら bot tick は最大 `60` 回
- 60 秒試合なら bot tick は最大 `120` 回

したがって、COM 試合の request 負荷は human-only より明確に重い。

### Persistence

理想は次の通り。

- guest session: room create / join 時に 1 回ずつ
- match result: 1 試合につき 1 回

逆に、room snapshot を typing update ごとに D1 へ書くのは避けるべき。Cloudflare gateway では DO storage への snapshot 保存を debounce し、typing hot path の write 回数を間引く。

## 想定上限

### Workers Free

Requests は `100,000 / day` が上限。

human-only の試合を `320` requests / match とみなすと、1 日あたりの上限は概算で次の通り。

- `100,000 / 320 ≒ 312` matches / day

COM ありで `380` requests / match 程度まで膨らむと、概算は次の通り。

- `100,000 / 380 ≒ 263` matches / day

つまり、無料枠は private beta の小規模利用には足りるが、継続的な public beta には余裕が薄い。

### Durable Objects Free

DO 単体の soft limit は `1,000 requests / sec`。現在の実装は単一 gateway DO に全 room を集約するため、1 room の負荷ではなく全 active room の合計で見る必要がある。

この repo の 2 人対戦で、1 room が 1 人あたり毎秒 5 〜 10 回程度更新すると、1 room あたり最大 `10` 〜 `20` message / sec 程度になる。単一 gateway では、同時に `50` room 程度が活発に入力すると soft limit に近づく可能性がある。

ただし、private beta 規模では Workers Free の daily request が先に効く可能性が高い。public beta 前には room 単位 DO への分割または gateway sharding を再検討する。

### Persistence storage

guest session と match result は低頻度イベントとして Durable Object storage に保存する。room create / join と match result のみが対象なので、typing hot path には入れない。

永続化が危険になるのは次のケース。

- typing update ごとに長期保存へ書く
- room state snapshot を毎回永続化する
- イベントログを storage に積み続ける

そのため、初期 persistence は「低頻度の永続化」に限定するのが前提。横断検索や集計が必要になった段階で D1 へ移す。

## ボトルネック判定

現状の想定では、最初に詰まりやすいのは次の順。

1. Workers の daily request 100k
2. 単一 gateway DO への message 集中
3. COM tick の無駄打ち
4. DO storage / D1 による hot path 化

DO の per-object soft limit は、2 人対戦中心の private beta ならすぐには優先ボトルネックになりにくい。ただし単一 gateway 構成では同時 room 数の増加に比例して同じ object に集まる。

## throttling / coalescing 方針

### 必須

- 永続レコード書き込みは room create / join / match result などの低頻度イベントに限定する
- room snapshot を keydown ごとに即時永続化せず、DO storage 書き込みを debounce する
- `server:room:state` の完全な再送は必要時のみ行う

### 推奨

- `player:progress` は 1 keydown = 1 update のままでもよいが、公開 beta 前に 50 〜 100 ms の coalescing を検討する
- bot tick は free-tier では 500 ms 固定ではなく、`750 ms` 〜 `1,000 ms` に落とせるようにする
- progress が変わらない update は broadcast しない

## COM tick の結論

結論として、**free tier では COM tick を 1,000 ms 前後まで落とす方が安全**。

理由:

- bot tick は人間の入力と違って、負荷が使用量に比例せず一定間隔で発生する
- 500 ms のままだと、30 秒試合で 60 回、60 秒試合で 120 回の追加 invocation が出る
- private beta では許容できても、room 数が増えたときに request budget を食いやすい

したがって:

- local/dev や paid plan: 500 ms でもよい
- free tier の private beta: 1,000 ms を既定にした方が無難

## 必要な follow-up

この監査結果から、追加で切るべき issue は次の 2 つ。

1. `feat(cloudflare): coalesce progress broadcasts`
2. `feat(cloudflare): make bot tick interval adaptive`
3. `feat(cloudflare): shard gateway or move to room-scoped Durable Objects`

ただし、private beta の範囲では「必須」ではなく、計測後の後追いで十分。

## 結論

- private beta 規模なら Cloudflare Free で realtime を試す余地はある
- ただし request/day が最初の上限なので、hot path の永続化は最小限に絞る
- public beta を見据えるなら、progress broadcast の coalescing と COM tick の適応化はほぼ必須

## 関連

- [docs/cloudflare-migration-plan.md](cloudflare-migration-plan.md)
- [docs/architecture.md](architecture.md)
- [docs/current-implementation.md](current-implementation.md)
- issue #21
- issue #22
