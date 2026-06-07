# Prompt Library

試合で使う課題文を管理する機能です。単に文章を増やすだけでなく、長さ、難易度、カテゴリ、公平性を扱います。

## 目的

- 何度遊んでも同じ文章ばかりにならないようにする。
- 初心者と上級者で極端に体験が崩れないようにする。
- 将来の日本語、コード、記号、長文モードに拡張できるようにする。

## 対象ステージ

- MVP: 固定の短い英語文リスト。
- Private beta: 難易度と長さを分ける。
- Public beta: カテゴリ、通報、品質管理を追加する。

## カテゴリ案

- `short`: 30-60 characters
- `standard`: 60-120 characters
- `long`: 120-240 characters
- `code`: 記号や大文字小文字を含むコード風文章
- `quote`: 引用風の自然文。ただし著作権に注意する
- `japanese-romaji`: ローマ字入力用
- `japanese-ime`: IME 入力用。別設計が必要

## データ

```ts
type Prompt = {
  id: string;
  locale: "en" | "ja";
  mode: "plain" | "code" | "romaji" | "ime";
  text: string;
  length: number;
  difficulty: "easy" | "normal" | "hard";
  tags: string[];
  enabled: boolean;
  createdAt: number;
};
```

## 選択ルール

- 試合開始時にサーバーが prompt を決める。
- 同じ room session 内では直近の prompt を避ける。
- 全 player に同じ prompt id と text を配信する。
- クライアントから prompt text を任意指定させない。
- Public beta では著作権・不適切表現・個人情報の混入を避ける。

## UI

- Private beta では lobby で `Short / Standard / Long` を選べる。
- ホストのみ prompt length を変更できる。
- 将来はカテゴリ selector を追加する。
- 試合中は prompt のカテゴリ名を小さく表示してもよい。

## 受け入れ条件

- 同じ試合では全 player に同じ prompt が表示される。
- prompt length を変更してから開始すると該当カテゴリから選ばれる。
- 無効化された prompt は選ばれない。
- prompt が空、短すぎる、長すぎる場合は登録時に弾く。

## テスト観点

- prompt 選択の単体テスト。
- 同じ room で全 player が同じ prompt を受け取る E2E。
- disabled prompt が選ばれないこと。
- mode ごとの入力判定との整合性。

## 未決定事項

- prompt をコードに埋め込むか、DB 管理にするか。
- ユーザー投稿 prompt を許可するか。
- 著作権チェックをどの運用で行うか。
