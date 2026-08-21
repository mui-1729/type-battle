# プレイヤー設定

プレイヤーが表示・入力補助・音などを調整する機能です。

## 現在の状態

Private Beta 向け設定は実装済みです。

- nickname
- theme: `system | light | dark`
- sound
- countdown sound
- input guide
- reduced motion
- font size
- settings modal
- localStorage 保存 / 復元

## 目的

- 画面や入力の好みによる遊びにくさを減らす
- motion / font size などのアクセシビリティを確保する
- 対戦中の情報量や演出を user が調整できる余地を持つ
- login がなくても端末上で設定を維持する

## 保存

Private Beta では localStorage を使います。

server へ送るのは room / match に必要な nickname や player state に含める情報だけとし、表示設定をすべて server-side profile として保存しません。

将来 authenticated user を導入した場合に、必要な設定だけ同期するか検討します。

## UI

- Home から settings modal を開く
- 変更は可能な範囲で即時反映する
- nickname は room 作成 / 参加で使用する
- theme は CSS variables 等を通して画面へ反映する
- reduced motion は大きな animation / transition を抑制する
- font size は typing text の可読性へ反映する
- sound off では typing / countdown sound を再生しない

## 現在の受け入れ条件

- [x] 設定を localStorage へ保存できる
- [x] reload 後に設定を復元できる
- [x] system / light / dark を切り替えられる
- [x] reduced motion を反映できる
- [x] font size を変更できる
- [x] input guide を変更できる
- [x] sound / countdown sound の on / off が再生へ反映される
- [x] modal から設定を変更できる

## Cosmetic との境界

head accessory / held item 等の cosmetic customization は player settings と関連しますが、ゲームの勝敗へ影響する設定にはしません。

保存・unlock 等の仕様は cosmetic 側の実装に従います。

## 将来拡張

- language
- key layout / input preferences
- color contrast options
- server-synced settings
- privacy settings
- opponent display detail の選択

未実装の候補を現在の `PlayerSettings` に存在する field のように記載しないようにします。

## テスト観点

- localStorage save / restore
- nickname validation
- theme
- reduced motion
- font size
- sound / countdown sound
- settings modal
- mobile layout で設定 UI が操作可能なこと
