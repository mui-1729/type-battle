# Player Settings

プレイヤーが見た目、入力補助、音などを調整できる機能です。

## 目的

- 画面や入力の好みによる遊びにくさを減らす。
- アクセシビリティを確保する。
- Public beta 前に最低限の安全な表示設定を用意する。

## 対象ステージ

- Private beta: nickname、theme、input display、reduced motion、font size の最小設定。
- sound / countdown sound も実際の再生に wiring する。
- Public beta: accessibility、language、privacy の拡張。

## 設定項目

- nickname
- theme: `system`, `light`, `dark`
- sound effects: on / off
- countdown sound: on / off
- input guide: next character highlight on / off
- reduced motion: on / off
- font size: small / normal / large
- opponent progress display: simple / detailed

## データ

```ts
type PlayerSettings = {
  nickname: string;
  theme: "system" | "light" | "dark";
  soundEnabled: boolean;
  countdownSoundEnabled: boolean;
  inputGuideEnabled: boolean;
  reducedMotion: boolean;
  fontSize: "small" | "normal" | "large";
};
```

## 保存

- MVP / Private beta は localStorage でよい。
- server に送るのは nickname と room 表示に必要な最小情報のみ。
- Public beta で login を導入した場合、settings を server に保存できる。

## UI

- Home の top bar から settings modal を開く。
- 設定変更は即時反映されるようにする。
- nickname は次の room 作成 / 参加で使う表示名として扱う。

## 受け入れ条件

- nickname が validation される。
- sound / countdown sound の設定が localStorage に保存される。
- sound / countdown sound が typing / countdown に反映される。
- reduced motion の時に大きな animation が無効になる。
- font size を変えても主要 UI が重ならない。

## テスト観点

- localStorage 保存 / 復元。
- nickname validation。
- theme 切り替え。
- reduced motion 時の表示。

## 未決定事項 (決定済み)

- キー音を入れるか。
  - -> Private Beta で実装済み。
- 設定画面を modal にするか page にするか。
  - -> Modal に実装済み。
- sound effect を実際に鳴らすか。
  - -> Private Beta で実装済み。
