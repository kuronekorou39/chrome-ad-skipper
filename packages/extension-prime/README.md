# Prime Video広告スキッパー

Prime Video の広告を自動スキップする Chrome 拡張機能。

## 機能

- 広告オーバーレイ（`atvwebplayersdk-ad`）の表示を検出
- 広告中は動画を 16x 倍速 + ミュートで早送り
- 広告終了後に再生速度・音量を自動復元
- 広告残り時間に応じて速度を段階的に調整（終了直前は減速）

## インストール

```bash
npm install
npm run build:prime
```

Chrome で `chrome://extensions` → デベロッパーモード → `packages/extension-prime/dist` を読み込む。

## 設定

ポップアップの「設定」タブから以下を調整可能：

- 自動スキップの ON/OFF
- オーバーレイ不透明度
