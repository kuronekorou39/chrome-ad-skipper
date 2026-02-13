# twitch-stream-swap

Twitch の HLS (HTTP Live Streaming) におけるサーバーサイド広告挿入 (SSAI) を調査し、
広告再生中に本編ストリームへスワップする手法を研究・実装するプロジェクト。

---

## 背景

Twitch はサーバーサイド広告挿入 (SSAI) を採用しており、広告セグメントが HLS プレイリスト内に直接注入される。
従来のクライアントサイド広告ブロックでは対処が困難だが、広告再生中にも本編の低画質ストリームが
ミニ画面 (PiP) として提供されているため、これを利用したスワップが理論上可能。

---

## 既知の技術情報

### HLS ストリーム構造

```
マスタープレイリスト (.m3u8)
├── 1080p プレイリスト (.m3u8) → segment_001.ts, segment_002.ts, ...
├── 720p  プレイリスト (.m3u8) → segment_001.ts, segment_002.ts, ...
├── 480p  プレイリスト (.m3u8) → ...
└── audio only (.m3u8) → ...
```

### CDN ドメイン

| ドメイン | 用途 |
|---------|------|
| `*.hls.ttvnw.net` | HLS セグメント配信 (CloudFront 経由) |
| `usher.ttvnw.net` | ストリーム開始時のプレイリスト取得 |
| `*.cloudfront.net` | CDN (セグメント配信) |

### セグメントリクエストの構造

```
https://{hash}.j.cloudfront.hls.ttvnw.net/v1/segment/{encoded_segment_id}.ts?dna={auth_token}
```

- `.ts` = MPEG Transport Stream (映像 + 音声バイナリ)
- 各セグメントは約 2〜4 秒分の映像/音声を含む
- `dna` パラメータに認証/DRM トークン

### 広告挿入の仕組み (実測で修正済み)

**重要: 従来想定していた m3u8 レベルの広告マーカーは使用されていない。**

```
想定していた広告時の m3u8 (実際には確認されず):
  #EXT-X-DATERANGE:CLASS="twitch-stitched"
  #EXT-X-CUE-OUT:DURATION=30
  #EXTINF:2.000
  segment_ad_001.ts
  #EXT-X-CUE-OUT-CONT
  #EXTINF:2.000
  segment_ad_002.ts
  #EXT-X-CUE-IN

実際: 通常時も広告時も m3u8 の構造は同一。
広告セグメントは m3u8 上では通常セグメントと区別がつかない。
```

広告の検出は **DOM の `<video>` 要素数の変化** (1→2) に依存する。詳細は「通常時 vs 広告時 比較分析」セクション参照。

### 広告中の画面構成

```
広告再生中の Twitch プレイヤー:

┌──────────────────────────────────┐
│                                  │
│   <video #1> 広告ストリーム        │  ← メイン HLS (広告セグメントに差し替え済み)
│                                  │
│  ┌─────────┐                     │
│  │ <video  │                     │  ← サブ video 要素 (本編の低画質ストリーム, 無音)
│  │  #2>    │                     │
│  └─────────┘                     │
└──────────────────────────────────┘
```

- 広告中、本編は **別の低画質ストリーム** として別 `<video>` 要素で再生される
- 1 つの `.ts` セグメント内に広告と本編が混在しているわけではない
- 音声はミュートされている

---

## コンセプト: ストリームスワップ

広告開始を検出し、サブの本編ストリームをメイン表示にスワップする。

```
通常時:                             広告検出後:
┌─────────────────┐               ┌─────────────────┐
│  本編 (高画質)    │               │  本編 (低画質)    │  ← サブを拡大表示
│                 │               │                 │
└─────────────────┘               └─────────────────┘
                                   広告 → display:none
```

### トレードオフ

| 項目 | 状況 |
|------|------|
| 画質 | 低下する (Twitch が意図的に制限) |
| 音声 | なし (取得方法の調査が必要) |
| 遅延 | サブストリームはメインより数秒遅れる可能性 |
| 安定性 | DOM 構造・クラス名の変更で壊れるリスク |
| BANリスク | 未知 (利用規約との関係を要確認) |

