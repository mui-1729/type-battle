# 依存関係の脆弱性監査ポリシー

## 2026-08-15 時点の基準

Vercel の install 時に表示される依存関係の警告を、本番依存のみの監査と全依存の監査に分けて確認した。

- `npm audit --omit=dev`: **0件**
- 全依存を対象にした `npm audit`: **high 6件**

6件の high は開発・テスト用ツールチェーンに限定されている。主に ESLint / TypeScript 周辺（`brace-expansion`, `js-yaml`）と Cloudflare 開発ツール（`wrangler` / `miniflare` 配下の `sharp`, `undici`）で、本番依存グラフには含まれていない。

## CI ポリシー

CI では次を実行する。

```sh
npm audit --omit=dev --audit-level=high
```

本番依存グラフへ新たな high または critical の脆弱性が入った場合は CI を失敗させる。これにより runtime へ影響する脆弱性は release blocker として扱いつつ、開発ツールだけの一時的な advisory で無関係なアプリ修正を止めない。

全依存の監査はツールチェーン更新時に継続して確認する。`npm audit fix --force` は盲目的に使用せず、Next.js / Playwright / Wrangler / Miniflare / ESLint / TypeScript などの major 更新は通常の lint / typecheck / test / build / E2E を通して検証する。

## Vercel での install

Vercel は現在正常に動いている monorepo install 経路を維持する。repository-level の `npm ci --prefix=../..` override も検証したが、Vercel の Root Directory / workspace 実行環境では optional platform package の解決差により、有効な lockfile でも install が失敗したため採用しない。

再現性は GitHub CI の root-level `npm ci` で担保し、Preview deployment は既知の正常な Vercel install 経路を使用する。
