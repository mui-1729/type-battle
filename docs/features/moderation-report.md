# Moderation / Report

公開時に必要になる荒らし対策、通報、表示名制御の機能です。

## 目的

- 知らない人同士が遊んでも最低限安全にする。
- 不快な nickname、迷惑行為、過剰な room 作成に対応する。
- 運営が問題を確認し、必要なら制限できるようにする。

## 対象ステージ

- Private beta: nickname validation と basic logs。
- Public beta: report / block / moderation queue。

## 機能

- nickname length limit
- 禁止文字、HTML escape
- NG word の簡易 filter
- report opponent
- block player for current session
- room owner kick
- moderation log
- temporary ban by guest id / IP hash

## 通報理由

- 不適切な名前
- 迷惑行為
- 不正と思われるプレイ
- スパム
- その他

## データ

```ts
type Report = {
  id: string;
  reporterId: string;
  targetPlayerId: string;
  roomCode?: string;
  reason: "name" | "abuse" | "cheat" | "spam" | "other";
  detail?: string;
  createdAt: number;
};
```

## UI

- Result または player menu から report できる。
- report 後は同じ相手を current session で block できる。
- report は短く、試合を邪魔しすぎない modal にする。
- Public lobby では問題のある room を非表示にできる。

## サーバー挙動

- report を保存し、対象 player の guest id、room、match stats を関連付ける。
- report spam を防ぐため reporter ごとに rate limit する。
- ban list は websocket 接続時と join 時に確認する。
- nickname は server 側で validation / sanitize する。

## 受け入れ条件

- 不正な nickname が保存 / 表示されない。
- report が server に保存される。
- 同じ reporter が短時間に大量 report できない。
- block した相手と再マッチしにくくなる。

## テスト観点

- nickname validation。
- HTML escape。
- report 作成。
- report rate limit。
- ban / block 対象の join 拒否。

## 未決定事項

- NG word list をどう管理するか。
- IP を保存する場合のプライバシー方針。
- room owner kick を Private beta に含めるか。
