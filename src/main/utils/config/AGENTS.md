# CF — src/main/utils/config/ — Configuration Access & Schema

**Generated:** 2026-05-14

Encrypted configuration backed by `electron-store` with AES-256-GCM. Typed accessors (`configGet`/`configSet`) enforce `StoreKeyPaths` type safety. Read-through cache with no TTL — invalidated only by set/delete/clear. Schema validation at startup.

## FILES

| File | Lines | Purpose |
| --- | --- | --- |
| `configCache.ts` | ~30 | Read-through cache; `get(key)` / `set(key, value)` / `delete(key)` / `clear()`; no TTL — explicit invalidation only |
| `configSchema.ts` | ~40 | Zod-based schema validation at startup; ensures store shape matches `StoreType` from `../../shared/types/config.ts`; migration helpers |
| `index.ts` | ~15 | Re-exports `configGet`/`configSet` from `../../config.ts` with type-safe `StoreKeyPaths` generic |

## KEY EXPORTS

- `configGet<K extends StoreKeyPaths>(key: K): StoreType[K]` — typed getter
- `configSet<K extends StoreKeyPaths>(key: K, value: StoreType[K]): void` — typed setter (auto-persists + cache invalidates)
- `configCache.clear()` — full cache bust (used during shutdown/destroy)

## KEY PATTERNS

- **Never access store directly**: Always use `configGet()`/`configSet()`. Direct `store.get(...) as T` is forbidden by ESLint.
- **Security flags excluded**: Cert pinning kill switch, CDP telemetry toggle live in `secureFlags.ts` (SafeStorage), NOT in StoreType.
- **No runtime config watches**: Changes require explicit `configSet` call. No reactive/observable pattern.