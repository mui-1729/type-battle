# 切断・再接続仕様

## 目的

リロード、一時的なネットワーク切断、ブラウザクラッシュでゲーム全体が壊れないようにする。Private beta では最低限の復帰、Public beta では公平性と abuse 対策を強める。

## 対象ステージ

- MVP: reload rejoin
- Private Beta: short disconnect recovery
- Public Beta: timeout / forfeit / audit

## 現在の前提

- guest id を localStorage に保存する。
- room code も localStorage に保存する。
- reload 後、同じ guest id と room code で `room:join` し直す。
- server は同一 guest id の再参加を existing player reconnect として扱う。

## 切断種別

### Intentional Leave

ユーザーが Leave を押す。

- waiting: room から退出する。
- playing: MVP では offline 扱い。Private beta では forfeit 扱いを検討する。
- localStorage の room code を消す。

### Reload

ページ更新。

- socket disconnect が起きる。
- client が再読み込み後に localStorage から room code を読み、join する。
- server は existing player として復帰させる。

### Temporary Network Loss

短時間のネットワーク切断。

- socket disconnect を room state に反映する。
- reconnect grace period 内なら復帰を許可する。
- grace period を超えたら forfeit または offline finish 扱いにする。

### Browser Close

明示退出なしで閉じる。

- waiting room は TTL 後に削除する。
- playing room は disconnect rule に従う。

## 推奨ルール

```txt
Waiting room idle TTL: 30 min
Countdown reconnect grace: 10 sec
Playing reconnect grace: 20 sec
Finished room TTL: 10 min
```

MVP では TTL 未実装でもよいが、Private beta 前に入れる。

## サーバー挙動

- disconnect 時、player.connected = false にする。
- disconnectAt を保持する。
- reconnect 時、同じ guest id なら socketId を更新し connected = true にする。
- progressIndex は巻き戻さない。
- disconnected 中の typing progress は受け付けない。
- grace period timeout 後、room status に応じて処理する。

## データ案

```ts
type PlayerState = {
  connected: boolean;
  disconnectedAt?: number;
  forfeitedAt?: number;
};

type RoomState = {
  expiresAt?: number;
};
```

## UI 状態

- connected: `connected`
- disconnected but grace: `reconnecting`
- grace expired: `forfeit` または `offline`
- 自分が reconnect 中: full screen overlay で接続中表示
- 相手が reconnect 中: opponent row に表示

## 受け入れ条件

- reload 後、同じ room に復帰できる。
- playing 中 reload 後、progress が維持される。
- disconnected player は相手側 UI で offline 表示になる。
- grace period 内に戻ると connected 表示になる。
- grace period 超過後の扱いが明確である。

## テスト観点

- Unit: disconnectAt 設定
- Unit: reconnect updates socket id
- Unit: progress is monotonic after reconnect
- Unit: grace period expiration
- E2E: waiting room reload rejoin
- E2E: playing room reload rejoin
- E2E: opponent offline display

## 未決定事項

- playing 中に相手が長時間切断した時、即勝利にするか、完走を待つか。
- COM 対戦中の切断は paused にするか、COM を進め続けるか。
- public beta で意図的な切断を rating penalty にするか。
