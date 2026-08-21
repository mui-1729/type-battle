# 課題文ライブラリ

試合・Practice で使う課題文を管理します。

## 現在の状態

Private Beta では shared package 内の static prompt list を使用しています。

現在の category:

- `short`
- `standard`
- `long`

host は Lobby で category を選択でき、server が match start 時に prompt を決定します。

## 現在のデータモデル

型定義の正本は `packages/shared/src/game-state.ts` です。

```ts
type PromptCategory = "short" | "standard" | "long";

type PromptTyping = {
  romaji: string;
  hiragana: string;
};

type Prompt = {
  id: string;
  text: string;
  category: PromptCategory;
  enabled?: boolean;
  typing: PromptTyping;
};
```

過去の設計案にあった `locale`、`difficulty`、`tags`、`createdAt` 等は現在の `Prompt` 型にはありません。

## 目的

- 全 player に同じ条件の prompt を配る
- 長さを選べるようにする
- 無効な prompt を試合へ出さない
- 同じ文章ばかり続かないようにする
- 将来の日本語・コード等へ拡張できる余地を残す

## 選択ルール

- prompt は server が選ぶ
- client から任意の prompt text を試合条件として確定させない
- host が `short | standard | long` を選ぶ
- disabled / invalid prompt は選択対象にしない
- 同じ room session では直前と同じ prompt をできるだけ避ける
- 全 player に同じ prompt state を配信する

## Validation

現在は prompt 定義に対して最低限の validation を行います。

- 空文字を許可しない
- 制御文字等の不正データを弾く
- category / typing data の整合性を保つ
- disabled prompt を通常選択しない

細かな最小・最大文字数を仕様として固定する場合は、実装の validation と同じ PR でこのファイルを更新します。

## 日本語入力との関係

`PromptTyping` に `romaji` / `hiragana` を持ち、typing input 側には `romaji` / `kana` の判定基盤があります。

ただし、IME 変換や複数のローマ字入力方式を含む「完成版 Japanese typing mode」は別機能です。

詳細は [japanese-typing-mode.md](japanese-typing-mode.md) を参照してください。

## 現在の受け入れ条件

- [x] 同じ試合では全 player が同じ prompt を使う
- [x] host が category を変更できる
- [x] category に応じて server が prompt を選ぶ
- [x] invalid prompt を validation する
- [x] 直前 prompt の重複をできるだけ避ける

## 将来拡張

必要になった時点で設計します。

- code prompt
- quote / natural-language category
- difficulty metadata
- DB / CMS 管理
- moderation workflow
- user-submitted prompt
- locale metadata

user-submitted prompt を許可する場合は著作権・個人情報・不適切表現の moderation が前提です。

## テスト観点

- category ごとの prompt 選択
- invalid / disabled prompt の除外
- rematch での重複回避
- 2 client が同じ prompt を受け取ること
- romaji / kana input と typing data の整合性
