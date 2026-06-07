# Result Analytics

試合結果を「勝った / 負けた」だけでなく、上達や再戦につながる情報として表示する機能です。

## 目的

- プレイヤーが自分の成績を理解できるようにする。
- 接戦、ミス、速度変化などを見せて再戦したくなる体験を作る。
- 将来のプロフィール、ランキング、リプレイの土台にする。

## 対象ステージ

- Private beta: 基本結果と round summary。
- Public beta: 履歴、比較、簡単なグラフ。

## 表示項目

- 順位
- WPM
- accuracy
- miss count
- elapsed time
- max streak
- first error position
- lead changes
- finish gap
- COM difficulty または opponent type

## UI

- Result 画面上部に順位と勝敗を表示する。
- その下に各 player の主要 stats を横並びで表示する。
- 自分の前回試合との差分を表示する。
- Private beta ではグラフは簡易でよい。

## データ

```ts
type MatchResultStats = {
  playerId: string;
  rank: number;
  wpm: number;
  accuracy: number;
  missCount: number;
  elapsedMs?: number;
  maxStreak: number;
  finishGapMs?: number;
};
```

## 受け入れ条件

- 完走者と未完走者の両方に意味のある stats が表示される。
- COM 対戦でも opponent type が分かる。
- rematch 後に前 round の stats と混ざらない。
- result の数値が server の確定結果と一致する。

## テスト観点

- 2 人完走時の順位と finish gap。
- 片方未完走時の順位。
- miss count / accuracy の表示。
- rematch 後の stats reset。

## 未決定事項

- result にミスした文字位置を出すか。
- 進捗推移グラフを Private beta で出すか。
