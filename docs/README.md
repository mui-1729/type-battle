# ドキュメント

Type Battle の設計・実装状況・運用方針をまとめています。

## まず読むもの

| ドキュメント | 役割 |
| --- | --- |
| [current-implementation.md](current-implementation.md) | **現在の `main` で何が動くかの正本** |
| [roadmap.md](roadmap.md) | 今後どの順番で進めるか |
| [requirements.md](requirements.md) | MVP / Private Beta / Public Beta の要件 |
| [game-design.md](game-design.md) | ゲームルールと画面体験 |
| [architecture.md](architecture.md) | Web / Realtime / Durable Object の技術構成 |
| [quality-ci-cd.md](quality-ci-cd.md) | テスト・CI・デプロイ・リリース基準 |
| [github.md](github.md) | Issue / PR / ブランチ運用 |

## 現在の段階

MVP と Private Beta 向けの主要機能は `main` に実装済みです。

Private Beta を「機能がある状態」から「本番環境で公開確認済みの状態」へ進めるため、現在は次を優先します。

1. **#167** Cloudflare 本番デプロイ用 Secrets / Variables を設定する
2. **#232** Production で 5〜10 試合を含む Private Beta 受け入れ確認を行う
3. **#168** Preview 用 Realtime 環境を Production から分離して実運用確認する
4. **#193** 本番依存の脆弱性監査を CI に組み込む

Security / 保守性の改善として、#196、#197、#198 も進行中です。

## ドキュメントの役割分担

### 現在の事実

[current-implementation.md](current-implementation.md) を正本にします。

- `main` に merge 済みの機能だけを「実装済み」とする
- Open PR の内容は「進行中」として分けて書く
- Issue が開いているだけの機能を実装済みにしない

### 今後の計画

[roadmap.md](roadmap.md) と [features/feature-backlog.md](features/feature-backlog.md) で管理します。

ロードマップは段階、Feature Backlog は具体的な候補タスクを扱います。

### 仕様

[features/README.md](features/README.md) 以下は機能仕様です。仕様に書かれている内容がすべて実装済みとは限りません。実装状況を判断するときは [current-implementation.md](current-implementation.md) を参照してください。

## 設計・方針

- [research.md](research.md): 初期技術調査
- [product-direction.md](product-direction.md): プロダクトの段階的な公開方針
- [requirements.md](requirements.md): 要件定義
- [game-design.md](game-design.md): ゲーム設計
- [architecture.md](architecture.md): アーキテクチャ

## 機能仕様

- [features/README.md](features/README.md): 機能仕様の目次
- [features/feature-catalog.md](features/feature-catalog.md): 機能一覧と優先度
- [features/feature-backlog.md](features/feature-backlog.md): Issue 化する候補と現在の Open Issue

## 品質・運用

- [quality-ci-cd.md](quality-ci-cd.md): Test / Build / CI / CD
- [github.md](github.md): GitHub 運用
- [git-branch-rules.md](git-branch-rules.md): 現在の推奨ブランチ / PR ルール
- [features/deployment-private-beta.md](features/deployment-private-beta.md): Private Beta デプロイ仕様

## Cloudflare 関連資料

次は Cloudflare 移行時の設計・監査記録です。**現在の構成や現在の料金・上限を判断する資料ではありません。** 現在の構成は [architecture.md](architecture.md) を優先してください。

- [cloudflare-migration-plan.md](cloudflare-migration-plan.md): 完了済みの Realtime 移行記録
- [cloudflare-issue-tracker.md](cloudflare-issue-tracker.md): 移行 Issue の分担・依存関係の履歴
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md): 移行時点の容量 / Free Tier 監査記録

## 更新ルール

実装を変更した PR では、必要に応じて同じ PR で docs も更新します。

- ゲームルール変更 → `game-design.md`
- Realtime / storage / 構成変更 → `architecture.md`
- 実装済み機能の変更 → `current-implementation.md`
- リリース基準や CI 変更 → `quality-ci-cd.md`
- 今後の優先順位変更 → `roadmap.md` / `features/feature-backlog.md`
