<div align="center">

<img src="src/icons/icon-128.png" width="96" height="96" alt="Twitch広告スキッパー">

# Twitch広告スキッパー

**Twitch の広告を自動で処理する Chrome 拡張機能**

![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=flat-square&logo=twitch&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

</div>

---

## 機能

| 機能 | 対象 | 仕組み |
|------|------|--------|
| **広告スワップ** | ライブ配信 | 広告中に本編サブストリーム（低画質）をメイン表示に差し替え |
| **広告ミュート+倍速** | ライブ配信 | スワップ不可時に広告をミュート+倍速で早送り |
| **VOD広告スキップ** | アーカイブ | 広告動画を倍速+ミュートで早送り |
| **ポイント自動取得** | 全般 | チャンネルポイントボタンを自動クリック |
| **チャット維持** | ライブ配信 | チャット折り畳み時も PbyP プレイヤーを維持 |

## インストール

```bash
npm install
npm run build:twitch
```

Chrome で `chrome://extensions` → デベロッパーモード → `packages/extension-twitch/dist` を読み込む。

## 設定

ポップアップの「設定」タブから各機能の ON/OFF、広告早送り速度、オーバーレイ不透明度を調整可能。

## 仕組み

Two-World アーキテクチャを使用:

- **ISOLATED world** — Chrome API アクセス、DOM 操作、広告検出
- **MAIN world** — ページの JS コンテキストで MediaSource/fetch フック、`muted`/`volume` Override

詳細は [docs/architecture.md](../../docs/architecture.md) を参照。
