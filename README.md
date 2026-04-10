<div align="center">

# 広告スキッパー

**動画サイトの広告を自動スキップする Chrome 拡張機能集**

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Webpack](https://img.shields.io/badge/Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

</div>

---

## 拡張機能

<table>
  <tr>
    <td align="center" width="33%">
      <img src="packages/extension-twitch/src/icons/icon-128.png" width="64" height="64" alt="Twitch"><br>
      <strong><a href="packages/extension-twitch/">Twitch広告スキッパー</a></strong><br>
      <sub>広告スワップ・倍速スキップ<br>ポイント自動取得</sub>
    </td>
    <td align="center" width="33%">
      <img src="packages/extension-prime/src/icons/icon-128.png" width="64" height="64" alt="Prime Video"><br>
      <strong><a href="packages/extension-prime/">Prime Video広告スキッパー</a></strong><br>
      <sub>広告を倍速+ミュートで早送り</sub>
    </td>
    <td align="center" width="33%">
      <img src="packages/extension-youtube/src/icons/icon-128.png" width="64" height="64" alt="YouTube"><br>
      <strong><a href="packages/extension-youtube/">YouTube広告スキッパー</a></strong><br>
      <sub>スキップボタン自動クリック</sub>
    </td>
  </tr>
</table>

各拡張は独立してビルド・インストール可能です。

## クイックスタート

```bash
npm install
npm run build        # 全拡張をビルド
npm test             # ユニットテスト
```

Chrome で `chrome://extensions` →「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」で各拡張の `dist` フォルダを指定。

## 開発

```bash
npm run build:twitch    # 個別ビルド
npm run build:prime
npm run build:youtube
npm run dev -w packages/extension-twitch   # ウォッチモード
```

詳細は [docs/architecture.md](docs/architecture.md) を参照。

## ライセンス

[MIT](LICENSE)
