# Git / ブランチ運用ルール

このプロジェクトでは、Issue 単位で branch を切り、PR でレビューしてから `main` に取り込みます。
AI エージェントが作業する場合もこのルールに従います。

## 基本方針

- 作業 branch は必ず最新の `main` から切る。
- 1 issue に対して 1 branch / 1 PR を基本にする。
- 大きい作業は tracking issue で分割し、個別 issue ごとに PR を作る。
- PR は小さく保ち、同じファイルを複数人で同時に触らないようにする。
- Cloudflare 移行のような並行作業では、tracking issue の担当分けと merge 順を優先する。
- 複数人で並行作業する場合は、担当 issue ごとに `git worktree` を分ける。

## ブランチ命名

```txt
<type>/<issue-number>-<short-description>
```

### type

| type | 用途 |
| --- | --- |
| `feature` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング |
| `docs` | ドキュメント変更 |
| `chore` | 設定、依存関係、運用作業 |
| `test` | テスト追加、テスト修正 |

### 例

```txt
feature/16-web-cloudflare-transport
refactor/10-room-engine-runtime-neutral
docs/22-cloudflare-free-tier-risk
chore/8-cloudflare-worker-skeleton
```

### ルール

- issue 番号を必ず含める。
- 説明は英語・小文字・ハイフン区切りにする。
- 説明は短くし、30 文字程度を目安にする。
- `main` に直接 commit しない。


## worktree 運用

複数人や複数エージェントで並行作業する場合は、`main` の checkout で直接作業せず、issue ごとに worktree を作ります。

### 基本手順

```bash
git switch main
git pull --ff-only origin main
git worktree add -b <type>/<issue-number>-<short-description> ../type-battle-issue-<issue-number> main
```

作業は作成した worktree 側で行います。

```bash
cd ../type-battle-issue-<issue-number>
```

### 例

```bash
git worktree add -b feature/9-cloudflare-transport-contract ../type-battle-issue-9 main
git worktree add -b refactor/10-room-engine-runtime-neutral ../type-battle-issue-10 main
git worktree add -b feature/16-web-cloudflare-transport ../type-battle-issue-16 main
```

### ルール

- `main` の作業ディレクトリでは直接実装しない。
- 1 issue につき 1 worktree を基本にする。
- worktree 名は `../type-battle-issue-<issue-number>` を基本にする。
- 新しい issue に着手する前に、元の repo の `main` を `origin/main` に合わせる。
- merge 済み branch の worktree は削除する。

```bash
git worktree remove ../type-battle-issue-<issue-number>
git branch -d <type>/<issue-number>-<short-description>
```
## コミットメッセージ

Conventional Commits 形式を使います。

```txt
<type>(<scope>): <要約>
```

scope は必要な場合だけ付けます。

### type

| type | 用途 |
| --- | --- |
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング |
| `test` | テスト追加、テスト修正 |
| `docs` | ドキュメント変更 |
| `chore` | 設定、依存関係、運用作業 |
| `style` | 表記やフォーマットのみの変更 |

### 例

```txt
feat(web): Cloudflare realtime adapterを追加
refactor(game): room状態管理をruntime非依存に分離
docs(cloudflare): 無料枠のrealtimeリスクを整理
chore(cloudflare): Workerワークスペースを追加
```

### ルール

- 1 行目は 50 文字以内を目安にする。
- 日本語の要約を基本にする。
- 何を変えたかだけでなく、目的が伝わるように書く。
- AI が作った commit message もこのルールに合わせる。

## PR タイトル

PR タイトルも Conventional Commits 形式にします。

```txt
feat(web): Cloudflare realtime adapterを追加 (#16)
```

### ルール

- issue 番号をタイトルか本文に含める。
- タイトルは日本語 Conventional 形式を基本にする。
- 複数 issue を閉じる PR は、本文に対象 issue を列挙する。

## PR 本文

本文には以下を含めます。

- 変更の概要
- なぜ必要か
- 影響範囲
- テスト結果
- UI 変更がある場合はスクリーンショット

## Merge ルール

- Squash merge を基本にする。
- CI が通ってから merge する。
- 最低 1 人のレビュー承認を得る。
- AI が作った PR もレビュー必須とする。
- conflict が起きた場合は、作業 branch 側を最新 `main` に追従させて解消する。

## Cloudflare 移行時の注意

- `apps/web/app/page.tsx` は web integration 担当だけが触る。
- `packages/shared/src/room-engine.ts` は room engine 担当だけが触る。
- `apps/cloudflare-worker/wrangler.toml` は Cloudflare 基盤担当と backend 担当で事前に同期する。
- `package-lock.json` を触る PR は同時に複数出さない。
- cleanup PR は最後に単独で出す。

## AI エージェント向け短縮ルール

```md
## Git Rules

- Start every branch from the latest `main`.
- Use `git worktree` for issue-based parallel work.
- Branch naming: `<type>/<issue-number>-<short-description>`.
- Include the issue number in every branch name.
- Use Conventional Commits for commits and PR titles.
- Prefer Japanese summaries in commit and PR titles.
- Keep the first commit line around 50 characters.
- Do not mix unrelated changes in one PR.
- Prefer squash merge.
```
