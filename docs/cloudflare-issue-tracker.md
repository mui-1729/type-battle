# Cloudflare Migration Issue Tracker

## 目的

issue #21 の親 Issue として、#7 から #20 と #22 の担当、依存関係、merge 順、conflict risk、完了シグナルを repo 内に固定する。

この文書は実装そのものではなく、Cloudflare realtime 移行を 4 人で並行して進めるための tracking document として使う。

## 現在の判定

2026-07-09 時点では、Cloudflare Worker / Durable Object が active realtime backend になっている。

- active path: `apps/cloudflare-worker` の Worker / Durable Object gateway
- web adapter: Cloudflare WebSocket transport のみ
- persistence: Durable Object storage に room snapshot / guest session / match result を保存する
- cleanup: `apps/realtime` と Socket.IO dependency は削除済み

`apps/cloudflare-worker` は client command の authoritative processing、room lifecycle、match progression、timer、COM、persistence を扱う。

## 4 人体制

| 担当 | Issue | 主な範囲 | 主なファイル | 注意 |
| --- | --- | --- | --- | --- |
| 人A: Cloudflare 基盤 / deploy | #7, #8, #18, #22 | architecture, Worker skeleton, Wrangler, deploy docs, free tier audit | `docs/*`, `apps/cloudflare-worker/*`, root `package.json`, `package-lock.json` | `package-lock.json` と `wrangler.toml` は他担当と同期する |
| 人B: domain / room engine | #9, #10 | message contract, runtime-neutral room engine | `packages/shared/*`, shared tests | room engine の契約変更は Cloudflare worker / web adapter と同期する |
| 人C: Cloudflare realtime backend | #11, #12, #13, #14, #15 | Durable Object room lifecycle, match progression, timers, COM, persistence | `apps/cloudflare-worker/*`, D1 migrations, Worker `Env` | #12 以降は #10 / #11 の API に依存する |
| 人D: web integration / test / cutover | #16, #17, #19, #20 | web transport adapter, Cloudflare E2E, cutover, cleanup | `apps/web/*`, `.env.example`, README / docs | `apps/web/app/page.tsx` の transport 変更は E2E と合わせる |

## Issue matrix

| Order | Issue | Status | Owner | Depends on | Completion signal | Conflict risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | #7 Cloudflare 構成整理 | Closed | 人A | none | `docs/cloudflare-migration-plan.md` で現行/目標構成と主要リスクを説明できる | docs drift |
| 1 | #22 free tier audit | Closed | 人A | #7 | `docs/cloudflare-free-tier-audit.md` で request/message 見積もりと follow-up が説明できる | Cloudflare limits の更新 |
| 2 | #8 Worker skeleton | Closed | 人A | #7 | `apps/cloudflare-worker` が typecheck/test でき、`/health` と room route を確認できる | root lockfile, wrangler config |
| 3 | #9 transport contract | Closed | 人B | #8 | shared の Cloudflare envelope で gameplay action を表現できる | shared exports |
| 4 | #10 room engine extraction | Closed | 人B | #9 | runtime-neutral engine を Cloudflare 側から参照できる | room engine API |
| 5 | #11 DO room WebSocket | Closed | 人C | #10 | room code ごとに同じ Durable Object へ route され、同 room に broadcast できる | `apps/cloudflare-worker/wrangler.toml` |
| 6 | #12 room lifecycle | Complete in final migration PR | 人C | #11 | Cloudflare path で create / join / reload rejoin / rematch が動く | Worker state shape |
| 7 | #13 match progression | Complete in final migration PR | 人C | #12 | Cloudflare path で race / timeAttack / hpBattle が開始・終了できる | room engine API |
| 8 | #14 timers / COM | Complete in final migration PR | 人C | #13, #22 | countdown, COM tick, disconnect grace, forfeit が DO 側 authority で動く | timer behavior, free tier request count |
| 9 | #15 persistence | Complete in final migration PR | 人C | #13, #14, #22 | guest session と match result が保存され、保存失敗でも active match が落ちない | DO storage |
| 10 | #16 web Cloudflare adapter | Closed | 人D | #9 | Cloudflare transport で web が room flow を実行できる | `apps/web/app/page.tsx` |
| 11 | #17 Cloudflare integration/E2E | Complete in final migration PR | 人D | #16, #12-#14 | Cloudflare path の create / join / complete / COM / reload / disconnect が自動テストで通る | Playwright setup |
| 12 | #18 deploy wiring | Complete in final migration PR | 人A | #16, #17 | reviewer が documented commands で Worker と frontend を deploy できる | secrets, hosting provider decision |
| 13 | #19 Cloudflare default cutover | Complete in final migration PR | 人D | #17, #18 | local/dev/hosted default が Cloudflare transport になり、`apps/realtime` なしで動く | env defaults |
| 14 | #20 Socket.IO cleanup | Complete in final migration PR | 人D | #19 | runtime code が Socket.IO を import せず、docs が Cloudflare active backend と説明する | dependency cleanup |

## Merge 順

1. #7 / #22: docs と free-tier risk を先に固定する
2. #8: Worker workspace と Wrangler 設定を追加する
3. #9: Cloudflare WebSocket message contract を固定する
4. #10: room engine を runtime-neutral にする
5. #11 / #12: Durable Object room route と lifecycle を実装する
6. #13 / #14: match progression、timers、COM を実装する
7. #15: guest session と match result persistence を追加する
8. #16: web transport adapter を入れる
9. #17: Cloudflare path の integration / E2E coverage を追加する
10. #18: Worker と frontend の deploy 手順を固定する
11. #19: default realtime transport を Cloudflare にする
12. #20: 旧 Socket.IO server と dependency を削除する

## Conflict 管理

- `apps/web/app/page.tsx`: 人Dのみが触る。
- `apps/cloudflare-worker/wrangler.toml`: 人A と 人C が変更前に同期する。
- `packages/shared/src/index.ts`: 人Bが主担当。人C/Dは #9/#10 後に追従する。
- `package-lock.json`: 人Aが主担当。依存追加 PR を同時に複数出さない。

## #20 完了時の active backend 定義

#20 が完了したと言える条件は次の通り。

- Cloudflare transport が既定値になっている。
- hosted deployment が別 Node.js realtime server を必要としない。
- runtime code が `socket.io` / `socket.io-client` を import していない。
- README / architecture docs が Cloudflare Worker / Durable Object を active realtime backend として説明している。
- Cloudflare path の E2E と CI が通っている。

## 関連

- [cloudflare-migration-plan.md](cloudflare-migration-plan.md)
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md)
- [features/deployment-private-beta.md](features/deployment-private-beta.md)
- issue #21
