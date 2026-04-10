<div align="center">

<img src="src/icons/icon-128.png" width="96" height="96" alt="Prime Video広告スキッパー">

# Prime Video広告スキッパー

**Prime Video の広告を自動スキップする Chrome 拡張機能**

![Prime Video](https://img.shields.io/badge/Prime_Video-00A8E1?style=flat-square&logo=primevideo&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

</div>

---

## 機能

| 機能 | 仕組み |
|------|--------|
| **広告検出** | `atvwebplayersdk-ad` オーバーレイ + タイマー要素で判定 |
| **倍速スキップ** | 広告中は 16x 倍速 + ミュートで早送り |
| **自動復元** | 広告終了後に再生速度・音量を自動復元 |
| **速度調整** | 残り時間に応じて段階的に減速（終了直前は 2x） |

## インストール

```bash
npm install
npm run build:prime
```

Chrome で `chrome://extensions` → デベロッパーモード → `packages/extension-prime/dist` を読み込む。

## 設定

ポップアップの「設定」タブから以下を調整可能:

- 自動スキップの ON/OFF
- オーバーレイ不透明度
