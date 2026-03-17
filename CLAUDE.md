# CLAUDE.md

## Version Management

- Single source of truth: root `package.json` の `version` フィールド
- **コード変更したら、ビルド前に必ず `npm run bump:patch` でバージョンをインクリメントすること**
- `npm run build` で `dist/manifest.json` に自動反映される
- 機能追加は `bump:minor`、バグ修正は `bump:patch`
