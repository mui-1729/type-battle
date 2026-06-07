# Friends / Invites

友人と遊びやすくするための招待、固定メンバー、フレンド機能です。

## 目的

- 内輪で遊ぶ導線を強くする。
- room code の共有を簡単にする。
- 将来のログイン機能と接続する。

## 対象ステージ

- Private beta: share link。
- Public beta: recent opponents。
- Public service: friends list。

## 機能案

- room invite link
- copy room code
- recent opponents
- friend request
- friend online status
- invite friend to room
- private room only friends

## データ

```ts
type InviteLink = {
  roomCode: string;
  createdBy: string;
  expiresAt: number;
};

type FriendRelation = {
  userId: string;
  friendUserId: string;
  status: "pending" | "accepted" | "blocked";
  createdAt: number;
};
```

## UI

- Lobby に copy invite link button を置く。
- Home に recent rooms / recent opponents を表示する案を検討する。
- Friends list は login 後まで後回しにする。

## 受け入れ条件

- invite link から room join 画面に遷移できる。
- expired room の invite link は join できない。
- room が full の時は適切なエラーを出す。
- friend 機能なしでも room code 共有で遊べる。

## テスト観点

- invite link 生成。
- invite link join。
- expired / full room。
- copy button の UI。

## 未決定事項

- invite link に room code をそのまま含めるか。
- recent opponents を guest でも保存するか。
- online status を websocket で扱うか。
