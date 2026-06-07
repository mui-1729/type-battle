# Room Lifecycle 仕様

## 目的

room が無制限に残り続けないようにし、再戦、切断、結果確認の状態遷移を明確にする。

## 対象ステージ

- MVP: in-memory room
- Private Beta: room TTL / cleanup
- Public Beta: persisted match result / Redis room state

## 状態

```txt
waiting -> countdown -> playing -> finished
waiting -> expired
countdown -> cancelled
playing -> finished
playing -> cancelled
finished -> waiting (rematch)
finished -> expired
```

MVP の `MatchStatus` は `waiting | countdown | playing | finished` でよい。Private beta で `cancelled | expired` を追加する。

## Room 作成

- room code は 6-8 文字。
- room code は推測しにくい alphabet から生成する。
- hostPlayerId を設定する。
- maxPlayers は MVP では 2。
- createdAt を保持する。
- waiting expiresAt を設定する。

## Room 参加

- waiting のみ新規参加できる。
- existing guest id は playing / finished でも reconnect できる。
- maxPlayers 超過は拒否する。
- COM がいる room に人間が後から入ることは MVP では拒否する。

## 試合開始

- host のみ開始できる。
- 2 人いれば人間対戦。
- 1 人なら COM を追加して開始できる。
- prompt は server が選ぶ。
- serverStartAt は server が決める。

## 再戦

- finished から waiting に戻す。
- prompt / serverStartAt / result を消す。
- player progress を reset する。
- COM を残すか削除するかは UX で決める。

推奨:

- `Rematch vs same players`: COM を残す。
- `Back to lobby`: COM を削除する。

MVP では Rematch で COM を残してもよいが、UI に分かりやすく出す。

## 削除 / 期限切れ

### Waiting room

- 全員 offline かつ idle TTL 超過で削除。
- host が leave した場合、次の player に host を移すか room を削除する。

MVP 推奨:

- 人間が 0 人なら TTL 後削除。
- host が leave して guest がいるなら guest を host に昇格。

### Playing room

- finished 後 TTL 超過で削除。
- 全員 offline かつ grace period 超過なら cancelled / expired。

### Finished room

- result を一定時間保持する。
- persisted storage 導入後は match result を DB に保存し、in-memory room は削除してよい。

## 受け入れ条件

- waiting room は TTL 超過で削除される。
- room code は削除後に再利用されても衝突しない。
- finished result は少なくとも result 画面表示中は消えない。
- rematch で progress と result が reset される。
- reload rejoin は room TTL 内なら成功する。

## テスト観点

- Unit: state transition
- Unit: waiting TTL expiration
- Unit: finished TTL expiration
- Unit: host leave handling
- Integration: rematch reset
- E2E: rematch after COM match
- E2E: room no longer joinable after expiration

## 未決定事項

- host leave 時に room を消すか、host migration するか。
- expired room の UI メッセージ。
- result の保持時間。
