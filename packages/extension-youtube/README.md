# YouTube広告スキッパー

YouTube の広告を自動スキップする Chrome 拡張機能。

## 機能

- `#movie_player` の `.ad-showing` クラスで広告を検出
- スキップボタン出現時に自動クリック（MAIN world 経由）
- スキップ不可広告は動画シークで早送り
- 広告終了後に自動で再生再開

## インストール

```bash
npm install
npm run build:youtube
```

Chrome で `chrome://extensions` → デベロッパーモード → `packages/extension-youtube/dist` を読み込む。

## 設定

ポップアップの「設定」タブから以下を調整可能：

- 自動スキップの ON/OFF
- オーバーレイ不透明度

## 注意

YouTube は広告ブロックへの対策を頻繁に更新するため、スキップボタンのセレクタやプレイヤーの挙動が変更される可能性があります。動作しない場合は Issue を報告してください。
