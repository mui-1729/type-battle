# Git / ブランチ運用ルール

この文書は、Type Battle で日常的に使う Git / ブランチ運用の推奨ルールです。

GitHub 上で実際に強制される設定は repository ruleset が正です。現在の強制内容は [github.md](github.md) にまとめます。

## 基本方針

- `main` へ直接 push せず、Pull Request 経由で変更する。
- 作業 branch は原則として最新の `main` から切る。
- 1 PR は 1 つの目的に絞る。
- 大きな Issue は、独立して確認できる単位へ段階的に分ける。
- Open PR が依存する場合は、本文に依存関係と merge 順を明記する。
- unrelated な変更を同じ PR に混ぜない。

## ブランチ名

人が作る branch は、次のような短い名前を推奨します。

```txt
feat/<short-description>
fix/<short-description>
refactor/<short-description>
docs/<short-description>
chore/<short-description>
test/<short-description>
```

Issue 番号がある場合は含めても構いません。

```txt
fix/168-preview-realtime
refactor/197-web-session
```

AI / 自動化ツールが専用 prefix を使う場合は、そのツールの規約を優先して構いません。

```txt
agent/docs-issue-cleanup
```

重要なのは prefix の完全統一よりも、PR の目的と対象 Issue が追えることです。

## ローカルでの並行作業

複数の branch を同時に触る場合は `git worktree` を使うと安全です。ただし必須ではありません。

```bash
git switch main
git pull --ff-only origin main
git worktree add -b feat/example ../type-battle-example main
```

作業完了後は不要な worktree を削除します。

```bash
git worktree remove ../type-battle-example
git branch -d feat/example
```

## コミットメッセージ

Conventional Commits 形式を使います。

```txt
<type>(<scope>): <要約>
```

主な `type`:

| type | 用途 |
| --- | --- |
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | 挙動を変えない整理 |
| `test` | テスト |
| `docs` | ドキュメント |
| `chore` | 設定・依存関係・運用 |
| `style` | 表記・フォーマットのみ |

例:

```txt
feat(web): 対戦モード選択を追加する
fix(mobile): iOSの入力画面を安定化する
refactor(worker): 永続化責務を分離する
docs: Issueと現在地を整理する
```

要約は日本語でも英語でも構いませんが、何を変えたかが短く分かる形にします。

## PR タイトル

PR タイトルも Conventional Commits 形式を基本にします。

```txt
fix(preview): Realtime接続先を本番から分離する
```

Issue を完了する PR は本文で `Closes #123`、段階的な PR は `Refs #123` のように区別します。

## PR 本文

実装 PR では、最低限次を記載します。

- 何を変更したか
- なぜ必要か
- 対象 Issue / 関連 PR
- 影響範囲
- 実行したテスト
- 残作業

UI を変更した場合は、必要に応じてスクリーンショットや実機確認結果も残します。

## Merge ルール

- required CI が成功してから merge する。
- branch protection / ruleset を迂回して `main` へ入れない。
- Squash merge を基本とする。
- レビューは重要な変更では推奨するが、現在の repository ruleset では必須人数を固定していない。
- conflict がある場合は、作業 branch を最新 `main` に追従させて解消する。

## 複数 PR を並行させるとき

同じ大きな Issue を段階的に進める場合は、PR 本文に次を明記します。

- この PR が何段階目か
- base が `main` 以外の場合、その理由
- この PR 単独で親 Issue を close するかどうか
- 次に残る責務

現在の #197 / #198 のような段階的リファクタでは、この形式を使います。

## 更新方針

GitHub の実設定とこの文書が食い違った場合は、先に [github.md](github.md) と実際の repository ruleset を確認します。

過去の Cloudflare 移行時だけ必要だった担当固定・merge 順は、現在の一般ルールには含めません。履歴は [cloudflare-issue-tracker.md](cloudflare-issue-tracker.md) に残します。
