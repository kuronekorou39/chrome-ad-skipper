# 広告スキッパー

Twitch / Prime Video 用の広告スキップ Chrome 拡張機能。

## インストール

```bash
npm install
npm run build
```

Chrome で `chrome://extensions` を開き、「デベロッパーモード」を有効にして
**`packages/extension/dist`** フォルダを「パッケージ化されていない拡張機能を読み込む」で読み込む。

## 機能

| サイト | 機能 | 仕組み |
|--------|------|--------|
| Twitch (ライブ) | 広告スワップ | 広告中に本編サブストリームをメイン表示に差し替え |
| Twitch (VOD) | 広告スキップ | 広告動画を 16x 倍速 + ミュート |
| Twitch | ポイント自動取得 | チャンネルポイントボタンを自動クリック |
| Prime Video | 広告スキップ | 広告を 16x 倍速 + ミュート、終了後に復元 |

## 使い方

拡張機能のポップアップアイコンをクリックするとステータスが表示される。

- **Twitch**: 自動で動作。スワップ回数・ポイント取得数を表示。
- **Prime Video**: 自動で動作。ON/OFF トグルあり。スキップ回数を表示。

## 開発

```bash
npm run build:extension   # 拡張機能のみビルド
npm run dev -w packages/extension  # ウォッチモード
```

詳細は [docs/](docs/) を参照。
