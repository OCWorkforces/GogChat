# PF — src/main/utils/platform/ — Platform Detection, Menus, Icons, Windows

**Generated:** 2026-05-14

macOS-specific platform utilities: tray icon state, badge manipulation, Help menu building, platform detection, window geometry. Depends on `electron.app`, `electron.Menu`, `electron.Tray`, `electron.nativeImage`.

## FILES

| File | Lines | Purpose |
| --- | --- | --- |
| `trayIconState.ts` | ~40 | Exports `setTrayUnread()` and tray icon state machine; consumed by `trayIcon` feature and `badgeHelpers` |
| `badgeHelpers.ts` | ~50 | Badge icon generation (count overlay, color dot, progress ring) via `nativeImage` composition |
| `helpMenuBuilder.ts` | ~35 | Builds app Help menu (macOS convention); dynamically populated from `menuActionRegistry` |
| `packageInfo.ts` | ~25 | App version/build/name from `package.json`; used by `aboutPanel` feature and DMG artifact naming |
| `platformDetection.ts` | ~20 | macOS version checks, Apple Silicon detection, Electron version guards |
| `platformHelpers.ts` | ~30 | Cross-platform path helpers, font availability, screen DPI scaling |
| `iconCache.ts` | 70 | 3-tier icon path cache (INITIAL/SOON_DEFERRED/IDLE_DEFERRED); warmup scheduling; `Resources` dir resolution |
| `windowUtils.ts` | ~40 | Window bounds serialization, display-aware positioning, `BrowserWindow` geometry helpers |
| `platformUtils.ts` | ~35 | `app.setAboutPanelOptions()`, quit confirmation, relaunch |
| `index.ts` | 1 | Barrel re-export of all above |

## KEY PATTERNS

- **macOS only**: This module is macOS-only (`platform === 'darwin'`). No cross-platform fallbacks needed.
- **Menu actions**: Features register actions via `menuActionRegistry.ts`; `helpMenuBuilder` consumes them. No feature→feature imports.
- **Tray/badge coupling**: `trayIconState.setTrayUnread()` is the single source of truth for unread count in the tray; `badgeHelpers` reads it for badge overlays.
- **Icon 3-tier system**: INITIAL (shown immediately), SOON_DEFERRED (after 2s), IDLE_DEFERRED (after 30s idle). See `iconCache.ts`.