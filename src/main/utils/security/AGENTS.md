# SC — src/main/utils/security/ — Security & Permissions

**Generated:** 2026-05-10

Defense-in-depth security subsystem: certificate pinning for Google domains, CSP header enforcement, SafeStorage-backed encryption keys (macOS Keychain), permission handling (camera/mic TCC), and kill switches via secure flags. Kill switches use `safeStorage` (Keychain), **NOT** `electron-store`.

## FILES

| File | Lines | Purpose |
| --- | --- | --- |
| `secureFlags.ts` | ~65 | Kill switches via `safeStorage` (macOS Keychain): `getDisableCertPinning()`/`setDisableCertPinning()`, `disableCdpTelemetry`. **NOT stored in electron-store.** |
| `encryptionKey.ts` | ~80 | SafeStorage + legacy deterministic key fallback + migration. Provides keys for `electron-store` AES-256-GCM config encryption. |
| `permissionHandler.ts` | ~40 | Permission handler: only allows `notifications`, `media`, `mediaKeySystem`, `geolocation`. All others denied. |
| `mediaAccess.ts` | ~30 | macOS camera/mic TCC permission checks; feature-gated via `mediaPermissions` feature. |
| `cspHeaderHandler.ts` | ~35 | `webRequest.onHeadersReceived` — strips COEP/COOP/frame-ancestors for benign hosts. |
| `shellWrapper.ts` | ~20 | Safe `shell.openExternal()` wrapper that validates URLs through `validateExternalURL()` from `../../shared/urlValidators.ts`. |
| `index.ts` | 1 | Barrel re-export of all above |

## SECURITY LAYERS

- **Certificate pinning**: Enabled for all Google domains. Kill switch: `secureFlags.disableCertPinning` (Keychain-stored, NOT electron-store).
- **CSP enforcement**: `onHeadersReceived` strips `Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` for benign hosts to avoid breaking Google Chat.
- **Permission lockdown**: Only `notifications`, `media`, `mediaKeySystem`, and `geolocation` are permitted. Everything else denied by default.
- **Encryption**: Config stored in `electron-store` with AES-256-GCM. Key derived from SafeStorage (macOS Keychain). Legacy deterministic key supported for migration.
- **External URLs**: **NEVER** call `shell.openExternal()` without first validating via `validateExternalURL()` from `../../shared/urlValidators.ts`.