# Public Lobby

知らない人同士が遊ぶために、参加可能な room や queue を見つける機能です。

## 目的

- room code を知らなくても対戦相手を探せるようにする。
- Public beta で「今遊べる」入口を作る。
- moderation と abuse prevention を前提に公開範囲を制御する。

## 対象ステージ

- Private beta: 不要。
- Public beta: moderation と rate limit 後に追加。

## ユーザー体験

- Home から `Public Lobby` を開く。
- 募集中 room の一覧を見る。
- room の mode、人数、prompt length、host nickname を確認する。
- `Join` を押すと lobby に参加する。
- 一覧が空の場合は quick match または COM を案内する。

## 表示項目

- room code の一部または public room id
- host nickname
- current players / max players
- mode
- prompt category
- created age
- spectator allowed

## データ

```ts
type PublicRoomSummary = {
  publicRoomId: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  mode: "standard" | "practice" | "com" | "custom";
  promptCategory: string;
  createdAt: number;
  spectatorAllowed: boolean;
};
```

## サーバー挙動

- host が public にした room だけ一覧に出す。
- full / playing / expired room は出さない。
- nickname は moderation 済み表示名のみ出す。
- 一覧取得に rate limit を設ける。
- publicRoomId は room code と別にしてもよい。

## 受け入れ条件

- public room だけが一覧に表示される。
- full room は join できない。
- host が private に切り替えると一覧から消える。
- 不正な nickname が lobby に表示されない。

## テスト観点

- public / private の表示切り替え。
- full room filtering。
- room expiration 後の非表示。
- 一覧取得 rate limit。

## 未決定事項

- public room id と room code を分けるか。
- lobby に検索 / filter を入れるか。
- 何人以上の同時接続から Redis が必要になるか。
