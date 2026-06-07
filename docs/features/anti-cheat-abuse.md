# Anti-cheat / Abuse Prevention

不正なタイピング、過剰アクセス、bot 的挙動を検知・抑制する機能です。

## 目的

- 公平な対戦を守る。
- Public beta でランキングや rating を導入できる土台を作る。
- サーバー負荷や迷惑行為を早期に検知する。

## 対象ステージ

- Private beta: paste 禁止、異常 WPM ログ、rate limit。
- Public beta: suspicious flag、ranking 除外、temporary restriction。

## 検知対象

- paste
- 一括入力
- 人間離れした WPM
- タイプ間隔が一定すぎる
- focus loss の繰り返し
- reconnect を使った状態改ざん
- room 作成 / join の連打
- progress event の高頻度送信

## データ

```ts
type SuspiciousActivity = {
  playerId: string;
  roomCode?: string;
  matchId?: string;
  type: "paste" | "high_wpm" | "event_spam" | "focus_loss" | "state_mismatch";
  severity: "low" | "medium" | "high";
  details: Record<string, unknown>;
  createdAt: number;
};
```

## サーバー挙動

- finish event は progress state と prompt length で検証する。
- WPM が閾値を超えた場合は result に suspicious flag を付ける。
- suspicious flag が付いた試合は ranking / rating に反映しない。
- progress event は player ごとに throttle する。
- paste event はクライアントで禁止し、server log に残す。

## UI

- Private beta ではプレイヤーに強い警告を出しすぎない。
- Public beta では結果画面に「記録対象外」の表示を出す。
- 管理者向けには suspicious activity 一覧を用意する。

## 受け入れ条件

- paste で入力を進められない。
- 異常 WPM の試合に flag が付く。
- progress event spam で server が落ちない。
- suspicious result が ranking に反映されない。

## テスト観点

- paste event。
- finish time 改ざん。
- high WPM threshold。
- progress event rate limit。
- suspicious result の除外。

## 未決定事項

- WPM の閾値をいくつにするか。
- suspicious flag を本人に表示するか。
- 管理画面を作るか、ログ確認で済ませるか。
