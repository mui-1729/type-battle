# アーキテクチャ

## 全体構成

```txt
Browser
  |
  | HTTPS
  v
Next.js Web App
  |
  | REST API / session
  v
API Server / Database

Browser
  |
  | Socket.IO
  v
Realtime Game Server
  |
  | room state / pubsub
  v
Redis
  |
  | persisted match data
  v
PostgreSQL
```

MVP では Next.js と Socket.IO server を同じ Node.js プロジェクト内で管理してもよい。ただしデプロイとスケールを考え、Web UI と realtime server は分離可能な構成にする。

## 推奨ディレクトリ構成

```txt
apps/
  web/
    app/
    components/
    lib/
  realtime/
    src/
      events/
      game/
      rooms/
packages/
  shared/
    src/
      events.ts
      game-state.ts
      scoring.ts
docs/
```

## Socket.IO イベント案

### Client to Server

- `room:create`
- `room:join`
- `room:leave`
- `player:ready`
- `match:start`
- `typing:progress`
- `typing:finish`
- `match:rematch`

### Server to Client

- `room:created`
- `room:state`
- `player:joined`
- `player:left`
- `match:countdown`
- `match:started`
- `player:progress`
- `player:finished`
- `match:result`
- `match:error`

## Game State

```ts
type MatchStatus =
  | "waiting"
  | "countdown"
  | "playing"
  | "finished"
  | "cancelled";

type PlayerState = {
  id: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  finishedAt?: number;
};

type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  promptId?: string;
  promptText?: string;
  serverStartAt?: number;
  players: PlayerState[];
};
```

## サーバー authoritative 方針

クライアントは「入力した」というイベントを送るだけにし、最終的な進捗・完走・勝敗はサーバーが確定する。

ただし、1 キーごとに完全検証すると通信量が増える。MVP では次の折衷にする。

- クライアントは currentIndex、correctCharacters、totalTypedCharacters、mistakes を送る。
- サーバーは room の prompt length と単調増加チェックを行う。
- finish event では currentIndex が prompt length に到達しているか検証する。
- 不自然な進捗ジャンプや高すぎる WPM を suspicious として記録する。

## スケール

### MVP

- 単一 realtime server
- in-memory room state
- PostgreSQL に試合結果保存

### Beta

- Redis に room state の一部を保存
- Socket.IO Redis Adapter を導入
- 複数 realtime server

### Production

- matchmaking queue を Redis で管理
- replay / audit 用に match events を保存
- observability: logs, metrics, tracing

## セキュリティ

- room code は推測しにくい 6-8 文字にする。
- nickname は長さ制限、禁止文字、HTML escape を行う。
- Socket.IO handshake で session または guest token を確認する。
- rate limit を room creation、join、progress events に設定する。
- paste、tab switch、異常 WPM を検知する。

## テスト戦略

- Unit: scoring、progress validation、room state transition
- Integration: Socket.IO event handler
- E2E: Playwright で 2 context を使った room 作成・参加・対戦・結果表示
- Load: k6 または autocannon で同時 room と progress events を確認
