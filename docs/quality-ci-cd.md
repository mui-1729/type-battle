# Test / Build / CI / CD 規定

## 目的

内輪で遊ぶ private beta から、将来の public beta へ進めるために、動作確認を属人的にしない。特にオンライン対戦では「自分の画面では動く」だけでは不十分なため、unit、integration、E2E、deploy check を段階的に整える。

## 基本方針

- `main` は常に build 可能な状態にする。
- 実装 PR は lint、typecheck、test、build を通す。
- 対戦ロジックの変更は unit test を必須にする。
- Socket.IO event payload の変更は shared type と integration test を更新する。
- UI の主要フロー変更は Playwright E2E を更新する。
- private beta への deploy は `main` への merge 後に行う。
- public beta 以降は staging と production を分ける。

## npm scripts 規定

実装開始後、root `package.json` に次の scripts を用意する。

```json
{
  "scripts": {
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "playwright test",
    "build": "turbo build",
    "ci": "npm run lint && npm run typecheck && npm run test && npm run build"
  }
}
```

monorepo を使わない初期実装の場合でも、同じ script 名を維持する。

## テスト規定

### Unit Test

対象:

- scoring
- typing validation
- room state transition
- room code generation
- nickname validation
- rate limit helper
- COM progress
- room TTL / expiration
- reconnect grace period

基準:

- pure function は原則 unit test を書く。
- 勝敗、WPM、accuracy、finish validation は境界値を含める。
- bug fix は再発防止 test を追加する。

### Integration Test

対象:

- Socket.IO event handler
- room create / join / leave
- countdown / start
- progress sync
- finish / result
- disconnect / reconnect
- COM match
- rate limit behavior
- room expiration cleanup

基準:

- shared event type を使って payload を検証する。
- 2 client 以上を接続する test を含める。
- 不正な room code、重複参加、試合中参加などの失敗ケースを含める。

### E2E Test

対象:

- guest nickname 入力
- room 作成
- room code 参加
- countdown
- 2 player typing
- COM typing
- reload rejoin
- disconnect display
- result 表示
- rematch

基準:

- Playwright の 2 browser context で対戦を再現する。
- MVP 完了条件として、2 player E2E が 1 本以上 green であること。
- private beta 前に disconnect / reload の E2E を追加する。
- COM fallback を触る PR では COM match E2E を更新する。
- room lifecycle を触る PR では reload / expiration E2E を更新する。

### Load / Smoke Test

private beta では軽い smoke test を行う。

- health endpoint
- Web UI 表示
- Socket.IO 接続
- room create / join
- COM match
- reload rejoin

public beta 前に load test を追加する。

- 同時 room 数
- 同時接続数
- progress event rate
- Redis Adapter 使用時の multi server 動作

## Build 規定

### Local

開発中に最低限確認する。

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

対戦フローを触った場合は次も実行する。

```bash
npm run test:e2e
```

### CI

CI では次を順に実行する。

1. install
2. lint
3. typecheck
4. unit / integration test
5. build
6. Playwright E2E

E2E は初期は PR ごとに実行する。実行時間が重くなったら、軽量 smoke E2E を PR、完全 E2E を nightly または main merge 後に分ける。

## GitHub Actions 規定

### Pull Request CI

対象:

- `main` への pull request

実行:

- Node.js LTS
- dependency install
- lint
- typecheck
- test
- build
- Playwright E2E

失敗時:

- merge しない。
- flaky test は原因を調べ、無効化する場合は Issue を作る。

### Main CI

対象:

- `main` push

実行:

- Pull Request CI と同等
- Vercel の production deployment は Git integration 側で実行する

### Nightly

public beta を目指す段階で追加する。

- full E2E
- load smoke
- dependency audit
- longer reconnect tests

## CD 規定

### Local MVP

- CD は不要。
- ローカルで `npm run dev` と E2E を通す。

### Private Beta

- `main` merge 後、Vercel の production deployment を基本にする。
- web deploy 先は private beta 用 URL とする。
- web deploy 後に smoke test を実行する。
- realtime は当面 external deploy しないか、別途運用を決める。

### Public Beta

- staging と production を分ける。
- `main` は staging deploy。
- production deploy は tag または手動 approval を使う。
- DB migration は deploy 前後の手順を明記する。

## Branch Protection

実装開始後、GitHub の `main` に次を設定する。

- pull request 必須
- CI 成功必須
- force push 禁止
- deletion 禁止
- 可能なら linear history

個人開発中は厳しすぎる設定にしない。private beta が始まる前に branch protection を有効化する。

## リリース基準

### MVP 完了

- 2 player E2E が通る。
- scoring unit test が通る。
- room state integration test が通る。
- local build が通る。

### Private Beta 公開

- deploy 後 smoke test が通る。
- 5-10 試合の手動確認で重大な同期崩れがない。
- disconnect / reload の最低限の挙動が決まっている。
- ログで room lifecycle を追える。
- room TTL が設定されている。
- room create / join / typing progress の rate limit がある。
- COM match がデプロイ環境で動く。

### Public Beta 公開

- staging / production が分かれている。
- rate limit と abuse 対策がある。
- monitoring と alert の最低限がある。
- terms / privacy / contact がある。
- load test の基準を満たす。
