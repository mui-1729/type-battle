# Cloudflare Migration Plan

`type-battle` を Cloudflare 前提で外部公開できる構成へ移行するための予定。

最優先条件:

- 無料枠のみで開始できること
- Cloudflare だけで Web 配信、API、WebSocket、room state、timer、永続化をできるだけ包含すること
- 実装量が増えても、realtime 対戦の authoritative state を明確に保つこと

## Target Architecture

```txt
Cloudflare Pages
  -> Next.js web frontend

Cloudflare Worker
  -> HTTP API
  -> WebSocket upgrade
  -> room Durable Object routing

Durable Object per room
  -> authoritative room state
  -> players
  -> progress
  -> countdown
  -> bot tick
  -> disconnect grace / forfeit
  -> broadcast to room sockets

Durable Object SQLite or D1
  -> guest sessions
  -> match results
  -> optional room event audit
```

## Migration Policy

- Keep existing Socket.IO implementation working until the Cloudflare path has E2E coverage.
- Add Cloudflare code beside the current `apps/realtime` server first, then switch the web client.
- Keep shared game types in `packages/shared`; move transport-specific types out of the core model where useful.
- Each issue should map to one branch and one PR unless the issue is explicitly a tracking issue.
- PRs should stay independently reviewable and avoid mixing infrastructure, game logic, and UI rewrites.

## Issue And PR Plan

### Issue 1: Document Cloudflare architecture and free-tier constraints

Branch:

- `docs/cloudflare-architecture-plan`

PR:

- `docs: add Cloudflare migration architecture plan`

Scope:

- Capture the target Cloudflare architecture.
- Record known free-tier constraints and where the project can exceed them.
- Define which Cloudflare products are in scope.

Deliverables:

- `docs/cloudflare-migration-plan.md`
- Optional update to `docs/architecture.md`

Acceptance Criteria:

- The target architecture is documented.
- The migration can be split into implementation PRs.
- Risks around Durable Object limits, D1 limits, and local dev are listed.

Dependencies:

- None.

### Issue 2: Add Cloudflare worker workspace skeleton

Branch:

- `chore/cloudflare-worker-skeleton`

PR:

- `chore: add Cloudflare worker skeleton`

Scope:

- Add a new workspace for the Cloudflare runtime.
- Add Wrangler configuration for local development.
- Add a minimal health route.
- Keep current `apps/realtime` unchanged.

Suggested files:

- `apps/cloudflare-worker/package.json`
- `apps/cloudflare-worker/src/index.ts`
- `apps/cloudflare-worker/wrangler.toml`
- `apps/cloudflare-worker/tsconfig.json`

Acceptance Criteria:

- `npm run typecheck -w @type-battle/cloudflare-worker` passes.
- `wrangler dev` can serve a health endpoint locally.
- No web client behavior changes.

Dependencies:

- Issue 1.

### Issue 3: Define Cloudflare transport contract

Branch:

- `feat/cloudflare-transport-contract`

PR:

- `feat: define Cloudflare realtime transport contract`

Scope:

- Define WebSocket request / response envelopes for Cloudflare.
- Replace Socket.IO ack assumptions with explicit message IDs and response messages.
- Keep domain types shared with existing implementation.

Suggested contracts:

- `client:room:create`
- `client:room:join`
- `client:room:leave`
- `client:player:ready`
- `client:room:setPromptCategory`
- `client:room:setBotDifficulty`
- `client:room:setMatchRule`
- `client:match:start`
- `client:typing:progress`
- `client:typing:finish`
- `client:match:rematch`
- `server:ack`
- `server:room:state`
- `server:match:countdown`
- `server:match:started`
- `server:match:result`
- `server:error`

Suggested files:

- `packages/shared/src/cloudflare-events.ts`
- `packages/shared/src/index.ts`

Acceptance Criteria:

- The transport contract is typed.
- Existing Socket.IO event types still compile.
- Cloudflare messages can represent all existing gameplay actions.

Dependencies:

- Issue 2.

### Issue 4: Port room state logic to a runtime-neutral module

Branch:

- `refactor/room-engine-runtime-neutral`

PR:

- `refactor: extract runtime-neutral room engine`

Scope:

- Move core room state transitions out of `apps/realtime/src/rooms.ts`.
- Keep Socket.IO server using the extracted engine.
- Avoid Cloudflare-specific APIs in the engine.

Suggested files:

- `packages/shared/src/room-engine.ts` or `packages/game/src/*`
- Existing `apps/realtime/src/rooms.ts` becomes an adapter if needed.

Acceptance Criteria:

