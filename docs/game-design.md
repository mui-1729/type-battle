# ゲーム設計

## コアループ

1. ニックネームを入力する。
2. room を作る、または room code で参加する。
3. ロビーで対戦相手を待つ。
4. ホストが開始する。
5. カウントダウン後、同じ文章をタイピングする。
6. 相手の進捗を見ながら完走を目指す。
7. 結果を確認し、再戦または退出する。

## 対戦ルール

- `race`: 先に最後まで打ち切った人が勝ち。短期決戦の純粋なスピード勝負。
- `timeAttack`: 制限時間内にどれだけ進めたかで競う。完走してもしなくても、締切時点の進捗で順位が決まる。
- `hpBattle`: 正解で相手 HP を削り、ミスでも自分が削られる。完走よりも継戦力を重視する。

## 画面

### Home

- ニックネーム入力
- room 作成ボタン
- room code 入力
- 参加ボタン

### Lobby

- room code
- 参加者一覧
- ready 状態
- prompt category
- ホスト用 start ボタン
- 1 人時の Start vs COM
- 退出ボタン

### Match

- 課題文
- 入力欄
- 自分の進捗バー
- 相手の進捗バー
- WPM
- 正確率
- 経過時間
- countdown overlay

### Result

- 順位
- WPM
- 正確率
- ミスタイプ数
- finish gap
- 完走時間
- 再戦ボタン
- ホームへ戻るボタン

### Practice

実装は未完了。将来の画面要素。

- prompt category
- 一人で開始するボタン
- WPM
- 正確率
- ミスタイプ数
- retry / next prompt

## 入力判定

MVP では「正しい文字だけ進める」方式にする。

- 正しいキー: cursor を進める。
- 間違ったキー: miss count を増やし、視覚的にエラー表示する。
- Backspace: MVP では不要。将来、自由入力方式に切り替える場合に扱う。
- Paste: 禁止する。
- Focus loss: 警告またはログ記録。MVP では失格にはしない。

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
progress = currentIndex / promptLength
```

## 公平性

- 課題文はサーバーが選ぶ。
- countdown と start time はサーバーが決める。
- クライアントの finish time を信用しすぎず、サーバー受信時刻と progress state を併用する。
- 異常に速い WPM、paste、全文送信などを検知する。

## 文章データ

現在は `short | standard | long` の英語 prompt を static list で使う。日本語タイピングは IME、かな漢字変換、ローマ字入力方式の違いがあるため、MVP 後に別モードとして設計する。
