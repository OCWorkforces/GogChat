# mac Packaging Guide

**Parent:** `../AGENTS.md`

`mac/` contains macOS packaging assets and DMG scripts for an Apple Silicon focused Electron app.

## Commands

```bash
bun run build:mac
bun run build:mac:dev
bun run package
```

## DMG flow

- `build-macOS-dmg.sh` requires `BUILD_ENV`; package scripts default it to production/dev as appropriate.
- Build the app before packaging.
- Mount, copy, sign/notarize when configured, detach, then verify artifacts.
- Always force-detach mounted DMGs on failure paths.

## Signing/notarization

- Code signing is optional for local development but required for release quality artifacts.
- Notarization uses script/env plumbing from `scripts/notarize.cjs`.
- Required release env vars include `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_PASSWORD`.
- Never print signing credentials or notarization passwords.

## Asset rules

- Keep DMG background/icons aligned with generated icon assets from `scripts/`.
- Packaging assets include `electron-builder.yml`, `electron-builder.sign.yml`, and `entitlements.mac*.plist`.
- Do not edit files inside a mounted DMG as the source of truth.
- Do not add Intel-specific assumptions unless product support changes.

## Anti-patterns

- No packaging without a fresh build.
- No skipping forced detach cleanup.
- No release artifact upload from local scripts unless explicitly requested.