- Existing room unit tests pass.
- Socket.IO behavior stays compatible.
- The extracted engine can be called from Durable Objects.

Dependencies:

- Issue 3.

### Issue 5: Implement room Durable Object WebSocket routing

Branch:

- `feat/cloudflare-room-durable-object`

PR:

- `feat: add Durable Object room websocket routing`

Scope:

- Add a Durable Object class per room.
- Route `/rooms/:roomCode/socket` WebSocket upgrades to the correct Durable Object.
- Track connected sockets inside the Durable Object.
- Broadcast room state to all connected sockets.

Acceptance Criteria:

- A browser or test client can connect to a room WebSocket.
- Room messages are routed to exactly one Durable Object instance per room.
- Multiple clients in the same room receive the same broadcast.

Dependencies:

- Issue 4.

### Issue 6: Implement Cloudflare room lifecycle actions

Branch:

- `feat/cloudflare-room-lifecycle`

PR:

- `feat: implement room lifecycle in Durable Object`

Scope:

- Implement create, join, leave, reconnect, ready, host transfer, and rematch.
- Preserve existing guest id / session id behavior.
- Preserve room code behavior.

Acceptance Criteria:

- Two clients can create and join a room through the Cloudflare path.
- Reload rejoin works.
- Host leave transfers host or cleans up the room.
- Rematch resets state correctly.

Dependencies:

- Issue 5.

### Issue 7: Implement match progression, result, and rules

Branch:

- `feat/cloudflare-match-engine`

PR:

- `feat: implement match progression in Durable Object`

Scope:

- Implement match start, countdown, playing state, progress, finish, and result.
- Support `race`, `timeAttack`, and `hpBattle`.
- Preserve scoring output.

Acceptance Criteria:

- A two-player race can start and finish.
- Result ranking matches existing behavior.
- `timeAttack` ends at `matchEndsAt`.
- `hpBattle` damage and elimination work.

Dependencies:

- Issue 6.

### Issue 8: Implement Durable Object timers and bot play

Branch:

- `feat/cloudflare-room-timers-bot`

PR:

- `feat: add Cloudflare timers and bot play`

Scope:

- Move countdown transition to Durable Object timer logic.
- Implement bot tick.
- Implement disconnect grace and forfeit.
- Use Durable Object alarms where persistence across idle periods is needed.

Acceptance Criteria:

- Countdown moves to playing without a client-side authority.
- One-player match can start against COM.
- Bot progress is broadcast.
- Long disconnect causes forfeit after the configured grace period.

Dependencies:

- Issue 7.

### Issue 9: Add persistence for sessions and match results

Branch:

- `feat/cloudflare-persistence`

PR:

- `feat: persist sessions and match results on Cloudflare`

Scope:

- Choose Durable Object SQLite or D1 as the first persistence backend.
- Store guest sessions.
- Store match results.
- Keep schema small and migration-friendly.

Recommended first choice:

- Use D1 for cross-room records like `guest_sessions` and `match_results`.
- Keep active room state inside Durable Objects.

Acceptance Criteria:

- Guest sessions are written through the Cloudflare path.
- Match results are persisted.
- Persistence failures do not crash active matches.
- Local development has documented setup.

Dependencies:

- Issue 7.

### Issue 10: Add web client Cloudflare transport adapter

Branch:

- `feat/web-cloudflare-transport`

PR:

- `feat: add Cloudflare realtime transport adapter`

Scope:

- Add a transport abstraction in `apps/web`.
- Implement a Cloudflare WebSocket transport.
- Keep the Socket.IO transport available during migration.
- Add environment switch.

Suggested environment:

- `NEXT_PUBLIC_REALTIME_TRANSPORT=socketio|cloudflare`
- `NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=...`

Acceptance Criteria:

- Web can connect through the Cloudflare transport.
- Existing Socket.IO transport still works.
- Create, join, ready, start, progress, finish, and rematch use the adapter.

Dependencies:

- Issue 8.

### Issue 11: Add Cloudflare integration and E2E tests

Branch:

- `test/cloudflare-realtime-e2e`

PR:

- `test: add Cloudflare realtime integration coverage`

Scope:

- Add integration tests for the Durable Object room flow.
- Add Playwright coverage against the Cloudflare transport.
- Keep existing Socket.IO E2E until cutover.

Acceptance Criteria:

- Create / join / complete match passes through Cloudflare path.
- COM match passes through Cloudflare path.
- Reload rejoin passes through Cloudflare path.
- Long disconnect forfeit passes through Cloudflare path.

Dependencies:

- Issue 10.

### Issue 12: Add Cloudflare Pages deployment wiring

Branch:

- `chore/cloudflare-pages-deploy`

