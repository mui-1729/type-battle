# Free Tier 容量・運用監査

**監査日時:** 2026-08-22 JST
**対象:** Cloudflare Workers Free / Durable Objects Free、Vercel Hobby
**方針:** このプロジェクトは **Cloudflare Workers Free と Vercel Hobby/free tier のみ**を使用し、paid-only feature や超過課金を前提にしません。

料金・上限は変更され得ます。以下は監査日時点で取得した公式文書に基づく値であり、load baseline や公開判定の直前にリンク先を再確認します。

## 公式 hard limits

| Service / dimension | Free tier limit verified on 2026-08-22 | Exhaustion behavior / note | Official source |
| --- | ---: | --- | --- |
| Cloudflare Workers requests | 100,000 requests/day | 00:00 UTC reset。超過時は Error 1027 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#request-limits) |
| Workers CPU per HTTP request | 10 ms | 継続的超過は実行終了、Error 1102 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) |
| Workers memory | 128 MB/isolate | 超過時に request cancellation / Error 1102 の可能性 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#memory) |
| Workers subrequests | 50/invocation | Free plan hard limit | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests) |
| Durable Objects requests | 100,000/day | HTTP、RPC session、WebSocket message、alarm を含む。超過した種類の操作は失敗し、00:00 UTC reset | [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#durable-objects) |
| Durable Objects duration | 13,000 GB-s/day | Free allocation。超過した種類の操作は失敗 | [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#durable-objects) |
| Durable Objects SQLite reads | 5,000,000 rows/day | Free plan は SQLite-backed Durable Objects のみ | [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#sqlite-storage-backend) |
| Durable Objects SQLite writes | 100,000 rows/day | alarm と delete も write として数える | [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#sqlite-storage-backend) |
| Durable Objects SQLite stored data | 5 GB/account、1 GB/object | object 上限到達後は write が `SQLITE_FULL`、read / delete は継続可能 | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#sqlite-storage-backend) / [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/#sqlite-storage-backend) |
| Vercel Hobby Edge Requests | 1,000,000/month | Hobby は included usage 超過時に pause | [Vercel Hobby](https://vercel.com/docs/plans/hobby) / [Account plans](https://vercel.com/docs/plans#managing-plan-usage) |
| Vercel Hobby Fast Data Transfer | 100 GB | Hobby included resource | [Account plans](https://vercel.com/docs/plans#hobby) |
| Vercel Hobby deployments | 100/day | Hobby plan limit | [Vercel Hobby](https://vercel.com/docs/plans/hobby) |

Vercel Hobby は公式に **non-commercial, personal use only** とされています。超過時は通常、その機能を再利用できるまで 30 日待つ必要があり、Hobby plan は free-tier usage 超過時に pause されます。商用利用や継続可用性が必要になった場合、無料枠のまま可能とは判断せず、公開範囲を縮小または停止して方針を再検討します。

Durable Objects の WebSocket は接続作成に request が必要です。incoming message は compute request の計算で 20:1、outgoing message と protocol ping は request 課金対象外ですが、この比率だけから容量を保証しません。application message、接続時間、hibernation、storage write を dashboard の実測で確認します。

## Project hard caps

公式上限より十分低い段階で停止するため、#238 の load harness に次の **project hard cap** を適用します。

| Item | Project cap |
| --- | ---: |
| Simultaneous rooms | 20 |
| WebSocket connections | 40 |
| Execution | 明示 URL + confirmation を指定した手動実行のみ |
| Automation | CI / cron / Nightly からの実行禁止 |
| Test type | baseline のみ。自動 stress / soak / unbounded test 禁止 |

この 20 rooms / 40 sockets は Free tier の安全容量を保証する数値ではなく、誤実行の被害を限定するための上限です。1 match 当たりの requests、messages、duration、rows read / written が未計測なので、この cap 内でも quota を使い切る可能性があります。

## Monitoring and rollback before exhaustion

1. 実行前に Cloudflare / Vercel dashboard の当日・当月 usage と error を記録します。
2. 対象 URL、commit SHA、rooms、sockets、試合数、開始・終了時刻を結果へ保存します。
3. request、DO duration、rows written、Edge Requests、Fast Data Transfer、error rate の異常増加を確認したら追加実行を止めます。
4. quota 枯渇を待たず、新規対戦受付を停止するか公開範囲を縮小します。
5. Worker は直前の既知 commit、Web は既知の正常 deployment へ rollback し、health / WebSocket smoke を再確認します。
6. paid-only alerting、Log Drains、Spend Management、自動 scale-up は利用可能と仮定しません。Free dashboard / email notification と手動 runbook で運用します。

## Current deployment risk

2026-08-22 時点で Production Worker は `ae61854`、current `main` は `0eb93af` で、**34 commits の drift** があります。Preview Worker は未デプロイです。

したがって現時点では容量試験より先に次を完了します。

1. #167 Production deploy credentials / variables
2. current `main` の deploy と `/health.commitSha` 照合
3. #232 Production acceptance
4. #168 Preview Worker deploy / 2 client validation

Production / Preview の外部状態は repository 内のコードだけでは更新できません。credential 値は docs、Issue、PR、log に記録しません。

## Workload model to measure

- 1 match 当たりの Worker / Durable Object requests
- incoming WebSocket messages と connection churn
- Durable Object duration と hibernation
- room snapshot / result / guest session の rows read / written
- COM timer の invocation / duration
- singleton Gateway の queue latency
- Vercel Edge Requests / Fast Data Transfer

過去の「2 人 × 約 150 keydown、約 310〜340 command」という値は粗い設計モデルにすぎず、Cloudflare の課金 request と 1:1 ではありません。容量判断には dashboard の実測を使います。

## Related documents

- [architecture.md](architecture.md): current architecture
- [current-implementation.md](current-implementation.md): current `main` implementation
- [features/deployment-private-beta.md](features/deployment-private-beta.md): deploy / rollback runbook
- [quality-ci-cd.md](quality-ci-cd.md): test and release gates
- [roadmap.md](roadmap.md): #167 / #168 / #232 / #238 / #242 status
