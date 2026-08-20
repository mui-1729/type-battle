# Public Beta 負荷ベースライン

Public Beta 前に、Cloudflare Realtime backend の基本的な同時利用を同じ条件で再計測するための手順です。

この script は **stress test ではありません**。1 room 2 clients の通常操作を少数 room で並列実行し、room setup の成功率と latency を記録します。

## 安全ルール

- 自分が管理・許可している Worker にだけ実行する。
- `localhost` / `127.0.0.1` / `::1` / `*.workers.dev` 以外には script 自体が接続しない。
- `TYPE_BATTLE_LOAD_CONFIRM=I_OWN_THIS_TARGET` を明示しない限り実行しない。
- `LOAD_ROOMS` は最大20。最大でも40 WebSocket接続に制限する。
- CI から自動実行しない。
- 第三者サービスや許可を得ていない環境には実行しない。

## 実行内容

各 room で次を行います。

1. host / guest の2 WebSocketを接続
2. host が room を作成
3. guest が参加
4. 2人を ready にする
5. host が match start
6. `server:match:started` を確認
7. 両 client が短い typing input を送信
8. server-authoritative progress が進むことを確認
9. room から退出し socket を閉じる

room 同士は並列ですが、同一 room 内の create → join は順序化しています。

## 実行例

まずローカル Worker を起動します。

```bash
npm run dev --workspace @type-battle/cloudflare-worker
```

別 terminal で:

```bash
CLOUDFLARE_WORKER_URL=http://127.0.0.1:8787 \
TYPE_BATTLE_LOAD_CONFIRM=I_OWN_THIS_TARGET \
LOAD_ROOMS=5 \
npm run load:baseline --workspace @type-battle/cloudflare-worker
```

JSON を保存する場合:

```bash
CLOUDFLARE_WORKER_URL=https://<owned-worker>.workers.dev \
TYPE_BATTLE_LOAD_CONFIRM=I_OWN_THIS_TARGET \
LOAD_ROOMS=10 \
LOAD_OUTPUT=load-baseline.json \
npm run load:baseline --workspace @type-battle/cloudflare-worker
```

## 環境変数

| 変数 | 必須 | 既定値 | 制限 |
| --- | --- | --- | --- |
| `CLOUDFLARE_WORKER_URL` | yes | なし | localhost または `*.workers.dev` |
| `TYPE_BATTLE_LOAD_CONFIRM` | yes | なし | `I_OWN_THIS_TARGET` 固定 |
| `LOAD_ROOMS` | no | `5` | `1..20` |
| `LOAD_TIMEOUT_MS` | no | `20000` | `5000..60000` |
| `LOAD_OUTPUT` | no | なし | summary JSON の保存先 |

## 出力

summary には最低限次が含まれます。

- target origin
- 開始 / 終了時刻
- requested / succeeded / failed room 数
- 最大接続試行数
- setup latency の min / p50 / p95 / max
- failure reason ごとの件数
- 成功 room ごとの room code / setup latency

失敗 room が1件でもある場合は exit code 1 にします。

## Production で記録するもの

#167 が完了し Production deploy が再現可能になった後、実測時には次を Issue #238 に残します。

- 実行日
- Worker の commit SHA
- `LOAD_ROOMS` / timeout
- script summary JSON
- Cloudflare 側の request / Durable Object / WebSocket / storage metrics
- 可能なら当該時間帯の cost / usage
- failure があった場合のログと原因

## この計測で分からないこと

この harness は Public Beta の最終容量を保証しません。特に次は別の観測・試験が必要です。

- 長時間接続
- 大量 typing event を継続した場合の負荷
- COM timer が多数動く場合
- 地域差・ネットワーク遅延
- 長期 storage / cost
- abuse traffic

まず小さい再現可能な基準値を作り、実測に応じて試験条件を段階的に増やします。