PR:

- `chore: add Cloudflare deployment wiring`

Scope:

- Add Cloudflare Pages build notes.
- Add Worker deployment notes.
- Document required environment variables.
- Decide whether the frontend stays on Vercel during migration or moves to Pages.

Acceptance Criteria:

- A reviewer can deploy the Worker from documented commands.
- A reviewer can deploy the frontend from documented commands.
- Production environment variables are listed.

Dependencies:

- Issue 10.

### Issue 13: Cut over from Socket.IO to Cloudflare

Branch:

- `feat/cutover-cloudflare-realtime`

PR:

- `feat: switch realtime default to Cloudflare`

Scope:

- Make Cloudflare the default realtime transport.
- Keep Socket.IO fallback for one release if useful.
- Update `.env.example`.
- Update README and architecture docs.

Acceptance Criteria:

- Default local/dev path can run Cloudflare transport.
- Hosted deployment no longer requires `apps/realtime`.
- CI passes.
- E2E passes on Cloudflare path.

Dependencies:

- Issue 11.
- Issue 12.

### Issue 14: Remove old Socket.IO realtime server

Branch:

- `chore/remove-socketio-realtime`

PR:

- `chore: remove Socket.IO realtime server`

Scope:

- Remove `apps/realtime` if no longer needed.
- Remove `socket.io` and `socket.io-client` dependencies if unused.
- Remove Dockerfile and smoke tests tied only to the old server.
- Update docs.

Acceptance Criteria:

- No runtime code imports Socket.IO.
- CI passes.
- Docs describe Cloudflare as the active realtime backend.

Dependencies:

- Issue 13.

## Tracking Issues

### Tracking Issue A: Cloudflare migration

Use this as the parent issue.

Checklist:

- Issue 1: Document Cloudflare architecture and free-tier constraints
- Issue 2: Add Cloudflare worker workspace skeleton
- Issue 3: Define Cloudflare transport contract
- Issue 4: Port room state logic to a runtime-neutral module
- Issue 5: Implement room Durable Object WebSocket routing
- Issue 6: Implement Cloudflare room lifecycle actions
- Issue 7: Implement match progression, result, and rules
- Issue 8: Implement Durable Object timers and bot play
- Issue 9: Add persistence for sessions and match results
- Issue 10: Add web client Cloudflare transport adapter
- Issue 11: Add Cloudflare integration and E2E tests
- Issue 12: Add Cloudflare Pages deployment wiring
- Issue 13: Cut over from Socket.IO to Cloudflare
- Issue 14: Remove old Socket.IO realtime server

### Tracking Issue B: Cloudflare free-tier risk audit

Questions to answer before public beta:

- What happens when Durable Object request limits are exceeded?
- How many messages does one two-player match generate?
- How many concurrent rooms fit inside the free-tier request budget?
- Is D1 free-tier enough for guest sessions and match results?
- Are bot ticks too chatty for the request budget?
- Should progress broadcasts be throttled or coalesced?

## Suggested Milestones

### Milestone 1: Cloudflare foundation

Issues:

- Issue 1
- Issue 2
- Issue 3

Outcome:

- Cloudflare runtime exists.
- Message contract exists.
- No gameplay behavior has changed.

### Milestone 2: Room actor parity

Issues:

- Issue 4
- Issue 5
- Issue 6

Outcome:

- Durable Object can own a room.
- Create, join, leave, reconnect, and rematch work.

### Milestone 3: Match parity

Issues:

- Issue 7
- Issue 8
- Issue 9

Outcome:

- Matches can start, progress, finish, persist, timeout, and run against COM.

### Milestone 4: Web cutover

Issues:

- Issue 10
- Issue 11
- Issue 12
- Issue 13

Outcome:

- Hosted app can run without the old realtime server.

### Milestone 5: Cleanup

Issues:

- Issue 14

Outcome:

- Socket.IO realtime server is removed.
- Cloudflare is the single realtime backend.

## Implementation Notes

- Durable Object should be the authority for active room state.
- D1 should store cross-room durable records first, not hot per-keystroke state.
- Progress messages should be rate limited or coalesced before broadcast.
- Bot tick frequency may need to be lower than the current Node implementation if request budget becomes tight.
- WebSocket hibernation should be evaluated before public beta.
- The first Cloudflare PRs should avoid touching UI layout.

## Done Definition

- The app can be deployed with Cloudflare Pages and Workers.
- No externally hosted Node realtime server is required.
- Room state survives normal reconnect flows.
- Match results are persisted.
- Core E2E flows pass through the Cloudflare transport.
- The old Socket.IO server can be removed without losing features.

