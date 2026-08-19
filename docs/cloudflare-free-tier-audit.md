# Cloudflare Free Tier 監査記録

この文書は Issue #22 で実施した、Cloudflare Realtime 移行時点の容量・コスト観点の監査記録です。

**重要:** Cloudflare の料金・無料枠・上限値は変更される可能性があります。この文書に残る数値を現在の上限として扱わず、Public Beta や負荷試験の前には公式ドキュメントと実測値で再確認してください。

## 監査の目的

Cloudflare Worker / Durable Object を Realtime backend にした場合に、Private Beta の小規模利用でどこがボトルネックになりやすいかを整理しました。

当時の主な監査対象:

- Workers Free plan
- Durable Objects
- Durable Object storage
- typing input の message 数
- COM timer
- persistence write

## 現在も有効な前提

実装の詳細は変わっても、次の考え方は現在も有効です。

- 2 人対戦では入力イベントが短時間に多く発生する
- room gameplay は room code ごとの Durable Object に分散する
- client command には ack / room update が伴う
- COM 戦では人間の入力以外に server timer の処理が発生する
- typing hot path に長期保存処理を入れない
- room 横断のランキング・検索は room authority と別責務にする

## 1 試合あたりの概算モデル

移行時の簡易モデルでは、Human-only の Race を次のように見積もりました。

- 2 人対戦
- 1 人あたり約 150 keydown
- typing command は合計約 300 件
- start / countdown / result / rematch などを加えて約 310〜340 command

これは容量を比較するための**粗いモデル**であり、Cloudflare の課金 request 数と 1:1 で一致すると保証するものではありません。

実際の判断では Worker / Durable Object の metrics と billing dashboard を優先します。

## COM 戦

COM 戦では bot timer が追加されるため、Human-only より処理回数が増えます。

移行時には 500 ms tick を前提としていましたが、現在の実装値や Cloudflare の課金単位を固定前提にしません。

Public Beta 前に確認すること:

- 1 試合あたりの bot tick 数
- bot tick 中に state change がない場合の無駄な処理
- room 数が増えたときの timer コスト
- tick 間隔を変更したときのゲーム体験

## Persistence

永続化では次を原則にします。

### Hot path に入れないもの

- typing 1 回ごとの長期ログ保存
- typing 1 回ごとの分析 DB write
- progress event の無制限な履歴保存

### 低頻度で保存するもの

- room snapshot
- guest session
- match result

room snapshot の保存頻度は Realtime の正しさと storage write の両方を見ながら調整します。

## 当時の結論

移行時点では、Private Beta の小規模利用なら Cloudflare Free で検証する余地があると判断しました。

一方、Public Beta では次を推測だけで決めず実測する必要があります。

- 1 試合あたりの Worker / Durable Object 使用量
- 同時 room 数
- 同時 WebSocket 接続数
- typing command / broadcast 数
- COM timer の使用量
- storage read / write
- 1 日・1 か月あたりの費用

## 最適化候補

実測で必要性が確認された場合に検討します。

- progress update / broadcast の coalescing
- 同じ state を送る不要な broadcast の削減
- bot timer 間隔の調整
- persistence debounce の調整
- gateway に集中する処理の分散

これらは「昔の監査で候補に挙がった」という理由だけで先に実装しません。ユーザー体験・負荷・コストの実測を Issue 化の根拠にします。

## Public Beta 前の再監査

Public Beta へ進む前に、別途 load / cost baseline を作ります。

再監査では最低限次を記録します。

1. 監査日
2. 使用 plan
3. Cloudflare 公式の当日時点の上限 / 料金
4. 対象 commit
5. 1 match の実測使用量
6. 同時接続試験の条件
7. 想定 Daily / Monthly usage
8. 最適化が必要になる閾値

## 関連

- [architecture.md](architecture.md): 現在の構成
- [current-implementation.md](current-implementation.md): 現在の実装
- [cloudflare-migration-plan.md](cloudflare-migration-plan.md): 移行記録
- [features/feature-backlog.md](features/feature-backlog.md): 今後の Issue 候補
- Issue #22（完了済み）
