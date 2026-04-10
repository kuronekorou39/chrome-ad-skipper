# アーキテクチャ

## ディレクトリ構成

```
packages/
├── extension-twitch/        Twitch 用 Chrome 拡張機能
├── extension-prime/         Prime Video 用 Chrome 拡張機能
├── extension-youtube/       YouTube 用 Chrome 拡張機能
├── shared/                  共有型定義・定数・パーサー
└── segment-analyzer/        HLS セグメント解析 CLI ツール
tools/
├── generate-icons.js        全拡張のアイコン生成
└── primevideo-probe/        Prime Video 広告調査ツール
```

各拡張は独立してビルド・リリース可能。共通の型定義と定数は `shared` パッケージに集約。

## 共通アーキテクチャ

3 つの拡張はすべて同じ基本構造を持つ。

### 拡張パッケージの構成

```
extension-*/
├── src/
│   ├── background/          Service Worker (バッジ管理等)
│   ├── content/             コンテンツスクリプト (ISOLATED world)
│   ├── page/                MAIN world スクリプト (Twitch・YouTube)
│   ├── popup/               ポップアップ UI (HTML/CSS/TS)
│   └── icons/               拡張機能アイコン (SVG + PNG)
├── manifest.json            MV3 マニフェスト (version は webpack が注入)
├── webpack.config.js
└── package.json             独立バージョン管理
```

### Two-World アーキテクチャ

Twitch と YouTube では 2 つの JS 実行コンテキストを使用:

| World | ファイル | 役割 |
|-------|---------|------|
| ISOLATED | `content-script.ts` | Chrome API アクセス、DOM 監視、広告検出 |
| MAIN | `page-script.ts` | ページの JS コンテキスト、プレイヤー API 操作 |

両者は `window.postMessage` で通信。MAIN world はマニフェストの `"world": "MAIN"` で登録。

Prime Video は ISOLATED world のみで完結（プレイヤー API へのアクセスが不要）。

### ポップアップ

各拡張のポップアップは同じ構造:

- **ステータスタブ** — 接続状態・統計情報
- **ログタブ** — イベントログ (コピー機能付き)
- **設定タブ** — 各機能の ON/OFF・パラメータ調整

タブの URL からサイトを判定し、コンテンツスクリプトにメッセージを送ってステータスを取得:

| 拡張 | URL パターン | メッセージ |
|------|-------------|-----------|
| Twitch | `*twitch.tv*` | `get-swap-status` |
| Prime Video | `*amazon.*` / `*primevideo.*` | `get-prime-status` |
| YouTube | `*youtube.com*` | `get-youtube-status` |

### Service Worker

各拡張のバックグラウンド Service Worker は共通の役割:

- `badge-update` メッセージを受けてバッジのテキスト・色を更新
- サイトから離脱したらバッジをクリア

Twitch のみ追加で webRequest による HLS トラフィック監視と DevTools 連携を行う。

---

## サイト別の広告検出と処理

### Twitch

最も複雑な実装。複数の広告対策を組み合わせて使用。

#### ライブ配信 — 広告スワップ

- **検出**: DOM 内の `<video>` 要素数が 1→2 に変化 = 広告開始
- **処理**: 広告 video を非表示にし、サブストリーム (本編低画質) をメイン表示に拡大
- **MAIN world**: `muted`/`volume` プロパティを Override して Twitch による再ミュートをブロック
- **制約**: 広告中は低画質 (640x360)

#### ライブ配信 — 広告ミュート+倍速 (フォールバック)

- スワップ不可時に動作
- 広告 video を倍速 + ミュートで早送り

#### VOD

- **検出**: `[data-a-target="ax-overlay"] video` の出現
- **処理**: 広告 video を倍速 + ミュート

#### その他機能

| モジュール | 機能 |
|-----------|------|
| `points-claimer.ts` | チャンネルポイントボタン自動クリック |
| `chat-keeper.ts` | チャット折り畳み時も PbyP プレイヤーを維持 |
| `dom-observer.ts` | video 要素の出現/消滅を MutationObserver で監視 |
| `video-tracker.ts` | video 状態を定期ポーリングして DevTools に送信 |

### Prime Video

シンプルな実装。ISOLATED world のみ。

- **検出**: `[class*="atvwebplayersdk-ad"]` オーバーレイの可視性 + タイマー要素の存在
- **処理**: 再生中 video を 16x + ミュート
- **復元**: 広告終了後に 1x + 元の音量に自動復元
- **速度調整**: 残り時間に応じて段階的に減速 (≤3秒→4x、≤1秒→2x)

### YouTube

MAIN world が必須。YouTube はプログラム的な `.click()` を `isTrusted` チェックで拒否するため。

- **検出**: `#movie_player` の `.ad-showing` クラスを MutationObserver + ポーリングで監視
- **処理**:
  1. MAIN world からスキップボタンをクリック
  2. スキップ不可の場合、`player.seekTo()` または `video.currentTime = duration` でシーク
  3. 広告終了後に `player.playVideo()` で再生を再開
- **スキップボタンセレクタ**: `.ytp-skip-ad-button`, `.ytp-ad-skip-button-modern` 等 (YouTube が頻繁に変更)

## ビルド

各拡張は webpack でバンドル。`CopyPlugin` がマニフェストにバージョンを注入し、HTML/CSS/アイコンを `dist/` にコピー。

```bash
npm run build           # 全パッケージビルド
npm run build:twitch    # 個別ビルド
npm run build:prime
npm run build:youtube
npm test                # vitest でユニットテスト (shared パッケージ)
```
