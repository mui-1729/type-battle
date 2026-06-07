# GitHub 連携・運用

## 現在のローカル状態

2026-06-07 時点で、この作業ディレクトリは Git リポジトリとして初期化済みです。GitHub CLI も認証済みのため、GitHub リポジトリを作成して remote 接続できます。

## 推奨リポジトリ設定

- Repository name: `type-battle`
- Visibility: 最初は `private` 推奨
- Default branch: `main`
- Issue templates: 後で追加
- GitHub Actions: 実装開始後に追加

## 初期接続手順

```bash
git add README.md docs
git commit -m "Add initial planning docs"
gh repo create type-battle --private --source=. --remote=origin --push
```

すでに GitHub 側に空リポジトリを作っている場合は、代わりに次を使います。

```bash
git remote add origin git@github.com:<owner>/type-battle.git
git push -u origin main
```

## ブランチ運用

- `main`: 動作確認済みの安定版
- `feat/<topic>`: 新機能
- `fix/<topic>`: バグ修正
- `docs/<topic>`: ドキュメント更新

例:

```bash
git checkout -b feat/mvp-room-match
```

## Issue 分類

- `feature`: 新機能
- `bug`: バグ
- `docs`: ドキュメント
- `infra`: デプロイ、CI、DB、Redis
- `test`: テスト
- `game-design`: ルール、スコア、体験設計

## 最初に作る Issue 案

1. Project scaffold: Next.js + TypeScript
2. Shared event types package
3. Realtime server scaffold
4. Room create / join
5. Countdown and match start
6. Typing progress sync
7. Finish validation and result screen
8. Two-player Playwright E2E
9. Basic prompt text dataset
10. Deployment investigation

## PR ルール

- 1 PR は 1 つの目的に絞る。
- 実装 PR には最低限のテストを含める。
- 実装 PR は lint、typecheck、test、build を通す。
- Socket.IO event payload を変更する場合は `packages/shared` の型も更新する。
- ゲームルール変更は `docs/game-design.md` も更新する。
- Test / Build / CI / CD の詳細は [quality-ci-cd.md](quality-ci-cd.md) に従う。

## GitHub Actions 初期案

実装開始後に次を追加します。

- install
- lint
- typecheck
- unit tests
- integration tests
- build
- Playwright E2E
- private beta deploy smoke

Node.js は LTS を使います。2026-06-07 時点では Node.js 24 LTS を第一候補にします。

## Branch Protection 初期案

実装開始後、private beta 前に `main` に次を設定します。

- pull request 必須
- CI 成功必須
- force push 禁止
- branch deletion 禁止
