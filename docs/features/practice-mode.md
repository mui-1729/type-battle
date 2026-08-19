# 練習モード

対戦せずに一人でタイピングできる機能です。

## 現在の状態

Private Beta 向けの基本機能は実装済みです。

- Home から Practice を開始できる
- server が prompt を発行する
- typing / result UI がある
- `Practice again` で再実行できる
- Daily Challenge がある
- miss tendency を localStorage に蓄積・可視化する

「同じ prompt を指定して再挑戦する」「session summary」などは将来拡張です。

## 目的

- 対戦相手を待たずに遊べる入口を作る
- 入力判定や UI に慣れる場を用意する
- 対戦前のウォームアップに使えるようにする
- Daily Challenge で繰り返し遊ぶ理由を作る

## 現在のユーザー体験

1. Home から Practice または Daily Challenge を選ぶ
2. server から prompt を受け取る
3. 一人で typing する
4. WPM / accuracy / miss 等の結果を確認する
5. Practice では `Practice again` で再実行できる
6. Daily Challenge では当日の best を確認できる

## Daily Challenge

- Asia/Tokyo の日付境界で challenge を切り替える
- 当日の best を localStorage に保存する
- rating / online match result とは分離する

## Miss tendency

Practice / typing の miss 情報を localStorage に蓄積し、よく間違える文字や代表的な誤入力を表示します。

この情報は現時点では local device の学習補助であり、server-side profile や ranking には使いません。

## Server behavior

Practice は完全な client-only mode ではありません。

- `client:practice:start` で server へ開始を要求する
- Daily は `client:practice:dailyStart` を使う
- server が prompt/session data を返す
- result の表示・local analytics は Web 側で扱う

将来、authenticated match history へ保存する場合は privacy / retention を別途設計します。

## 現在の受け入れ条件

- [x] room を作らずに Practice を開始できる
- [x] server から prompt を取得できる
- [x] 完走後に result が表示される
- [x] Practice again で再実行できる
- [x] Daily Challenge が日付で切り替わる
- [x] 当日 best が保存される
- [x] Practice の結果が online match の room result と混ざらない

## 将来拡張

- Retry same prompt
- Next prompt を明示的に分ける UI
- 連続練習 session summary
- cloud-synced practice history
- authenticated profile への学習履歴

## テスト観点

- Home → Practice
- prompt 発行
- typing → result
- Practice again
- Daily の日付境界
- localStorage best
- miss tendency の保存 / 復元
- Practice 中に online room connection が意図せず残らないこと
