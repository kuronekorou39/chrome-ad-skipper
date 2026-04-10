<div align="center">

<img src="src/icons/icon-128.png" width="96" height="96" alt="YouTube広告スキッパー">

# YouTube広告スキッパー

**YouTube の広告を自動スキップする Chrome 拡張機能**

![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=flat-square&logo=youtube&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

</div>

---

## 機能

| 機能 | 仕組み |
|------|--------|
| **広告検出** | `#movie_player` の `.ad-showing` クラスを監視 |
| **自動スキップ** | スキップボタン出現時に MAIN world 経由でクリック |
| **シークスキップ** | スキップ不可広告は動画シークで早送り |
| **自動再生再開** | 広告終了後に `playVideo()` で再生を再開 |

## インストール

```bash
npm install
npm run build:youtube
```

Chrome で `chrome://extensions` → デベロッパーモード → `packages/extension-youtube/dist` を読み込む。

## 設定

ポップアップの「設定」タブから以下を調整可能:

- 自動スキップの ON/OFF
- オーバーレイ不透明度

## 注意

> YouTube は広告ブロックへの対策を頻繁に更新するため、スキップボタンのセレクタやプレイヤーの挙動が変更される可能性があります。動作しない場合は [Issue](../../issues) を報告してください。
