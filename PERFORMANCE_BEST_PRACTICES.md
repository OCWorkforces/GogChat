# Performance Optimization Best Practices

This guide provides practical guidance for developers working with GChat's performance optimization utilities. Use this as a reference when adding new features or optimizing existing code.

## Quick Decision Guide

### Should I cache this resource?

```
Is the resource...
├─ Read multiple times? ─────────────────────────────────────┐
│  └─ NO  → Don't cache (single use)                         │
│  └─ YES → Continue                                          │
│                                                             │
├─ Static/immutable? ─────────────────────────────────────────┤
│  └─ NO  → Requires invalidation strategy                   │
│  └─ YES → Good candidate for caching                       │
│                                                             │
├─ Expensive to load? (>1ms) ─────────────────────────────────┤
│  └─ NO  → Low benefit, skip caching                        │
│  └─ YES → Strong candidate for caching                     │
│                                                             │
├─ Small memory footprint? (<100KB) ──────────────────────────┤
│  └─ NO  → Evaluate memory vs speed tradeoff                │
│  └─ YES → Cache it!                                         │
│                                                             │
└─ Security sensitive? (credentials, tokens) ─────────────────┘
   └─ YES → DO NOT cache (security risk)
   └─ NO  → Safe to cache
```

## Using Existing Caching Utilities

### Icon Cache

**When to use:**
- Loading icons for windows, tray, notifications, overlays
- Any static image resource used multiple times

**Usage:**
```typescript
import {getIconCache} from './utils/iconCache';

// Basic usage - automatic caching
const icon = getIconCache().getIcon('resources/icons/normal/256.png');
window.setIcon(icon);

// Pre-warm cache at startup (in main/index.ts)
getIconCache().warmCache();
```

**Best practices:**
✅ **DO:**
- Use for all icon loading (consistency)
- Add new common icons to `warmCache()`
- Use relative paths from app root

❌ **DON'T:**
- Call `nativeImage.createFromPath()` directly
- Cache dynamic/generated images
- Cache large images (>100KB)

### Package Info Cache

**When to use:**
- Accessing app version, name, description, author
- Any metadata from package.json

**Usage:**
```typescript
import {getPackageInfo} from './utils/packageInfo';

const pkg = getPackageInfo();
console.log(`Version: ${pkg.version}`);
console.log(`Name: ${pkg.productName}`);
```

**Best practices:**
✅ **DO:**
- Use instead of `require('package.json')`
- Trust the frozen object (immutable)
- Access via TypeScript interface (type-safe)

