# Ranking / Rating

継続的な競争を作るためのランキング、レート、戦績機能です。

## 目的

- プレイヤーが成長を感じられるようにする。
- 実力の近い相手と当たりやすくする。
- Public service として継続的に遊ぶ理由を作る。

## 対象ステージ

- Private beta: 不要。試合結果の保存方針だけ決める。
- Public beta: weekly ranking または simple rating。
- Public service: rating matchmaking。

## 機能案

- 自己ベスト WPM
- 直近 10 試合の平均 WPM / accuracy
- weekly ranking
- rating
- win rate
- mode 別 ranking
- suspicious result の除外

## データ

```ts
type PlayerStanding = {
  playerId: string;
  mode: string;
  rating: number;
  bestWpm: number;
  averageWpm: number;
  averageAccuracy: number;
  wins: number;
  losses: number;
  updatedAt: number;
};
```

## Rating 方針

- 初期は Elo 風の簡易 rating でよい。
- COM 戦は rating 対象外にする。
- suspicious flag がある試合は対象外にする。
- prompt length / mode ごとに rating を分けるか検討する。

## UI

- Result で rating change を表示する。
- Home か Profile に current rating を表示する。
- Ranking page で weekly top を表示する。
- 自分の順位が分かるようにする。

## 受け入れ条件

- rating 対象試合だけが反映される。
- COM 戦や practice は rating に入らない。
- suspicious result は ranking から除外される。
- 同点や未完走の扱いが明確である。

## テスト観点

- rating 計算。
- 対象外試合の除外。
- weekly ranking の集計。
- 複数 mode の分離。

## 未決定事項

- Elo / Glicko / 独自のどれを使うか。
- guest を ranking に載せるか。
- ranking のリセット周期。
