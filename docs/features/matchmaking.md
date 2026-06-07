# マッチメイキング仕様

## 目的

知らない人同士でも遊べるようにする。ただし private beta では room code 参加を優先し、public beta 前にランダムマッチを追加する。

## 対象ステージ

- MVP: room code 参加のみ。
- Private Beta: 人がいない場合の COM fallback。
- Public Beta: public queue / random matchmaking。

## 段階

### Stage 1: Room Code

- host が room を作る。
- guest が room code で参加する。
- 2 人そろったら開始する。
- 1 人だけなら COM と開始できる。

### Stage 2: Quick Match with COM Fallback

- `Quick Match` を押すと waiting queue に入る。
- 一定時間内に人間が見つかれば人間対戦。
- 見つからなければ COM 対戦に切り替える。

推奨 timeout:

```txt
Private Beta: 10 sec
Public Beta: 20-30 sec
```

### Stage 3: Public Queue

- region / latency / language mode / prompt category を考慮する。
- Redis queue で複数 realtime server 間の matchmaking を行う。
- queue timeout 後に COM fallback する。

## ユーザー体験

### Quick Match

1. ニックネーム入力後 `Quick Match` を押す。
2. `Searching...` を表示する。
3. 相手が見つかったら Lobby または countdown に遷移する。
4. timeout したら `Start vs COM` または自動 COM countdown に進む。
5. キャンセルで Home に戻る。

## サーバー挙動

### MVP 後の最小実装

- `matchmaking:join` event で queue に入る。
- `matchmaking:cancel` event で queue から抜ける。
- queue は in-memory から始める。
- 同一 guest id の重複 queue 参加は禁止する。
- match 成立時に room を作成し、両 socket を room に join する。
- timeout 時に COM room を作るか、既存 room に COM を追加する。

### Public Beta

- Redis sorted set または list で queue 管理する。
- matchmaking worker が socket server と分離してもよい。
- server crash 時に stale queue item を TTL で掃除する。

## イベント案

### Client to Server

- `matchmaking:join`
- `matchmaking:cancel`

### Server to Client

- `matchmaking:searching`
- `matchmaking:matched`
- `matchmaking:timeout`
- `matchmaking:error`

## データ

```ts
type MatchmakingTicket = {
  ticketId: string;
  guestId: string;
  socketId: string;
  nickname: string;
  languageMode: "en" | "ja" | "code";
  createdAt: number;
  expiresAt: number;
};
```

## 受け入れ条件

- 1 人が queue に入り、cancel できる。
- 2 人が queue に入ると同じ room に入る。
- timeout すると COM fallback になる。
- 同じ guest id が複数 ticket を作れない。
- disconnect すると queue から削除される。

## テスト観点

- Unit: queue add / remove / match pair
- Unit: stale ticket expiration
- Integration: 2 sockets が matched room に入る
- Integration: timeout で COM fallback
- E2E: 2 browser quick match
- E2E: timeout 後 COM match

## 未決定事項

- Quick Match から Lobby を挟むか、即 countdown にするか。
- timeout 秒数。
- 言語モードや難易度を matching 条件に含めるか。
- public beta で匿名 quick match を許可するか、ログイン必須にするか。
