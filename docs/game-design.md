# ゲーム設計

## コアループ

1. ニックネームを入力する。
2. room を作る、または room code で参加する。
3. ロビーで対戦相手を待つ。
4. ホストが開始する。
5. カウントダウン後、同じ文章をタイピングする。
6. 相手の進捗を見ながら完走を目指す。
7. 結果を確認し、再戦または退出する。

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
- ホスト用 start ボタン
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
- 完走時間
- 再戦ボタン
- ホームへ戻るボタン

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

初期は 30-120 文字程度の英語文章を使う。日本語タイピングは IME、かな漢字変換、ローマ字入力方式の違いがあるため、MVP 後に別モードとして設計する。
