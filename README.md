# 広告スキッパー

動画サイトの広告を自動スキップする Chrome 拡張機能集。

## 拡張機能

| 拡張 | 対象サイト | 概要 |
|------|-----------|------|
| [Twitch広告スキッパー](packages/extension-twitch/) | Twitch | 広告スワップ・倍速スキップ・ポイント自動取得 |
| [Prime Video広告スキッパー](packages/extension-prime/) | Prime Video | 広告を倍速+ミュートで早送り |
| [YouTube広告スキッパー](packages/extension-youtube/) | YouTube | スキップボタン自動クリック |

各拡張は独立してビルド・インストール可能です。

## クイックスタート

```bash
npm install
npm run build        # 全拡張をビルド
npm test             # ユニットテスト
```

Chrome で `chrome://extensions` →「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」で各拡張の `dist` フォルダを指定。

## 開発

```bash
npm run build:twitch    # 個別ビルド
npm run build:prime
npm run build:youtube
npm run dev -w packages/extension-twitch   # ウォッチモード
```

詳細は [docs/architecture.md](docs/architecture.md) を参照。

## ライセンス

[MIT](LICENSE)