❌ **DON'T:**
- Try to modify the returned object (it's frozen)
- Require package.json directly
- Cache package.json yourself

### Config Cache

**When to use:**
- Already enabled by default for electron-store
- No action needed for existing code

**Monitoring:**
```typescript
// Check cache effectiveness (in development)
import {logCacheStats} from './utils/configCache';

logCacheStats(store);
// [ConfigCache] Cache hits: 45
// [ConfigCache] Cache misses: 12
// [ConfigCache] Hit rate: 78.9%
```

**Best practices:**
✅ **DO:**
- Use `store.get()` and `store.set()` normally
- Trust automatic invalidation
- Monitor hit rate in development

❌ **DON'T:**
- Manually clear cache
- Bypass cache with direct store access
- Assume cached values are always fresh (writes invalidate)

### Performance Monitor

**When to use:**
- Measuring feature initialization time
- Identifying startup bottlenecks
- Tracking expensive operations

**Usage:**
```typescript
import {perfMonitor} from './utils/performanceMonitor';

// Mark start of operation
perfMonitor.mark('my-feature-start', 'My feature initializing');

// ... do expensive work ...

// Mark end of operation
perfMonitor.mark('my-feature-end', 'My feature initialized');

// Measure duration
const duration = perfMonitor.measure('my-feature-start', 'my-feature-end');
if (duration > 50) {
  log.warn(`Slow feature initialization: ${duration}ms`);
}
```

**Best practices:**
✅ **DO:**
- Add markers at key milestones
- Use descriptive marker names
- Measure critical paths
- Log summary in development

❌ **DON'T:**
- Add markers in hot loops (overhead)
- Leave enabled in production builds (unless debugging)
- Add too many markers (creates noise)

## Common Patterns

### Pattern 1: Lazy-Loaded Singleton Cache

Use when you have a resource that should be loaded once on first access.

```typescript
// utils/myCache.ts
import {app} from 'electron';
import path from 'path';

class MyResourceCache {
  private resource: MyResource | null = null;

  getResource(): MyResource {
    if (!this.resource) {
      const resourcePath = path.join(app.getAppPath(), 'resources/data.json');
      this.resource = loadResource(resourcePath);
    }
    return this.resource;
  }

  clear(): void {
    this.resource = null;
  }
}

let instance: MyResourceCache | null = null;

export function getMyCache(): MyResourceCache {
  if (!instance) {
    instance = new MyResourceCache();
  }
  return instance;
}

export function destroyMyCache(): void {
  if (instance) {
    instance.clear();
    instance = null;
  }
}
```

### Pattern 2: Map-Based Cache with Automatic Cleanup

Use for caching multiple related resources with periodic cleanup.

```typescript
// utils/myMapCache.ts
class MyMapCache {
  private cache = new Map<string, CachedItem>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  get(key: string): CachedItem | null {
    const item = this.cache.get(key);
    if (item && !this.isStale(item)) {
      return item;
    }
    this.cache.delete(key);
    return null;
  }

  set(key: string, value: CachedItem): void {
    this.cache.set(key, {
      ...value,
      timestamp: Date.now(),
    });
  }

  private isStale(item: CachedItem): boolean {
    const maxAge = 10 * 60 * 1000; // 10 minutes
    return Date.now() - item.timestamp > maxAge;
  }

  private cleanup(): void {
    for (const [key, item] of this.cache) {
      if (this.isStale(item)) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}
```

### Pattern 3: Cache with Invalidation

Use when cached data can become stale and needs invalidation.

```typescript
// utils/myCacheWithInvalidation.ts
class InvalidatableCache {
  private cache = new Map<string, any>();

  get(key: string): any | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  invalidate(key: string): void {
    this.cache.delete(key);

    // Also invalidate parent keys
    // e.g., invalidating 'app.window.width' also invalidates 'app.window' and 'app'
    const parts = key.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentKey = parts.slice(0, i).join('.');
      this.cache.delete(parentKey);
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
```

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Caching Everything

**Problem:**
```typescript
// BAD: Caching data that's only used once
const cache = new Map();

function loadUserData(userId: string) {
  if (!cache.has(userId)) {
    cache.set(userId, fetchUserData(userId));
  }
  return cache.get(userId);
}

// Only called once in the entire app lifecycle
const user = loadUserData('123');
```

**Solution:**
```typescript
// GOOD: Don't cache if only used once
function loadUserData(userId: string) {
  return fetchUserData(userId);
}
```

### ❌ Anti-Pattern 2: Caching Without Invalidation

**Problem:**
```typescript
// BAD: Caching mutable data without invalidation
class ConfigCache {
  private cache = new Map();

  get(key: string) {
    if (!this.cache.has(key)) {
      this.cache.set(key, store.get(key));
    }
    return this.cache.get(key);
  }

  set(key: string, value: any) {
    store.set(key, value);
    // BUG: Cache not invalidated, will return stale data!
  }
}
```

**Solution:**
```typescript
// GOOD: Invalidate cache on writes
class ConfigCache {
  private cache = new Map();

  get(key: string) {
    if (!this.cache.has(key)) {
      this.cache.set(key, store.get(key));
    }
    return this.cache.get(key);
  }

  set(key: string, value: any) {
    this.invalidate(key);  // Invalidate first
    store.set(key, value);
  }

  private invalidate(key: string) {
    this.cache.delete(key);
    // Also invalidate parent keys
  }
}
```

### ❌ Anti-Pattern 3: Memory Leaks from Unbounded Caches

**Problem:**
```typescript
// BAD: Cache grows without bounds
class ImageCache {
  private cache = new Map<string, Buffer>();

  getImage(url: string): Buffer {
    if (!this.cache.has(url)) {
      this.cache.set(url, downloadImage(url));
    }
    return this.cache.get(url)!;
  }
  // Memory leak: cache never cleared, grows indefinitely
}
```

**Solution:**
```typescript
// GOOD: Implement LRU eviction or periodic cleanup
class ImageCache {
  private cache = new Map<string, {data: Buffer; lastAccess: number}>();
  private maxSize = 50; // Max 50 images

  getImage(url: string): Buffer {
    if (this.cache.has(url)) {
      const item = this.cache.get(url)!;
      item.lastAccess = Date.now();
      return item.data;
    }

    const data = downloadImage(url);
    this.cache.set(url, {data, lastAccess: Date.now()});

    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    return data;
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache) {
      if (item.lastAccess < oldestTime) {
        oldestTime = item.lastAccess;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}
```

### ❌ Anti-Pattern 4: Caching Sensitive Data

**Problem:**
```typescript
// BAD: Caching credentials in memory
class AuthCache {
  private cache = new Map<string, {password: string; token: string}>();

  getCredentials(userId: string) {
    if (!this.cache.has(userId)) {
      this.cache.set(userId, loadCredentials(userId));
    }
    return this.cache.get(userId);
  }
  // Security risk: credentials in memory, vulnerable to dumps
}
```

**Solution:**
```typescript
// GOOD: Don't cache sensitive data, use secure storage
class AuthManager {
  getCredentials(userId: string) {
    // Load from encrypted store each time
    return loadFromSecureStorage(userId);
  }
  // Even slower, but secure
}
```

## Testing Cached Code

### Unit Testing Caches

```typescript
// myCache.test.ts
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {getMyCache, destroyMyCache} from './myCache';

describe('MyCache', () => {
  afterEach(() => {
    destroyMyCache();
  });

  it('should cache values', () => {
    const cache = getMyCache();
    const value1 = cache.get('key');
    const value2 = cache.get('key');

    expect(value1).toBe(value2); // Same reference
  });

  it('should return singleton instance', () => {
    const cache1 = getMyCache();
    const cache2 = getMyCache();

    expect(cache1).toBe(cache2);
  });

  it('should clear cache', () => {
    const cache = getMyCache();
    cache.get('key');
    cache.clear();

    // Next get should reload
    const newValue = cache.get('key');
    expect(newValue).toBeDefined();
  });
});
```

### Testing with Cache Disabled

For code that uses config cache, disable it in tests to preserve spies:

```typescript
// config.ts
import {addCacheLayer} from './utils/configCache';

let store = new Store({schema, encryptionKey});

// Disable cache in test environment
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  store = addCacheLayer(store);
}

export default store;
```

### Integration Testing

```typescript
// integration.test.ts
import {app} from 'electron';
import {getIconCache} from './utils/iconCache';

describe('Icon Cache Integration', () => {
  it('should warm cache on startup', () => {
    const cache = getIconCache();
    cache.warmCache();

    const stats = cache.getStats();
    expect(stats.size).toBe(7); // 7 common icons
  });

  it('should use cached icons', () => {
    const cache = getIconCache();

    // First load
    const start1 = performance.now();
    const icon1 = cache.getIcon('resources/icons/normal/256.png');
    const duration1 = performance.now() - start1;

    // Second load (cached)
    const start2 = performance.now();
    const icon2 = cache.getIcon('resources/icons/normal/256.png');
    const duration2 = performance.now() - start2;

    expect(icon1).toBe(icon2); // Same reference
    expect(duration2).toBeLessThan(duration1); // Faster
  });
});
```

## Monitoring and Debugging

### Check Cache Hit Rates

```typescript
// In development mode
import {logCacheStats} from './utils/configCache';

// On app exit or periodically
app.on('before-quit', () => {
  if (process.env.NODE_ENV === 'development') {
    logCacheStats(store);
  }
});

// Output:
// [ConfigCache] ========== Cache Statistics ==========
// [ConfigCache] Cache hits: 45
// [ConfigCache] Cache misses: 12
// [ConfigCache] Hit rate: 78.9%
```

**Interpreting results:**
- **Hit rate >70%**: Cache is effective
- **Hit rate 30-70%**: Moderate benefit
- **Hit rate <30%**: Consider if cache is needed

### Measure Performance Impact

```typescript
import {perfMonitor} from './utils/performanceMonitor';

// Before optimization
perfMonitor.mark('before-optimization');
slowOperation();
perfMonitor.mark('after-optimization');

const duration = perfMonitor.measure('before-optimization', 'after-optimization');
console.log(`Operation took: ${duration}ms`);
```

### Profile Config Store

```typescript
import {compareStorePerformance} from './utils/configProfiler';

// Run in development
if (process.env.NODE_ENV === 'development') {
  const result = compareStorePerformance();
  console.log(`Average read time: ${result.noCacheTime}ms`);
  console.log(`Recommendation: ${result.recommendation}`);
}
```

## Adding New Optimizations

### Step 1: Identify Bottleneck

Use performance monitor to find slow operations:

```typescript
perfMonitor.mark('operation-start');
// ... operation ...
perfMonitor.mark('operation-end');

const duration = perfMonitor.measure('operation-start', 'operation-end');
if (duration > 10) {
  log.warn(`Slow operation: ${duration}ms`);
  // Consider optimization
}
```

### Step 2: Evaluate Caching Benefit

Ask:
- Is it called multiple times? (if no, don't cache)
- Is it expensive? (>1ms, file I/O, network) (if no, don't cache)
- Is the data static? (if no, need invalidation strategy)
- What's the memory cost? (if >100KB, evaluate tradeoff)

### Step 3: Implement Cache

Use appropriate pattern:
- Singleton for single resource
- Map for multiple resources
- LRU for bounded cache
- With invalidation for mutable data

### Step 4: Test

Write unit tests:
- Cache hits return same value
- Cache invalidation works
- Memory is cleaned up
- Singleton behavior correct

### Step 5: Measure

Profile before and after:
- Measure time saved
- Check memory impact
- Verify hit rate >50%

### Step 6: Document

Update documentation:
- Add to PERFORMANCE_UTILITIES.md
- Update PERFORMANCE_OPTIMIZATIONS.md
- Add usage examples

## Performance Budgets

### Startup Time Budget

- **Target total startup:** <2000ms
- **Critical path:** <500ms
  - Certificate pinning: <50ms
  - Window creation: <200ms
  - Icon loading: <20ms (with cache)
  - Essential features: <200ms
- **Deferred features:** <1500ms

### Memory Budget

- **Base app:** ~150MB
- **Caches total:** <1MB
  - Icon cache: ~100KB
  - Config cache: ~5KB
  - Package info: ~1KB
  - Custom caches: <1MB total

### Cache Performance Targets

- **Icon cache:**
  - First load: <3ms per icon
  - Cached load: <0.01ms
  - Hit rate: >90%

- **Config cache:**
  - First read: <0.5ms
  - Cached read: <0.01ms
  - Hit rate: >70%

## Troubleshooting

### Cache Not Working

**Symptoms:**
- No performance improvement
- Low hit rates (<30%)

**Debugging:**
```typescript
// Add logging
const cache = getIconCache();
console.log('Cache stats:', cache.getStats());

// Check if cache is enabled
if (typeof store.getCacheStats === 'function') {
  console.log('Config cache: enabled');
} else {
  console.log('Config cache: disabled');
}
```

**Common causes:**
- Cache not enabled (check environment variables)
- Cache invalidation too aggressive
- Not enough repeated reads

### Memory Leaks

**Symptoms:**
- Memory usage grows over time
- App becomes sluggish

**Debugging:**
```typescript
// Monitor cache size
setInterval(() => {
  const cache = getMyCache();
  console.log(`Cache size: ${cache.size}`);
}, 60000); // Every minute
```

**Solutions:**
- Implement LRU eviction
- Add periodic cleanup
- Set max cache size

### Stale Data

**Symptoms:**
- UI shows outdated information
- Config changes not reflected

**Debugging:**
```typescript
// Check invalidation
store.set('key', 'new-value');
const cached = cache.get('key');
console.log('Is stale?', cached !== 'new-value');
```

**Solutions:**
- Implement proper invalidation
- Invalidate parent keys
- Clear cache on writes

## Resources

- `PERFORMANCE_OPTIMIZATIONS.md` - Implementation guide
- `src/main/utils/PERFORMANCE_UTILITIES.md` - API documentation
- `src/main/utils/CLAUDE.md` - Integration guide
- Electron Performance docs: https://www.electronjs.org/docs/latest/tutorial/performance

## Summary

**Key Takeaways:**
1. ✅ Cache static, expensive, frequently-accessed resources
2. ✅ Always invalidate caches when data changes
3. ✅ Monitor hit rates to verify effectiveness
4. ✅ Set memory limits to prevent leaks
5. ❌ Don't cache one-time operations
6. ❌ Don't cache sensitive data
7. ❌ Don't cache without invalidation
8. ❌ Don't cache unbounded data

**When in doubt:**
- Measure first, optimize second
- Profile to verify improvement
- Test thoroughly
- Document clearly
