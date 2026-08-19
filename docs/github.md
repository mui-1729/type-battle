# GitHub 運用

Type Battle の Issue / branch / PR / merge の基本ルールです。

## 基本方針

- `main` は動作確認済みの安定版として扱う
- `main` へ直接 push しない
- 変更は Pull Request 経由で入れる
- CI が green でない PR は merge しない
- 1 PR はできるだけ 1 つの目的に絞る
- Issue / docs / 実装の状態を同じ PR で必要に応じて更新する

## `main` の保護

Repository Ruleset で `main` を保護しています。

- Pull Request 必須
- required status check: `ci`
- force push 禁止
- branch deletion 禁止
- bypass actor なし
- required review は個人開発を妨げない設定

`ci` では lint / typecheck / test / build / E2E を実行します。

## ブランチ

通常の変更では目的が分かる名前を使います。

```txt
feat/<topic>
fix/<topic>
refactor/<topic>
test/<topic>
docs/<topic>
chore/<topic>
```

自動エージェントが独立した作業 branch を作る場合は `agent/<topic>` を使用して構いません。

詳細は [git-branch-rules.md](git-branch-rules.md) も参照してください。

## Commit

Conventional Commits に合わせます。

```txt
<type>[optional scope]: <description>
```

主に使う type:

- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: 挙動を変えない責務整理
- `test`: テスト
- `docs`: ドキュメント
- `security`: security 改善
- `chore`: 運用・設定・依存関係など

## Issue の役割

Issue は「やること」を追跡します。現在の実装状態そのものの正本にはしません。

現在の実装状態は [current-implementation.md](current-implementation.md) を参照します。

### Issue 本文の推奨構成

```md
## 状態
P0 / P1 / P2 など。Open PR がある場合はここに書く。

## 目的
なぜ必要か。

## 対応内容
何を変えるか。

## 受け入れ条件
- [ ] ...

## テスト
- ...

## 関連
- Issue / PR / docs
```

すべての Issue で完全に同じ見出しを強制する必要はありませんが、「今どこまで進んでいるか」と「何をもって完了か」は読める状態にします。

## 優先度

- `P0`: Private Beta 公開・重大な本番問題を止めるもの
- `P1`: 早めに解消したい品質・運用問題
- `P2`: defense in depth / refactor / Public Beta 準備
- `P3`: 長期拡張

優先度は severity と同じではありません。たとえば refactor はコードが大きくても、現時点で障害を起こしていなければ P2 とします。

## Issue 整理ルール

- 実装済みの内容と重複する Issue を作らない
- Open PR ができたら Issue に PR と残作業を書く
- PR が一部だけを実装する場合は `Refs #...` とし、Issue を誤って close しない
- 完了 PR なら `Closes #...` を使う
- 既に完了した Issue を関連欄に書く場合は「完了済み」と分かるようにする
- 外部設定が必要な Issue は「コード変更」と混ぜない
- 親 Issue は子 Issue の状態を定期的に更新する

現在の主要 Open Issue は [features/feature-backlog.md](features/feature-backlog.md) にまとめます。

## PR ルール

PR 本文には最低限、次を含めます。

- 何を変えるか
- なぜ必要か
- Issue との関係
- テスト / 検証内容
- deploy や migration への影響

### Realtime / game logic を変更する場合

- shared event type を必要に応じて更新する
- Worker / Web の contract を同時に確認する
- game rule を変えたら [game-design.md](game-design.md) を更新する
- architecture を変えたら [architecture.md](architecture.md) を更新する
- 主要フローを変えたら E2E を更新する

### Refactor の場合

- user-visible behavior を変える変更と混ぜない
- 分割前に既存テストで挙動を固定する
- 「ファイルを小さくする」ではなく、責務・入力・出力の境界を目的にする

## Merge 後

必要に応じて次を確認します。

- Issue が正しく close / open のままになっている
- docs が `main` の実装と一致している
- Worker 変更なら deploy 対象か判断する
- Production へ出した場合は smoke / health を確認する

## Release 関連

Private Beta の Production deploy / rollback は [features/deployment-private-beta.md](features/deployment-private-beta.md) にまとめます。

現在は #167 が Production Secrets、#232 が Production acceptance のゲートです。
