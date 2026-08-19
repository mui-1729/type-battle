# Cloudflare Realtime 移行 Issue 記録

この文書は、Cloudflare Realtime 移行時に使った Issue #7〜#22 の分担・依存関係・merge 順を残す**完了済みの履歴**です。

現在の作業一覧としては使いません。現行の Open Issue は [features/feature-backlog.md](features/feature-backlog.md)、現在の構成は [architecture.md](architecture.md) を参照してください。

## 結果

Cloudflare Realtime 移行は完了しています。

- Cloudflare Worker / Durable Object が active realtime backend
- room code ごとの `RoomAuthorityDurableObject` が room authority
- Web は Cloudflare WebSocket transport を使用
- room snapshot / guest session / match result は Durable Object storage を利用
- 旧 Node.js / Socket.IO realtime server は削除済み
- Cloudflare transport の integration / E2E がある

## 当時の Issue 構成

| 領域 | Issue | 内容 | 状態 |
| --- | --- | --- | --- |
| 調査・基盤 | #7 / #8 / #22 | 構成調査、Worker skeleton、Free Tier 監査 | 完了 |
| Shared domain | #9 / #10 | message contract、runtime-neutral room logic | 完了 |
| Worker backend | #11〜#15 | room lifecycle、match、timer、COM、persistence | 完了 |
| Web / cutover | #16〜#20 | Web adapter、E2E、deploy wiring、cutover、Socket.IO cleanup | 完了 |
| 全体追跡 | #21 | 分担・依存・merge 順の tracking | 完了 |

## 当時の merge 順

移行時は、依存関係を壊さないため次の順を基準にしました。

1. 構成調査 / Free Tier 監査
2. Worker skeleton
3. shared message contract
4. room logic の runtime-neutral 化
5. Durable Object room route / lifecycle
6. match progression / timers / COM
7. persistence
8. Web transport adapter
9. Cloudflare integration / E2E
10. deploy wiring
11. Cloudflare への既定切替
12. Socket.IO cleanup

この順番は**移行当時の履歴**であり、現在の PR をこの順に進めるルールではありません。

## 当時の conflict 管理

大規模移行では同じファイルへ変更が集中したため、担当を分けていました。

主な競合箇所:

- `apps/web/app/page.tsx`
- `apps/cloudflare-worker/wrangler.toml`
- `packages/shared/src/index.ts`
- `package-lock.json`

現在は Cloudflare 移行が完了しているため、この担当固定ルールは一般運用には適用しません。現在の Git / PR ルールは [git-branch-rules.md](git-branch-rules.md) を参照してください。

## 移行完了の判定

移行完了時には次を満たしました。

- Cloudflare transport が既定 Realtime backend になっている
- hosted deployment が別 Node.js Realtime server を必要としない
- runtime code が Socket.IO に依存しない
- Web / Worker が shared contract を利用する
- Cloudflare path の自動テストがある
- docs が Cloudflare Worker / Durable Object を active backend と説明する

## 現在の Cloudflare 関連作業

現在残っているのは「移行」ではなく「運用・公開確認」です。

- #167 Production deploy 用 Secrets / Variables
- #168 Preview Realtime environment の実デプロイ・確認
- #232 Production での Private Beta 受け入れ確認

## 関連

- [cloudflare-migration-plan.md](cloudflare-migration-plan.md): 移行時の設計判断と結果
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md): 移行時点の容量監査
- [architecture.md](architecture.md): 現在の構成
- [features/deployment-private-beta.md](features/deployment-private-beta.md): 現在の deploy / release 手順
