# アーキテクチャ

## ディレクトリ構成

```
packages/
├── extension/               Chrome 拡張機能本体
│   ├── src/
│   │   ├── background/      Service Worker (webRequest ログ等)
│   │   ├── content/         コンテンツスクリプト (後述)
│   │   ├── page/            MAIN world スクリプト (Twitch)
│   │   ├── popup/           ポップアップ UI
│   │   ├── devtools/        DevTools パネル (HLS 解析用)
│   │   └── icons/           拡張機能アイコン
│   ├── dist/                ビルド出力 (← Chrome に読み込むフォルダ)
│   ├── manifest.json
│   └── webpack.config.js
├── shared/                  共有型定義・定数
└── segment-analyzer/        HLS セグメント解析 CLI ツール
tools/
└── primevideo-probe/        Prime Video 広告調査ツール (統合前の原型)
```

## コンテンツスクリプト構成

サイトごとにエントリポイントを分離。共通モジュールは共有。

```
src/content/
├── content-script.ts           Twitch 用エントリポイント
├── prime-content-script.ts     Prime Video 用エントリポイント
├── stream-swapper.ts           Twitch ライブ広告スワップ
├── vod-ad-handler.ts           Twitch VOD 広告スキップ (16x)
├── chat-keeper.ts              チャット折り畳み時も PbyP を維持
├── points-claimer.ts           チャンネルポイント自動取得
├── prime-ad-handler.ts         Prime Video 広告スキップ (16x)
├── dom-observer.ts             video 要素の DOM 監視 (共通)
├── video-tracker.ts            video 状態ポーリング (共通)
└── bridge.ts                   MAIN ↔ ISOLATED world 通信 (共通)
```

## サイト別の広告検出方式

### Twitch (ライブ)

- **検出**: DOM 内の `<video>` 要素数が 1→2 に変化 = 広告開始
- **処理**: 広告 video を非表示にし、サブストリーム (本編低画質) をメイン表示に拡大
- **制約**: 広告中は低画質 (640x360)、音声なし

### Twitch (VOD)

- **検出**: `[data-a-target="ax-overlay"] video` の出現
- **処理**: 広告 video を 16x + ミュート

### Prime Video

- **検出**: `[class*="atvwebplayersdk-ad"]` オーバーレイの可視性
- **処理**: 再生中 video を 16x + ミュート、広告終了後に 1x + 元の音量に復元

## Two-World アーキテクチャ (Twitch のみ)

Twitch では 2 つの JS 実行コンテキストを使用:

- **ISOLATED world** (`content-script.ts`) — Chrome API アクセス、DOM 操作
- **MAIN world** (`page-script.ts`) — ページの JS コンテキスト、MediaSource/fetch フック

`Bridge` クラスが `window.postMessage` で両者を中継。

## ポップアップ

タブの URL からサイトを判定し、対応するコンテンツスクリプトにステータスを問い合わせる。

| URL パターン | サイト判定 | メッセージ |
|-------------|-----------|-----------|
| `*twitch.tv*` | Twitch | `get-swap-status` |
| `*amazon.*` / `*primevideo.*` | Prime Video | `get-prime-status` |
| その他 | — | 「サイトを開いてください」表示 |
