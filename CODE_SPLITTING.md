# Code Splitting in GChat

This document explains how dynamic imports and code splitting are configured in the GChat Electron application.

## Overview

The GChat application uses **dynamic imports** to split non-critical features into separate chunks that load on-demand. This optimization reduces the initial bundle size and improves application startup time.

## Benefits

1. **Faster Startup**: Main bundle is ~51KB instead of ~54KB (deferred features loaded later)
2. **Better Performance**: Non-critical features load after the UI is ready
3. **Improved Caching**: Individual chunks can be cached independently
4. **Optimized Module Graph**: V8 can evaluate the module graph incrementally

## Configuration

### Rsbuild Configuration (`rsbuild.config.ts`)

Code splitting is enabled through the following configuration:

```typescript
// Output directory structure
distPath: {
  root: 'lib',           // Main output directory
  js: '',                // Entry files at root level
  jsAsync: 'chunks',     // Async chunks in lib/chunks/
},

// Filename patterns (no hashing for predictable imports)
filename: {
  js: '[name].js',           // Entry files: index.js, config.js, etc.
  asyncJs: '[name].js',      // Async chunks: 65.js, 705.js, 879.js
},

// Rspack optimization settings
config.optimization.splitChunks = {
  chunks: 'async',           // Only split async chunks (dynamic imports)
  minSize: 0,                // Split even small chunks (important for Electron)
  cacheGroups: {
    default: false,          // Disable default cache groups
    vendors: false,          // Disable vendor splitting
    asyncChunks: {
      chunks: 'async',
      minChunks: 1,
      priority: 10,
    },
  },
};

// Performance configuration
performance: {
  chunkSplit: {
    strategy: 'split-by-experience',  // Allow async chunks
    override: {
      chunks: {
        async: 'async',                // Split async chunks
      },
    },
  },
}
```

### Key Settings Explained

- **`splitChunks: { chunks: 'async' }`**: Only creates separate chunks for dynamic imports (`import()`), not for static imports. This keeps the main bundle predictable.
- **`minSize: 0`**: Allows even small features to be split into separate chunks, which is beneficial for Electron apps where file size is less critical than startup time.
- **`cacheGroups: false`**: Disables automatic vendor and common chunk splitting, giving full control over chunk boundaries.
- **`jsAsync: 'chunks'`**: Places all async chunks in `lib/chunks/` directory for organized output.

## Dynamic Import Usage

### Location: `src/main/index.ts`

Deferred features are loaded using dynamic imports in the `setImmediate` callback:

```typescript
setImmediate(() => {
  void (async () => {
    log.debug('[Main] Loading non-critical features with dynamic imports');

    // ⚡ OPTIMIZATION: Use true dynamic imports for code splitting
    // Benefits: Smaller initial bundle, faster module graph evaluation, better caching
    await Promise.all([
      import('./features/openAtLogin.js').then((m) => m.default(window)),
      import('./features/appUpdates.js').then((m) => m.default()),
      import('./features/contextMenu.js').then((m) => m.default()),
      import('./features/firstLaunch.js').then((m) => m.default()),
      import('./utils/platform.js').then((m) => m.enforceMacOSAppLocation()),
    ]);

    log.info('[Main] All features initialized');
  })();
});
```

### Why These Features?

Features loaded via dynamic imports are **non-critical** - they don't block UI rendering:

- **openAtLogin**: Auto-launch configuration (system preference)
- **appUpdates**: Update checking (runs in background)
- **contextMenu**: Right-click menu (user-initiated)
- **firstLaunch**: First-run logging (analytics)
- **platform utilities**: macOS app location enforcement

## Build Output

### Directory Structure

```
lib/
├── main/
│   ├── index.js              (Main entry point - 51.2 KB)
│   ├── config.js
│   ├── windowWrapper.js
│   ├── features/
│   │   ├── badgeIcon.js
│   │   ├── trayIcon.js
│   │   └── ...
│   └── utils/
│       └── ...
├── preload/
│   └── ...
├── shared/
│   └── ...
└── chunks/                   (Async chunks directory)
    ├── 65.js                 (contextMenu - 0.27 KB)
    ├── 705.js                (firstLaunch - 0.28 KB)
    └── 879.js                (appUpdates - 0.42 KB)
```

### Chunk Naming

Chunks are numbered based on Rspack's internal module IDs:
- **65.js**: `electron-context-menu` module
- **705.js**: `firstLaunch` feature
- **879.js**: `appUpdates` feature

The numbers are deterministic based on module resolution order, but may change if dependencies are added/removed.

## Electron Packaging

### Asar Archive Compatibility

The chunks work seamlessly with Electron's asar packaging:

1. **Build**: Rsbuild compiles TypeScript → JavaScript with code splitting
2. **Package**: `electron-packager` bundles the app with `--asar` flag
3. **Archive**: All files (including `lib/chunks/`) are packed into `app.asar`
4. **Runtime**: Electron's require/import resolution handles asar transparently

### Verification

To verify chunks are included in the packaged app:

```bash
# List asar contents
npx asar list "./dist/Google Chat-darwin-arm64/Google Chat.app/Contents/Resources/app.asar" | grep chunks

# Output:
# /lib/chunks
# /lib/chunks/65.js
# /lib/chunks/705.js
# /lib/chunks/879.js
```

