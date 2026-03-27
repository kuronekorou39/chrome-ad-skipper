# CLAUDE.md

## Version Management

- 各拡張が独立したバージョンを持つ（`packages/extension-twitch/package.json`、`packages/extension-prime/package.json`）
- **コード変更したら、ビルド前に該当拡張のバージョンをインクリメントすること**
  - Twitch: `npm run bump:twitch:patch` / `npm run bump:twitch:minor`
  - Prime: `npm run bump:prime:patch` / `npm run bump:prime:minor`
- `npm run build` で各拡張の `dist/manifest.json` に自動反映される
- 機能追加は `bump:*:minor`、バグ修正は `bump:*:patch`