---

## 調査フェーズ: やること

### Phase 1: トラフィック解析ツールの構築

実際の通信内容を詳細に調査するためのツールを先に作る。

#### 1.1 HLS プレイリスト監視ツール

- [ ] m3u8 プレイリストのリアルタイム取得・ログ
- [ ] 広告マーカータグの検出と記録 (`#EXT-X-CUE-OUT`, `#EXT-X-CUE-IN`, `#EXT-X-DATERANGE`)
- [ ] 通常セグメントと広告セグメントの URL パターン差異の分析
- [ ] プレイリスト更新間隔の測定

#### 1.2 セグメント解析ツール

- [ ] `.ts` セグメントのダウンロードとメタデータ抽出
- [ ] 広告セグメントと本編セグメントのバイナリ比較
- [ ] セグメントヘッダ (PAT/PMT/PES) の解析
- [ ] セグメント内のタイムスタンプ (PTS/DTS) の追跡

#### 1.3 DOM/ネットワーク監視 (Chrome 拡張)

- [ ] Twitch プレイヤーの DOM 構造マッピング
- [ ] 広告中に出現する `<video>` 要素の特定
- [ ] 各 `<video>` 要素の `src` / `srcObject` の追跡
- [ ] MediaSource API の挙動監視
- [ ] `webRequest` API によるリクエストログ

#### 1.4 ネットワークログダッシュボード

- [ ] リアルタイムで HLS 通信を可視化するパネル
- [ ] セグメント種別 (本編/広告) の色分け表示
- [ ] タイムラインビュー (いつ広告が開始・終了したか)

### Phase 2: 実現可能性の検証

Phase 1 の調査結果をもとに、以下を検証する。

- [ ] 広告開始/終了の検出精度
- [ ] サブストリーム (PiP 本編) の取得方法と制約
- [ ] サブストリームの音声取得可否
- [ ] スワップ時の映像途切れ・同期ずれの程度
- [ ] MediaSource API への介入可否

### Phase 3: プロトタイプ実装

Phase 2 の結果をもとに、実装形態を決定する。

| 形態 | メリット | デメリット |
|------|---------|-----------|
| Chrome 拡張 | 導入が簡単、DOM 操作が容易 | webRequest の制限 (Manifest V3) |
| ユーザースクリプト (Tampermonkey) | 拡張より軽量 | API アクセスに制限 |
| 専用ブラウザ / Electron | 自由度が最も高い | 開発コスト大 |
| プロキシ型 | ブラウザ非依存 | HTTPS 復号が必要、複雑 |

---

## 実証データ (Phase 1 調査結果)

### 通常時 vs 広告時 比較分析 (実証済み: 2026-02-13)

#### m3u8 プレイリスト比較

| 項目 | 通常時 | 広告時 |
|------|--------|--------|
| Ad State | none | **none** (同一!) |
| Ad Markers | 0 | **0** (同一!) |
| DATERANGE タグ | timestamp, twitch-session, twitch-stream-source, twitch-trigger | 同一 |
| セグメント形式 | `#EXTINF:2.000,live` | 同一 |
| Twitch 独自タグ | PREFETCH, LIVE-SEQUENCE 等 | 同一 |

**結論: m3u8 プレイリストだけでは広告の有無を判別できない。**

#### Video 要素比較

**通常時** — Video 要素: **1 個**

| | Video #0 (本編) |
|---|---|
| Resolution | 1280x720 |
| Muted | No |
| Volume | 64% |
| Source | MediaSource/srcObject |
| Duration | LIVE |
| Display | block |
| Position | 50, 50 (716x403) |

**広告時** — Video 要素: **2 個**

| | Video #0 (広告) | Video #1 (本編サブ) |
|---|---|---|
| Resolution | 1920x1080 | 640x360 |
| Muted | No | **Yes** |
| Volume | 100% | **0%** |
| Source | MediaSource/srcObject | MediaSource/srcObject |
| Duration | LIVE | LIVE |
| Selector | (通常の video-ref 内 video) | `video#{動的ID}` |
| Display | block | block |
| Position | 50, 50 (1095x616) | **0, 0 (0x0)** |