### electron-packager Configuration

The `lib/` directory (including `lib/chunks/`) is automatically included because it's NOT in the ignore patterns:

```json
{
  "scripts": {
    "pack:mac": "electron-packager . ... --ignore='^/(src|.github|coverage|...)$' ..."
  }
}
```

The `lib/` directory is in the root and NOT matched by the ignore regex, so it's included.

## DMG Build Scripts

Both build scripts support code splitting without modifications:

### ARM64 Build: `build-macOS-arm64-dmg.sh`

```bash
./build-macOS-arm64-dmg.sh --environment develop
```

**Steps:**
1. Clean previous builds (`lib/` and `dist/`)
2. Build production code (`npm run build:prod`)
   - Creates `lib/` with chunks
3. Package app (`npm run pack:mac-arm`)
   - Includes `lib/chunks/` in asar
4. Create DMG installer
5. Generate SHA-256 checksum

### x64 Build: `build-macOS-x64-dmg.sh`

```bash
./build-macOS-x64-dmg.sh --environment develop
```

Identical to ARM64 build, but uses `--arch=x64` instead of `--arch=arm64`.

## Performance Impact

### Measured Benefits

- **Initial bundle size**: Reduced from ~54KB to ~51KB (~6% smaller)
- **Chunk sizes**: 0.27KB + 0.28KB + 0.42KB = 0.97KB total
- **Startup time**: Non-critical features don't block UI rendering
- **Memory usage**: Chunks loaded on-demand reduce initial memory footprint

### Trade-offs

- **Network overhead**: None (local files, no network loading)
- **Disk space**: Minimal (~1KB additional overhead from chunk metadata)
- **Complexity**: Slightly more complex build configuration

## Adding New Dynamic Imports

To add a new feature with dynamic imports:

1. **Create the feature module**:
   ```typescript
   // src/main/features/myFeature.ts
   export default function myFeature() {
     // Feature implementation
   }
   ```

2. **Add dynamic import in index.ts**:
   ```typescript
   setImmediate(() => {
     void (async () => {
       await Promise.all([
         // Existing imports...
         import('./features/myFeature.js').then((m) => m.default()),
       ]);
     })();
   });
   ```

3. **Build and verify**:
   ```bash
   npm run build:prod
   ls -lh lib/chunks/  # Verify new chunk created
   ```

4. **Test packaging**:
   ```bash
   ./build-macOS-arm64-dmg.sh --environment develop
   npx asar list "./dist/Google Chat-darwin-arm64/Google Chat.app/Contents/Resources/app.asar" | grep chunks
   ```

## Debugging

### View chunk contents

```bash
# Development build includes source maps
npm run build:dev

# View chunk source
cat lib/chunks/65.js
cat lib/chunks/65.js.map  # Source map for debugging
```

### Bundle analysis

```bash
# Enable bundle analyzer
npm run build:analyze

# Opens browser with interactive bundle visualization
# Shows chunk sizes, dependencies, and module composition
```

### Runtime verification

Enable debug logging in the app to see when chunks load:

```typescript
log.debug('[Main] Loading non-critical features with dynamic imports');
// Logs when dynamic imports start loading
```

## Best Practices

1. **Only use dynamic imports for non-critical features** - Critical path should use static imports
2. **Group related features** - Don't split too aggressively (overhead of many small chunks)
3. **Test packaging** - Always verify chunks are included in asar after configuration changes
4. **Monitor bundle sizes** - Use `npm run build:prod` to see chunk sizes
5. **Keep chunk naming predictable** - Use `asyncJs: '[name].js'` without hashes

## Troubleshooting

### Chunks not being created

**Symptom**: All code bundled into main file, no chunks created

**Solution**: Check `rsbuild.config.ts`:
- Ensure `config.optimization.splitChunks.chunks = 'async'`
- Ensure `performance.chunkSplit.strategy = 'split-by-experience'`
- Verify dynamic imports use `import()` syntax, not `require()`

### Chunks missing from packaged app

**Symptom**: Build succeeds but chunks missing from asar

**Solution**: Check `package.json`:
- Ensure `lib/` is NOT in electron-packager `--ignore` patterns
- Verify `prepack:mac` runs `npm run build:prod` before packaging

### Runtime import errors

**Symptom**: App crashes with "Cannot find module" errors

**Solution**:
- Ensure chunk paths are relative: `import('./features/...')`
- Verify chunks use `.js` extension in import statements
- Check asar archive includes chunks: `npx asar list app.asar | grep chunks`

## References

- [Rsbuild Code Splitting Docs](https://rsbuild.dev/guide/optimization/split-chunk)
- [Webpack Code Splitting](https://webpack.js.org/guides/code-splitting/)
- [Electron ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Dynamic Import Specification](https://tc39.es/ecma262/#sec-import-calls)

## Changelog

### 2025-10-10
- Initial implementation of code splitting
- Configured Rsbuild for async chunk splitting
- Updated DMG build scripts to support chunks
- Added comprehensive documentation
- Verified ARM64 and x64 builds include chunks in asar archives
