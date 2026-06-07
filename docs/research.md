# 調査メモ

調査日: 2026-06-07

## 重要な技術情報

### リアルタイム通信

ブラウザ標準の WebSocket は、クライアントとサーバー間の双方向通信に使えます。MDN では WebSocket が広く利用可能な API として説明されていますが、受信が処理速度を上回る場合の backpressure を標準 WebSocket API 自体では扱えない点も注意されています。

Source: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

### Socket.IO

Socket.IO は、対戦ゲームに必要な「部屋」「ブロードキャスト」「再接続」などを実装しやすいです。Rooms はサーバー側概念で、socket を任意の room に参加させ、room 単位でイベント送信できます。複数サーバー構成では Redis Adapter が必要です。

Source: https://socket.io/docs/v4/rooms/

Socket.IO はメッセージ順序を保証します。一方、到達保証はデフォルトでは at most once で、切断中にサーバーから送られたイベントは基本的に再送されません。必要に応じてイベント ID、DB 永続化、クライアント側 offset による再送設計が必要です。

Source: https://socket.io/docs/v4/delivery-guarantees/

Connection state recovery により、一時切断後に missed packets、rooms、socket.data を復元できる設計があります。ただし全アダプターで同じように使えるわけではないため、MVP では短時間の復帰補助として扱い、重要な試合状態はサーバーの game state に保持します。

Source: https://socket.io/docs/v4/connection-state-recovery/

### Next.js

Next.js App Router は、React Server Components などを使える現在の推奨ルーターです。インタラクティブな入力欄、タイマー、WebSocket クライアントは Client Components として実装します。

Source: https://nextjs.org/docs/app

### Node.js

本番用途では Active LTS または Maintenance LTS を使うべきです。2026-06-07 時点では Node.js 24 が Active LTS 期間にあり、Node.js 22 も Maintenance LTS 期間にあります。

Source: https://nodejs.org/en/about/previous-releases

### E2E テスト

オンライン対戦では、1 ブラウザだけのテストでは不十分です。Playwright を使って 2 つの browser context を起動し、ルーム参加、同期、勝敗表示まで検証する方針が妥当です。

Source: https://playwright.dev/docs/languages

## 採用判断

### 採用

- Next.js App Router: UI、ページ、将来の認証・プロフィール画面に使う。
- TypeScript: リアルタイムイベントと game state の型を明確にする。
- Socket.IO: room、再接続、ack、Redis Adapter などが対戦ゲームに合う。
- PostgreSQL: ユーザー、試合履歴、ランキング、文章データを保存する。
- Redis: matchmaking、room state、Socket.IO Redis Adapter、短期状態に使う。
- Playwright: 複数ブラウザの対戦 E2E に使う。

### MVP では見送る

- WebRTC: P2P 低遅延には強いが、対戦判定をサーバー authoritative にしたいため初期採用しない。
- GraphQL: MVP の API は REST と Socket.IO events で十分。
- 高度なアンチチート: 最初はサーバー側検証と異常値検知に絞る。
- 大規模マッチメイキング: 最初は room code 参加を優先する。

## 注意点

- タイピング判定はクライアントだけに任せない。最終結果はサーバーが文章、入力位置、経過時間、ミスタイプ数から検証する。
- 進捗イベントは高頻度になりやすい。1 キーごとに全送信せず、50-100ms 程度の throttle または progress delta を使う。
- レイテンシ差で不公平が出ないよう、試合開始時刻はサーバー時刻基準で配信する。
- 試合中の文章はサーバーが決定し、クライアントから変更できないようにする。
- 切断復帰は UX と公平性のバランスを取る。短時間なら復帰、長時間なら失格または CPU 不参加扱いにする。
