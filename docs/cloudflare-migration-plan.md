# Cloudflare Realtime 移行記録

この文書は、Realtime backend を旧 Node.js / Socket.IO 構成から Cloudflare Worker / Durable Object へ移したときの設計判断と移行手順を残す**完了済みの記録**です。

現在の構成を確認するときは [architecture.md](architecture.md)、現在の実装状態は [current-implementation.md](current-implementation.md) を正として扱います。

## 移行結果

Cloudflare への Realtime 移行は完了しています。

現在の基本構成:

```txt
Browser
  |
  | HTTPS
  v
Next.js Web App on Vercel
  |
  | WebSocket
  v
Cloudflare Worker
  |
  | room code ごとの Durable Object
  v
RoomAuthorityDurableObject
  |
  | Durable Object storage
  v
room snapshot / guest session / match result
```

旧 `apps/realtime` と Socket.IO runtime dependency は削除済みです。

## 移行で採用した判断

### Web は Vercel を維持

Realtime 移行と Web hosting 移行を同時に行うと変更範囲が大きくなるため、Web は Next.js / Vercel を維持しました。

Cloudflare は Realtime backend と room authority に集中させています。

### 1 room 1 Durable Object

対戦中の次の状態は room code ごとの Durable Object が authority になります。

- player join / leave / reconnect
- ready / countdown / playing / finished
- typing input の検証
- COM progress
- disconnect / forfeit
- rematch
- result 確定

room 内で順序が重要な状態を 1 か所に集めることで、複数 runtime 間の競合を避けます。

### client payload を信用しない

現在は client が `input + sequence` を送信し、server 側が prompt に対して進捗・WPM・accuracy・mistake 等を更新します。

旧設計にあった「client が計算済み progress を送る」方式は現行構成では使いません。

### 永続化を hot path から分離

room snapshot は Durable Object storage へ保存しますが、typing 1 回ごとに長期分析用データを書き込む構成にはしていません。

guest session / match result と、将来のランキング・分析用途は同じ責務として扱わず、Public Beta で必要になった時点で再設計します。

## 当時の移行フェーズ

移行はおおむね次の順で進めました。

1. Cloudflare 構成と制約を調査
2. shared message contract を作成
3. runtime-neutral な room logic を整理
4. Worker / Durable Object の room lifecycle を実装
5. countdown / typing / COM / disconnect / persistence を移植
6. Web に Cloudflare WebSocket transport を接続
7. Cloudflare transport の integration / E2E を追加
8. Cloudflare を既定 Realtime backend に切り替え
9. 旧 Socket.IO server を削除

当時の Issue の対応関係は [cloudflare-issue-tracker.md](cloudflare-issue-tracker.md) に残しています。

## 現在も有効な設計原則

- room 内の強整合状態は room authority に集約する
- Web UI と Realtime transport の責務を分ける
- shared message contract を Web / Worker で共有する
- client の result / progress をそのまま最終結果として信用しない
- storage failure と live match failure を可能な限り分離する
- Realtime / shared contract を変更したら integration / E2E も確認する

## 現在の残課題とは分けて考える

Cloudflare への**移行自体は完了**しています。

現在残っている Cloudflare 関連作業は移行ではなく運用です。

- #167 Production deploy 用 Secrets / Variables の設定
- #168 Preview 用 Realtime environment の実運用確認
- #232 Production での Private Beta 受け入れ確認

これらは [features/deployment-private-beta.md](features/deployment-private-beta.md) と [roadmap.md](roadmap.md) で追跡します。

## Free Tier について

移行時点の概算は [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md) に保存しています。

Cloudflare の料金・上限は変更される可能性があるため、今後の容量判断に過去の数値をそのまま使わず、その時点の公式仕様と実測値で再評価します。

## 関連

- [architecture.md](architecture.md)
- [current-implementation.md](current-implementation.md)
- [cloudflare-issue-tracker.md](cloudflare-issue-tracker.md)
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md)
- [features/deployment-private-beta.md](features/deployment-private-beta.md)