Video #1 の selector 例: `video#0e137f9082ff4261a9033fb5d0d351a4` (ID は動的生成)

#### 広告検出の確定手法

**唯一の信頼できる広告検出シグナル: DOM 内の `<video>` 要素数**

| 状態 | video 要素数 | 判定 |
|------|-------------|------|
| 通常再生 | 1 | 広告なし |
| 広告再生中 | 2 | **広告あり** |

- m3u8 マーカー (`#EXT-X-CUE-OUT` 等) は **使用されていない**
- Video #1 (本編サブ) の特徴: muted, volume 0%, 低解像度 (640x360), 動的 ID

### プレイヤー実装

- **Amazon IVS Player SDK 1.49.0-rc.3** を使用 (HLS.js ではない)
- MediaSource は **Worker 内** で操作される (`MediaSourceHandle` 経由)
- `srcObject` に `MediaSourceHandle` が設定される

### m3u8 プレイリスト形式 (実測)

DATERANGE タグ (通常時・広告時ともに同一、広告マーカーではない):
```
#EXT-X-DATERANGE:ID="playlist-creation-...",CLASS="timestamp",...
#EXT-X-DATERANGE:ID="playlist-session-...",CLASS="twitch-session",...
#EXT-X-DATERANGE:ID="source-...",CLASS="twitch-stream-source",...,X-TV-TWITCH-STREAM-SOURCE="live"
#EXT-X-DATERANGE:ID="trigger-...",CLASS="twitch-trigger",...
```

- `#EXT-X-CUE-OUT` / `#EXT-X-CUE-IN` は **通常時・広告時ともに使用されていない**
- Twitch 独自の `#EXT-X-TWITCH-PREFETCH` タグあり (プリフェッチセグメント)
- `#EXT-X-TWITCH-LIVE-SEQUENCE`, `#EXT-X-TWITCH-ELAPSED-SECS`, `#EXT-X-TWITCH-TOTAL-SECS` — 独自メタデータ
- セグメント間隔: 2 秒 (`#EXTINF:2.000,live`)
- Target Duration: 6 秒

### CDN 実測パターン

- プレイリスト: `https://apn{N}.playlist.ttvnw.net/v1/playlist/{encoded}.m3u8`
- セグメント: `https://{hash}.j.cloudfront.hls.ttvnw.net/v1/segment/{encoded}.ts?dna={token}`

---

## 未解決の疑問

- [ ] サブストリームの音声は別途取得可能か？ (audio-only m3u8 が使えるか)
- [x] ~~広告中のサブストリームの実際の解像度は？~~ → **640x360** (実測確認済み)
- [ ] MediaSource API を直接操作してセグメントを差し替えられるか？
- [ ] Twitch の Worker / Service Worker はストリーム制御に関与しているか？
- [x] ~~広告マーカーは m3u8 以外 (WebSocket, GraphQL) でも通知されるか？~~ → m3u8 にはマーカーなし。DOM (video 要素数) が唯一の検出手段
- [ ] 地域・アカウント種別 (Turbo, Prime) による挙動差はあるか？
- [ ] サブストリーム (Video #1) の Position が 0,0 (0x0) の場合、display:none ではなく CSS で隠されているのか？
- [ ] 広告終了時の Video #1 消失タイミングはどの程度正確か？

---

## 技術スタック (調査ツール)

- **Chrome Extension (Manifest V3)** — DOM 監視、ネットワークログ
- **JavaScript / TypeScript** — ツール実装
- **hls.js (参考)** — HLS パーサーの仕組み理解
- **ffprobe / mp4box** — .ts セグメントのオフライン解析

---

## 参考

- [HLS 仕様 (RFC 8216)](https://datatracker.ietf.org/doc/html/rfc8216)
- [SCTE-35 (広告挿入マーカー規格)](https://www.scte.org/standards/)
- [hls.js GitHub](https://github.com/video-dev/hls.js)
- [MPEG-TS 仕様](https://en.wikipedia.org/wiki/MPEG_transport_stream)
