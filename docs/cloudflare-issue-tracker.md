# Cloudflare Migration Issue Tracker

## 目的

issue #21 の親 Issue として、#7 から #20 と #22 の担当、依存関係、merge 順、conflict risk、完了シグナルを repo 内に固定する。

この文書は実装そのものではなく、Cloudflare realtime 移行を 4 人で並行して進めるための tracking document として使う。

## 現在の判定

2026-07-06 時点では、Cloudflare はまだ active realtime backend ではない。

- active path: `apps/realtime` の Node.js / Socket.IO server
- migration path: `apps/cloudflare-worker` の Worker / Durable Object skeleton
- web adapter: `NEXT_PUBLIC_REALTIME_TRANSPORT=cloudflare` で Cloudflare WebSocket を選べる
- cutover 条件: #17 / #18 / #19 が完了し、#20 で Socket.IO cleanup が終わること

`apps/cloudflare-worker` は room WebSocket と room-state relay の skeleton であり、client command の authoritative processing、match progression、timer、COM、persistence は #12 から #15 で積む。

## 4 人体制

| 担当 | Issue | 主な範囲 | 主なファイル | 注意 |
| --- | --- | --- | --- | --- |
| 人A: Cloudflare 基盤 / deploy | #7, #8, #18, #22 | architecture, Worker skeleton, Wrangler, deploy docs, free tier audit | `docs/*`, `apps/cloudflare-worker/*`, root `package.json`, `package-lock.json` | `package-lock.json` と `wrangler.toml` は他担当と同期する |
| 人B: domain / room engine | #9, #10 | message contract, runtime-neutral room engine, Socket.IO compatibility | `packages/shared/*`, `apps/realtime/src/rooms.ts`, realtime tests | `apps/realtime/src/rooms.ts` は単独担当にする |
| 人C: Cloudflare realtime backend | #11, #12, #13, #14, #15 | Durable Object room lifecycle, match progression, timers, COM, persistence | `apps/cloudflare-worker/*`, D1 migrations, Worker `Env` | #12 以降は #10 / #11 の API に依存する |
| 人D: web integration / test / cutover | #16, #17, #19, #20 | web transport adapter, Cloudflare E2E, cutover, Socket.IO cleanup | `apps/web/*`, `tests/*`, `.env.example`, README / docs, `apps/realtime/*` cleanup | `apps/web/app/page.tsx` と #20 cleanup は単独で扱う |

## Issue matrix

| Order | Issue | Status | Owner | Depends on | Completion signal | Conflict risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | #7 Cloudflare 構成整理 | Closed | 人A | none | `docs/cloudflare-migration-plan.md` で現行/目標構成と主要リスクを説明できる | docs drift |
| 1 | #22 free tier audit | Closed | 人A | #7 | `docs/cloudflare-free-tier-audit.md` で request/message 見積もりと follow-up が説明できる | Cloudflare limits の更新 |
| 2 | #8 Worker skeleton | Closed | 人A | #7 | `apps/cloudflare-worker` が typecheck/test でき、`/health` と room route を確認できる | root lockfile, wrangler config |
| 3 | #9 transport contract | Closed | 人B | #8 | shared の Cloudflare envelope で gameplay action を表現できる | shared exports |
| 4 | #10 room engine extraction | Closed | 人B | #9 | runtime-neutral engine を Socket.IO server と Cloudflare 側から参照できる | `apps/realtime/src/rooms.ts` |
| 5 | #11 DO room WebSocket | Closed | 人C | #10 | room code ごとに同じ Durable Object へ route され、同 room に broadcast できる | `apps/cloudflare-worker/wrangler.toml` |
| 6 | #12 room lifecycle | Open | 人C | #11 | Cloudflare path で create / join / reload rejoin / rematch が動く | Worker state shape |
| 7 | #13 match progression | Open | 人C | #12 | Cloudflare path で race / timeAttack / hpBattle が開始・終了できる | room engine API |
| 8 | #14 timers / COM | Open | 人C | #13, #22 | countdown, COM tick, disconnect grace, forfeit が DO 側 authority で動く | timer behavior, free tier request count |
| 9 | #15 persistence | Open | 人C | #13, #14, #22 | guest session と match result が保存され、保存失敗でも active match が落ちない | D1 binding, migrations |
| 10 | #16 web Cloudflare adapter | Closed | 人D | #9 | Socket.IO と Cloudflare transport を env で切替できる | `apps/web/app/page.tsx` |
| 11 | #17 Cloudflare integration/E2E | Open | 人D | #16, #12-#14 | Cloudflare path の create / join / complete / COM / reload / disconnect が自動テストで通る | Playwright setup |
| 12 | #18 deploy wiring | Open | 人A | #16, #17 | reviewer が documented commands で Worker と frontend を deploy できる | secrets, hosting provider decision |
| 13 | #19 Cloudflare default cutover | Open | 人D | #17, #18 | local/dev/hosted default が Cloudflare transport になり、`apps/realtime` なしで動く | env defaults, rollback |
| 14 | #20 Socket.IO cleanup | Open | 人D | #19 | runtime code が Socket.IO を import せず、docs が Cloudflare active backend と説明する | deletion PR, dependency cleanup |

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
- `apps/realtime/src/rooms.ts`: 人Bのみが触る。
- `apps/cloudflare-worker/wrangler.toml`: 人A と 人C が変更前に同期する。
- `packages/shared/src/index.ts`: 人Bが主担当。人C/Dは #9/#10 後に追従する。
- `package-lock.json`: 人Aが主担当。依存追加 PR を同時に複数出さない。
- #20 cleanup は #19 後に単独 PR として出す。

## #20 完了時の active backend 定義

#20 が完了したと言える条件は次の通り。

- `NEXT_PUBLIC_REALTIME_TRANSPORT` の既定値が Cloudflare になっている。
- hosted deployment が `apps/realtime` の Node.js server を必要としない。
- runtime code が `socket.io` / `socket.io-client` を import していない。
- README / architecture docs が Cloudflare Worker / Durable Object を active realtime backend として説明している。
- Cloudflare path の E2E と CI が通っている。

## 関連

- [cloudflare-migration-plan.md](cloudflare-migration-plan.md)
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md)
- [features/deployment-private-beta.md](features/deployment-private-beta.md)
- issue #21
