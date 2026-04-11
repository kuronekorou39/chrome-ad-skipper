# CLAUDE.md

## Version Management

- 各拡張が独立したバージョンを持つ
  - `packages/extension-twitch/package.json`
  - `packages/extension-prime/package.json`
  - `packages/extension-youtube/package.json`
- **コード変更したら、ビルド前に該当拡張のバージョンをインクリメントすること**
  - Twitch: `npm run bump:twitch:patch` / `npm run bump:twitch:minor`
  - Prime: `npm run bump:prime:patch` / `npm run bump:prime:minor`
  - YouTube: `npm run bump:youtube:patch` / `npm run bump:youtube:minor`
- `npm run build` で各拡張の `dist/manifest.json` に自動反映される
- 機能追加は `bump:*:minor`、バグ修正は `bump:*:patch`

## Testing

- `npm test` で vitest ユニットテスト実行（shared パッケージ）
- 拡張機能の動作確認は Chrome に `dist/` を読み込んで手動テスト
