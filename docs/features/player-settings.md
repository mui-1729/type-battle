# Player Settings

プレイヤーが見た目、入力補助、音などを調整できる機能です。

## 目的

- 画面や入力の好みによる遊びにくさを減らす。
- アクセシビリティを確保する。
- Public beta 前に最低限の安全な表示設定を用意する。

## 対象ステージ

- Private beta: nickname、theme、sound、input display の最小設定。
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

- Home に settings menu を置く。
- Match 中は最低限、sound と reduced motion の切り替えだけ可能にする。
- 設定変更が即時反映されるようにする。

## 受け入れ条件

- nickname が validation される。
- sound off の時に効果音が鳴らない。
- reduced motion の時に大きな animation が無効になる。
- font size を変えても主要 UI が重ならない。

## テスト観点

- localStorage 保存 / 復元。
- nickname validation。
- theme 切り替え。
- reduced motion 時の表示。

## 未決定事項 (決定済み)

- キー音を入れるか。
  - -> Private Beta では保留。
- 設定画面を modal にするか page にするか。
  - -> Modal に実装済み。
