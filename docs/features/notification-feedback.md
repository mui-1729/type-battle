# Notification / Feedback

運営からのお知らせ、不具合報告、ユーザーフィードバックを扱う機能です。

## 目的

- Private beta で不具合や改善要望を集めやすくする。
- Public beta で障害やメンテナンスを知らせる。
- GitHub Issues や外部フォームへの導線を明確にする。

## 対象ステージ

- Private beta: feedback link と簡単な changelog。
- Public beta: service notice、incident banner、contact。

## 機能案

- feedback link
- bug report form
- changelog
- maintenance banner
- incident notice
- release note
- in-app survey

## データ

```ts
type ServiceNotice = {
  id: string;
  level: "info" | "warning" | "incident";
  title: string;
  body: string;
  startsAt: number;
  endsAt?: number;
};
```

## UI

- Home 下部に feedback link を置く。
- 障害時は上部 banner を表示する。
- 試合中は大きな通知で入力を邪魔しない。
- Result 画面で短い feedback 導線を出す。

## サーバー挙動

- notice は静的 JSON または DB で管理する。
- incident notice は cache されすぎないようにする。
- feedback は GitHub Issues、Google Form、または専用 API に送る。

## 受け入れ条件

- feedback link から報告できる。
- feedback page から GitHub issue template に遷移できる。
- maintenance banner を表示 / 非表示にできる。
- 試合中の UI を大きく邪魔しない。
- notice が古くなったら自動で消える。

## テスト観点

- notice 表示期間。
- feedback link。
- match 中の banner 表示。
- incident level ごとの styling。

## 未決定事項

- feedback の保存先。
- Public beta で問い合わせメールを公開するか。
- GitHub Issues を public にするか。
