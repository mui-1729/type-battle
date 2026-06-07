# Profiles / Guest Identity

ゲスト参加から将来のログイン、プロフィール、戦績保存へ自然に拡張するための機能です。

## 目的

- nickname だけに依存しない player identity を作る。
- Private beta ではログインなしで遊べる状態を保つ。
- Public service で戦績、ランキング、フレンド機能に接続できるようにする。

## 対象ステージ

- MVP: guest id。
- Private beta: guest id の安定保存。
- Public beta: optional login。
- Public service: account / profile。

## データ

```ts
type GuestIdentity = {
  guestId: string;
  nickname: string;
  createdAt: number;
  lastSeenAt: number;
};

type PlayerProfile = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: number;
};
```

## 保存

- guest id は localStorage または cookie に保存する。
- server には hashed guest id を保存する案も検討する。
- login 後に guest history を account に merge できるようにする。

## UI

- Home で nickname を編集できる。
- profile は Public beta までは簡素でよい。
- account を作らなくても遊べる導線を残す。

## 受け入れ条件

- nickname を変えても guest id は変わらない。
- reload 後も同じ guest id で reconnect できる。
- nickname validation が server 側でも行われる。
- login なしでも room 参加できる。

## テスト観点

- guest id の発行と復元。
- nickname 変更。
- reconnect との連携。
- account merge の仕様テスト。

## 未決定事項

- login provider を何にするか。
- guest history をどの期間保持するか。
- avatar を許可するか。
