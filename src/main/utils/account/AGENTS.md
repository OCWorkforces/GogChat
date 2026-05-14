# AC — src/main/utils/account/ — Multi-Account Window Management

**Generated:** 2026-05-14

The account subsystem manages per-account BrowserWindows, session partitions, bootstrap promotion, caching, deep link routing, and idle session maintenance. Implements `IAccountWindowManager` (22 methods) from `../../shared/types/window.ts`. All account indices use branded `AccountIndex` type.

## FILES

| File | Lines | Purpose |
| --- | --- | --- |
| `accountWindowManager.ts` | 532 | Core `IAccountWindowManager`; per-account BrowserWindows + session partitions; hydrate/dehydrate state machine; dispatches to `accountViewManager` when `useWebContentsView=true` |
| `accountViewManager.ts` | 569 | Opt-in WebContentsView backend; single host BrowserWindow + per-account views; gated by `app.useWebContentsView` config; largest utility module |
| `accountWindowRegistry.ts` | 255 | Window registration, lookup by WebContentsId/partition, z-order tracking, event forwarding |
| `accountWindowsStore.ts` | ~80 | In-memory state store for account window metadata; partition → BrowserWindow mapping |
| `bootstrapTracker.ts` | ~60 | Tracks bootstrap windows through auth flow; coordinates `markAsBootstrap()` / `promoteToAccount()` |
| `bootstrapWatcher.ts` | ~75 | Watches bootstrap windows for auth completion; triggers promotion via `accountWindowManager`; timeout handling |
| `deepLinkUtils.ts` | ~40 | Extracts `AccountIndex` from deep link URLs; `getAccountIndexFromUrl()` returns branded type via `asAccountIndex()` |
| `accountRouter.ts` | ~50 | Routes URLs to correct account partition; checks `isGoogleAuthUrl()` before `loadURL()` to avoid interrupting auth |
| `accountSessionMaintenance.ts` | ~90 | `getAccountActivityTracker()` / `destroyAccountActivityTracker()`; periodic `clearCodeCaches()` on idle accounts |
| `cacheWarmer.ts` | ~70 | 3-tier icon path warming (INITIAL → SOON_DEFERRED → IDLE_DEFERRED); disjoint warmup sets; 8s idle trigger |
| `index.ts` | 1 | Barrel re-export of all above |

## KEY PATTERNS

- **Account identity**: All account references use branded `AccountIndex` (non-negative integer), never raw numbers. Convert with `asAccountIndex()`.
- **Partition scheme**: Each account gets `persist:account-N` session partition for cookie isolation. Built via `toPartition()`.
- **Bootstrap flow**: Login windows are temporary bootstrap → promoted to full account windows after auth via `bootstrapPromotion.ts` (feature).
- **View manager opt-in**: When `app.useWebContentsView=true`, `accountWindowManager` delegates rendering to `accountViewManager` (WebContentsView API).
- **Deep link guard**: **NEVER** call `loadURL()` on a bootstrap window without first checking `isGoogleAuthUrl()` — interrupts OAuth flow.