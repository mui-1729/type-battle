# テスト・CI・CD 規定

## 目的

オンライン対戦では「自分の画面では動く」だけでは不十分です。

Type Battle では、pure logic → Worker / Durable Object → browser flow → Production acceptance の順に検証し、問題が起きた時にどの層で壊れたか追えるようにします。

## 基本方針

- `main` は常に build 可能な状態にする
- PR は CI green を merge 条件にする
- game logic の変更は unit / integration test を更新する
- Realtime contract の変更は shared type と Worker / Web の両方を確認する
- user-visible な主要フロー変更は Playwright E2E を更新する
- bug fix では可能な範囲で回帰テストを追加する
- Production deploy 後は smoke / acceptance を自動テストとは別に確認する

## ローカルの基本チェック

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

対戦・Realtime・主要 UI を触った場合は次も実行します。

```bash
npm run test:e2e
```

## テストの役割

### Unit Test

対象例:

- scoring
- typing validation
- sequence / stale input handling
- room state transition
- prompt validation
- rate limit helper
- COM progress
- room TTL
- reconnect grace
- battle rule helper
- UI pure helper / view model

pure function と boundary condition を優先します。

### Worker / Integration Test

対象例:

- room create / join / leave
- countdown / start
- typing progress / result
- disconnect / reconnect / forfeit
- COM
- `race` / `timeAttack` / `hpBattle`
- rate limit
- persistence / restore
- room cleanup
- protocol validation

shared event contract と Durable Object state の境界を確認します。

### Runtime / Persistence Test

Durable Object storage を含む state が restart / restore 後にも壊れないことを確認します。

特に:

- room snapshot
- player identity
- result
- round / timer
- typing internal state

を重視します。

### E2E

Playwright で browser から主要フローを確認します。

現在の主な対象:

- room 作成・参加
- 2 player completion
- COM match
- reload rejoin
- long disconnect forfeit
- rematch
- practice / daily
- settings
- mobile typing
- iOS / WebKit の viewport / focus 回帰

E2E では実装内部ではなく、ユーザーが操作できることを確認します。

## CI

GitHub Actions の `ci` を `main` の required status check にします。

基本ステップ:

1. install
2. lint
3. typecheck
4. unit / integration test
5. build
6. Playwright E2E

### Dependency audit

#193 の production dependency audit gate は `main` に実装済みです。production dependency に high / critical vulnerability が入った場合に CI で検知します。

方針:

- `npm audit --omit=dev` を production risk の基本判定にする
- dev-only vulnerability と production vulnerability を分ける
- `npm audit fix --force` を無条件に実行しない
- toolchain の breaking update を vulnerability 件数だけで強制しない

## Branch protection

`main` は repository ruleset で保護します。

- Pull Request 必須
- `ci` 成功必須
- force push 禁止
- deletion 禁止

詳細は [github.md](github.md) を参照してください。

## Web deployment

Web は Vercel の Git integration を使います。

Production と Preview で Realtime backend を混ぜないことを原則にします。

Preview 専用 Realtime 構成は #168 として `main` に実装済みですが、credentials が未設定のため Preview Worker は未デプロイです。外部 deploy と 2 client 確認が残ります。

## Worker deployment

Worker は `.github/workflows/deploy-cloudflare-worker.yml` を使います。

基本フロー:

1. `main` の CI が成功する
2. deploy 対象 commit SHA を指定する
3. production Environment の保護を通す
4. Cloudflare Worker を deploy する
5. `/health` / WebSocket smoke を確認する
6. `/health.commitSha` と deploy 対象 commit を照合する

Production 用 Secrets / Variables の外部設定は #167 で追跡します。2026-08-22 時点の Production Worker は `ae61854` で `main` より 34 commits 遅れているため、#167 完了後に current `main` を deploy し、#232 で `/health.commitSha` を確認します。

## Rollback

Worker は直前の既知 commit SHA を同じ deploy workflow で再 deploy できるようにします。

Web は Vercel の既知の正常 deployment へ戻します。

storage schema を変更する場合は、前の code version が読める backward compatibility を優先します。

## Private Beta のリリース基準

### コード側

- [x] 2 player E2E
- [x] COM E2E
- [x] reload / reconnect のテスト
- [x] long disconnect / forfeit のテスト
- [x] structured logging
- [x] room TTL / retention
- [x] rate limit / socket limits
- [x] Worker deploy workflow
- [x] branch protection

### Production 運用側

- [ ] #167 Production deploy Secrets / Variables
- [ ] #232 Production acceptance

#232 では次を確認します。

- Web / health / readiness / WebSocket
- 2 人対戦
- COM
- reconnect / forfeit
- rematch
- PC / mobile
- 5〜10 試合の連続プレイ
- 問題発生時に log から追跡できること

この確認が終わるまで、Private Beta を「公開確認済み」とは扱いません。

## Public Beta 前に追加する品質ゲート

- #238 load baseline（手動実行のみ。自動 stress test は禁止）
- hard cap: 20 simultaneous rooms / 40 WebSocket connections
- simultaneous room / connection / message rate の目安
- cost baseline
- abuse monitoring / alert
- moderation flow E2E
- public matchmaking E2E
- 実装済み terms / privacy / contact の公開確認

Cloudflare Workers Free と Vercel Hobby だけを利用します。paid-only の monitoring、log drain、spend control、自動 scale-up を前提にせず、各 dashboard の usage / error を手動監視し、quota 枯渇前に新規対戦受付停止または既知の正常 deployment へ rollback します。load harness は CI、Nightly、scheduled job から自動実行しません。

Nightly / scheduled test は通常の回帰テストに限り、Free tier の外部環境へ継続負荷を発生させない範囲で導入を判断します。

## Flaky test の扱い

- retry や skip を先に追加しない
- application bug か test harness の不安定性か切り分ける
- regression detection を落とさずに flaky な assertion だけを修正する
- 無効化が必要なら理由と復旧条件を Issue に残す

## リファクタ時の品質基準

#197 / #198 のような大きな責務分割では、user-visible behavior を変えずに進めます。

- 既存テストを先に維持する
- pure function / controller 単位の test を追加する
- 一度に全面置換しない
- terminal state / reconnect / persistence の不変条件を優先する
