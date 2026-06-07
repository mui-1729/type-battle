# Japanese Typing Mode

日本語の課題文を扱うタイピングモードです。英語入力とは判定方式が大きく違うため、独立した仕様として扱います。

## 目的

- 日本語の文章で遊びたい需要に対応する。
- ローマ字入力、かな入力、IME 変換の差による不公平を避ける。
- 実装時に入力判定を曖昧にしない。

## 対象ステージ

- MVP / Private beta: 後回し。
- Public beta: `romaji` mode から検討。

## モード案

### Romaji Mode

- 表示は日本語文。
- 入力対象はサーバーが用意した romaji sequence。
- `し` は `shi` / `si` など複数入力を許可するか決める。
- IME は off にしてもらう前提。

### IME Mode

- ユーザーは自然な日本語変換で入力する。
- 変換途中の composition event を扱う必要がある。
- 対戦の公平性が難しいため後回し。

## データ

```ts
type JapanesePrompt = {
  id: string;
  displayText: string;
  reading: string;
  acceptedRomaji?: string[];
  mode: "romaji" | "ime";
};
```

## 入力判定

- Romaji mode は display text と input target を分ける。
- 複数 romaji を許可する場合、cursor 管理は state machine にする。
- 促音、拗音、長音、句読点を個別に仕様化する。
- IME mode は `compositionstart`, `compositionupdate`, `compositionend` を扱う。

## UI

- 日本語文の下に romaji guide を表示する。
- 現在入力中のかな単位を highlight する。
- mode 説明を settings または setup に表示する。

## 受け入れ条件

- `し` や `ち` など主要な別表記を仕様通り判定できる。
- IME composition 中に誤判定しない。
- 英語 mode と result stats の計算が混ざらない。
- 日本語 prompt だけが Japanese mode で選ばれる。

## テスト観点

- 促音: `っか`, `っちゃ`
- 拗音: `きゃ`, `しゃ`, `ちょ`
- 長音と句読点。
- IME composition event。
- romaji guide と cursor の同期。

## 未決定事項

- MVP 後の最初は romaji mode のみにするか。
- ローマ字変換ライブラリを使うか自前実装するか。
- かな入力をサポートするか。
