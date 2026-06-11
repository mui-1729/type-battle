# Observability / Rate Limit 仕様

## 目的

Private beta で不具合を追えるようにし、Public beta に向けて荒らしや過剰アクセスを抑える。

## 対象ステージ

- MVP: console log
- Private Beta: structured logs / basic rate limit
- Public Beta: metrics / alerts / abuse monitoring

## ログ方針

ログは `pino` による構造化ログを使用する。個人情報は最小限にする。

## 最低限ログに残すイベント (実装済み)

- server start
- socket connect / disconnect
- room create
- room join
- room leave
- match countdown
- match start
- progress suspicious (10文字以上のジャンプを検知)
- match finish
- match result
- room expired
- rate limit exceeded
- server error

## Structured Log 案

```json
{
  "level": "info",
  "event": "match_result",
  "roomCode": "AB12CD",
  "matchId": "match_...",
  "playerCount": 2,
  "hasBot": false,
  "durationMs": 42100,
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

## Rate Limit 対象

### room:create

```txt
guest id: 10 / 10 min
IP: 30 / 10 min
```

### room:join

```txt
guest id: 30 / 10 min
IP: 100 / 10 min
```

### typing:progress

```txt
socket: 30 / sec
```

progress は高頻度になりやすいので、超過時は即 disconnect ではなく drop / throttle から始める。

## Suspicious Detection

MVP 後に次を suspicious としてログする。

- progressIndex が大きく飛ぶ。
- WPM が上限を超える。
- totalTypedCharacters が不自然に増える。
- finish が start 直後すぎる。
- paste event が発生する。
- focus loss が多すぎる。

## Metrics

Private beta (実装済み):

- active sockets
- active rooms
- matches started
- matches finished
- disconnect count
- server errors (health check に露出)

Public beta:

- queue wait time
- match completion rate
- reconnect success rate
- rate limit count
- p95 event latency
- memory usage
- CPU usage

## Alert

Private beta では Slack / Discord / email のどれか 1 つでよい。

Alert 条件:

- server down
- health endpoint failure
- error rate spike
- memory usage high
- deploy failure

## 受け入れ条件

- room lifecycle がログで追える。
- match result がログで追える。
- progress rate limit がある。
- room create / join rate limit がある。
- health endpoint がある。

## テスト観点

- Unit: rate limiter allows within limit
- Unit: rate limiter blocks over limit
- Integration: typing progress over limit is dropped
- Integration: room create over limit returns error
- E2E: normal play is not rate limited

## 未決定事項 (決定済み)

- IP address をどこまで保存するか。
  - -> ログに記録するのみ。
- private beta のログ保存先。
  - -> 標準出力。ホスティングサービスのログ管理機能を利用。
- public beta の monitoring provider。
  - -> 未定。
