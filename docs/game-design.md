# ゲーム設計

## コアループ

1. ニックネームを設定する
2. room を作る、または room code で参加する
3. ロビーで対戦ルールや課題文カテゴリを確認する
4. ready 後に host が開始する
5. countdown 後に同じ条件でタイピングする
6. 相手の進捗やゲーム状態を見ながら勝利条件を目指す
7. Result を確認する
8. 同じ room で再戦する、または Home へ戻る

1 人の場合は COM 戦を開始できます。対戦せず Practice / Daily Challenge を遊ぶこともできます。

## 現在の対戦ルール

### Race

先に課題文を打ち切ったプレイヤーが勝つ基本ルールです。

- 完走を最優先する
- 完走者同士では server が確定した終了時刻で順位を決める
- 未完走状態が発生した場合は server state に基づいて扱う

### Time Attack

制限時間内にどれだけ進められたかを競います。

- server が終了時刻を管理する
- 1 つの prompt を完走した場合も、ルールに応じて次の進行を扱う
- 制限時間終了時の server state から結果を確定する

### HP Battle

正確な typing を続けながら相手 HP を削る対戦です。

- player state に HP を持つ
- typing の進行・miss・streak 等から battle state を更新する
- KO / double KO / sudden death を含む終了条件は server が確定する

細かな数値はプレイテストで変更する可能性があるため、コード上の定数・テストを実装上の基準とします。

## 画面

### Home

- ニックネーム
- room 作成
- room code 参加
- Practice / Daily Challenge への入口
- Settings / customization への入口

### Lobby

- room code
- 参加者
- ready 状態
- prompt category
- match rule
- COM difficulty
- host の start 操作
- quick reaction
- 退出

### Match

対戦中は課題文と入力を最優先にします。

- 課題文
- typing input
- 自分と相手の進捗
- ルール固有の表示
  - Race: 位置・ゴール
  - Time Attack: 残り時間・進捗
  - HP Battle: HP / battle 状態
- countdown / finish 表示
- connection 状態

常時表示する情報量を増やしすぎず、WPM や accuracy など詳細指標は Result で確認できる設計を基本にします。

### Result

- 順位 / 勝敗
- WPM
- accuracy
- miss count
- max streak
- finish gap などルールに応じた結果情報
- 再戦
- Home へ戻る
- feedback 導線

### Practice / Daily Challenge

実装済みです。

- 一人で prompt をタイピングできる
- result を確認できる
- Practice again ができる
- Daily Challenge は Asia/Tokyo の日付で切り替わる
- 当日のベストを localStorage に保持する
- miss tendency を蓄積・表示できる

## 入力判定

最終的な進捗は server authoritative にします。

- client は入力文字列と sequence を送る
- server が現在の prompt と照合する
- 正しい入力だけ progress を進める
- miss は server 側の統計へ反映する
- stale / duplicate な入力で state を巻き戻さない
- client が progress 値や finish 結果を自由に確定できない

`romaji` / `kana` の入力モード判定基盤はありますが、IME を含む完成版 Japanese typing mode は Public Beta 以降の別機能として扱います。

## スコア

### WPM

```txt
WPM = (correctCharacters / 5) / elapsedMinutes
```

### Accuracy

```txt
accuracy = correctCharacters / max(totalTypedCharacters, 1)
```

### Progress

```txt
progress = progressIndex / promptLength
```

ルール固有の順位判定は shared / Worker の実装とテストに従います。

## 公平性

現在の基本方針:

- prompt は server が選ぶ
- countdown / start / end は server time を基準にする
- typing progress と result は server が検証する
- disconnect / forfeit / reconnect を server state で扱う
- result 確定後に古い event で playing へ戻さない

Public Beta 前にはさらに次を強化します。

- paste / automated input の検知
- suspicious high WPM の扱い
- tab / focus 情報を利用する場合のルール
- report / moderation と組み合わせた abuse 対応

## 課題文

現在は category として `short | standard | long` を扱います。

prompt には表示用 text と typing 用情報を持ち、無効データを validation します。session 内では直前と同じ prompt をできるだけ避けます。

## カスタマイズ

プレイヤー設定と cosmetic はゲームの勝敗へ直接有利・不利を与えない範囲で扱います。

- theme
- font size
- reduced motion
- input guide
- sound
- head accessory
- held item

アクセシビリティ設定は演出より優先します。
