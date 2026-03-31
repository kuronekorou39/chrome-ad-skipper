# アーキテクチャ

## ディレクトリ構成

```
packages/
├── extension-twitch/        Twitch 用 Chrome 拡張機能
│   ├── src/
│   │   ├── background/      Service Worker (webRequest ログ等)
│   │   ├── content/         コンテンツスクリプト (後述)
│   │   ├── page/            MAIN world スクリプト
│   │   ├── popup/           ポップアップ UI
│   │   ├── devtools/        DevTools パネル (HLS 解析用)
│   │   └── icons/           拡張機能アイコン
│   ├── dist/                ビルド出力 (← Chrome に読み込むフォルダ)
│   ├── manifest.json
│   └── webpack.config.js
├── extension-prime/         Prime Video 用 Chrome 拡張機能
│   ├── src/
│   │   ├── background/      Service Worker
│   │   ├── content/         コンテンツスクリプト
│   │   ├── popup/           ポップアップ UI
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

サイトごとに拡張を分離。各拡張は独立してビルド・リリース可能。

### Twitch 拡張 (`extension-twitch/src/content/`)

```
content/
├── content-script.ts       エントリポイント
├── stream-swapper.ts       ライブ広告スワップ
├── vod-ad-handler.ts       VOD 広告スキップ (16x)
├── live-ad-handler.ts      ライブ広告ミュート + 倍速
├── chat-keeper.ts          チャット折り畳み時も PbyP を維持
├── points-claimer.ts       チャンネルポイント自動取得
├── dom-observer.ts         video 要素の DOM 監視
├── video-tracker.ts        video 状態ポーリング
├── bridge.ts               MAIN ↔ ISOLATED world 通信
└── skip-overlay.ts         広告スキップ中オーバーレイ
```

### Prime Video 拡張 (`extension-prime/src/content/`)

```
content/
├── content-script.ts       エントリポイント
├── prime-ad-handler.ts     広告スキップ (16x)
└── skip-overlay.ts         広告スキップ中オーバーレイ
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
