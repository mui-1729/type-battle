# Docs

タイピング対戦オンラインゲームを作るための準備資料です。

## 目次

- [research.md](research.md): 調査結果と採用判断
- [product-direction.md](product-direction.md): 内輪向けから一般公開までのプロダクト方針
- [requirements.md](requirements.md): MVP と将来要件
- [game-design.md](game-design.md): ルール、画面、ゲーム体験
- [architecture.md](architecture.md): 技術構成、データ、リアルタイム同期
- [github.md](github.md): GitHub 連携、ブランチ、Issue、PR 運用
- [roadmap.md](roadmap.md): 段階的な開発計画

## 方針

最初の目標は、派手な機能よりも「2 人が同じ文章で対戦し、結果が正しく同期される」ことです。

公開方針は段階的にします。まずは内輪で遊べる private beta を目指し、安定性、ログ、最低限の安全対策が整ったら public beta を検討します。

MVP では次を優先します。

- ルーム作成と参加
- 同一文章でのカウントダウン開始
- タイピング進捗のリアルタイム同期
- WPM、正確率、順位の算出
- 試合終了と結果表示
- 切断時の最低限の復帰または敗北扱い

認証、ランキング、課金、フレンド、観戦、大会機能は MVP 後に追加します。
