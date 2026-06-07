# Practice Mode

対戦せずに一人でタイピング練習できる機能です。

## 目的

- 対戦相手を待たずに遊べる入口を作る。
- 初心者がルールと入力判定に慣れる場を用意する。
- 対戦前のウォームアップとして使えるようにする。

## 対象ステージ

- Private beta: 任意だが効果が大きい。
- Public beta: Home の主要導線にする。

## ユーザー体験

- Home から `Practice` を選ぶ。
- prompt length / category を選ぶ。
- countdown なしで開始、または短い countdown を選べる。
- 完走後に WPM、accuracy、miss count、苦手文字を表示する。
- `Retry same prompt` と `Next prompt` を選べる。

## UI 状態

- `practice_setup`: 条件選択。
- `practice_playing`: 入力中。
- `practice_result`: 結果表示。
- `practice_retry`: 同じ prompt を再挑戦。

## データ

```ts
type PracticeResult = {
  promptId: string;
  wpm: number;
  accuracy: number;
  missCount: number;
  elapsedMs: number;
  weakCharacters: string[];
};
```

## サーバー挙動

- MVP ではクライアント完結でもよい。
- Public beta で戦績に残す場合は server に保存する。
- practice result は rating に影響させない。

## 受け入れ条件

- room を作らずに練習を開始できる。
- 完走後に結果が表示される。
- retry で同じ prompt を再利用できる。
- practice の結果が対戦結果やランキングに混ざらない。

## テスト観点

- Home から practice 開始。
- 完走後の result 表示。
- retry / next prompt の動作。
- practice 中に room state が不要であること。

## 未決定事項

- practice を完全 offline 対応にするか。
- 苦手文字や履歴を guest に保存するか。
