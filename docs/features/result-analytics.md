# 結果分析

試合結果を勝敗だけでなく、速度・正確性・streak・接戦度などから振り返れるようにする機能です。

## 現在の状態

Private Beta 向けの基本結果分析は実装済みです。

現在扱っている主な情報:

- 順位 / 勝敗
- WPM
- accuracy
- miss count
- finish time / finish status
- max streak
- finish gap
- rule に応じた result
- localStorage に蓄積した mistake tendency

`first error position`、`lead changes`、試合ごとの詳細な進捗グラフなどは現在の必須仕様ではありません。

## 目的

- player が結果を理解できるようにする
- speed だけでなく accuracy / miss / streak も振り返れるようにする
- 接戦だったか分かる情報を出す
- Practice の miss tendency と合わせて上達につなげる

## Result の原則

- server が確定した `MatchResult` を表示する
- client 側で勝敗を再計算して server result と競合させない
- rematch 後に前 round の state を current result と混ぜない
- match rule ごとの終了条件を Result 側で勝手に変更しない

## 主な表示項目

### 共通

- rank
- nickname
- WPM
- accuracy
- mistakes
- max streak
- finish status

### Race

- finish time
- finish gap

### Time Attack

- 制限時間終了時の進捗・順位に必要な情報

### HP Battle

- KO / eliminated 等、server が確定した battle result

## Mistake tendency

入力ミスの傾向は localStorage に蓄積します。

- 期待していた文字ごとの miss 回数
- 代表的な誤入力
- よく間違える文字の可視化

現時点では local device の補助データであり、server-side match history や ranking には使いません。

## 受け入れ条件

- [x] server の確定 result と画面の順位が一致する
- [x] WPM / accuracy / miss を表示できる
- [x] max streak を表示できる
- [x] Race の finish gap を扱える
- [x] COM 戦でも結果を表示できる
- [x] rematch 後に前 round の current result が混ざらない
- [x] mistake tendency を localStorage に保存・表示できる

## 将来拡張

Public Beta / profile 導入後に必要性を見て追加します。

- server-side match history
- 前回 / 週間平均との比較
- WPM 推移
- lead change timeline
- replay と紐づく詳細分析
- profile stats

## テスト観点

- 2 人完走時の rank / finish gap
- forfeit / unfinished / eliminated を含む結果
- COM result
- rule ごとの result
- rematch reset
- server result と UI の一致
- mistake tendency の保存 / 集計
