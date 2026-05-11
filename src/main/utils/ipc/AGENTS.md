# IP — src/main/utils/ipc/ — IPC Infrastructure

**Generated:** 2026-05-10

Secure IPC handler factories, request deduplication, rate limiting, one-way fast paths, and common validators. All channels typed via `IPC_CHANNELS` from `../../shared/constants.ts`. Every handler follows: rate limit → validate → handle → catch.

## FILES

| File | Lines | Purpose |
| --- | --- | --- |
| `ipcHelper.ts` | 315 | Core IPC handler factory; `IPCHandlerConfig.channel: IPCChannelName`; `NoInfer<T>` on `data` param; optional dedup via `withDeduplication`; export `getIPCManager()` |
| `ipcDeduplicator.ts` | 317 | Dedup rapid same-key requests; on-demand cleanup scheduling; opt-in per handler via `withDeduplication` or `createDeduplicatedHandler` |
| `rateLimiter.ts` | ~80 | Token-bucket rate limiter; configurable per channel via `RATE_LIMITS` in `constants.ts`; export `rateLimiter.isAllowed(channel)` |
| `ipcFastPath.ts` | ~30 | `registerFastHandler` for sync one-way IPC (e.g. `FAVICON_CHANGED`, `UNREAD_COUNT`); skips Promise allocation; keeps rate limit + validator |
| `defineIPC.ts` | ~20 | Type-level IPC channel registration helper; maps `IPCChannelName` → typed send/invoke signatures |
| `benignLogFilter.ts` | ~25 | Filters known-benign Electron logs from IPC error paths to reduce noise in `main.log` |
| `ipcCommonValidators.ts` | ~30 | Shared validation functions for common IPC payload shapes (counts, booleans, objects) |
| `ipcDeduplicationPatterns.ts` | ~10 | Declarative dedup pattern constants (which channels eligible for dedup, key extraction strategy) |
| `index.ts` | 1 | Barrel re-export of all above |

## KEY PATTERNS

- **Handler pipeline**: Every IPC handler MUST follow: rate limit → validate → handle → catch. Never skip rate limiting.
- **No hardcoded channels**: Use `IPC_CHANNELS.CHANNEL_NAME` constants from `../../shared/constants.ts`. Bare strings are forbidden by ESLint.
- **Fast path**: One-way fire-and-forget channels (`FAVICON_CHANGED`, `UNREAD_COUNT`) use `registerFastHandler` — sync, no Promise overhead.
- **Deduplication**: Opt-in per handler. Default 100ms dedup window. Configurable via `ipcDeduplicationPatterns.ts`.
- **Validation**: All outgoing data validated via `../../shared/dataValidators.ts`; all incoming validated in handler before processing.