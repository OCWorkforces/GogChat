import { defineConfig } from '@rsbuild/core';

/**
 * Rsbuild configuration for GChat Electron application
 *
 * This replaces the previous esbuild setup with Rspack-powered builds.
 * Key requirements:
 * - Target: Electron main process (Node.js environment)
 * - Format: ESM modules
 * - Bundling: Bundle dependencies except Electron modules
 * - Output: lib/ directory maintaining src/ structure
 * - Code Splitting: Enabled for dynamic imports (see CODE_SPLITTING.md)
 *
 * @type {import('@rsbuild/core').RsbuildConfig}
 */

// Environment detection
const isDev = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  // Source configuration
  source: {
    // Entry points will be dynamically set by build script
    // This placeholder will be replaced at runtime
    entry: {},
  },

  // Output configuration
  output: {
    // Target: Node.js environment (Electron main process)
    target: 'node',

    // Output directory structure
    distPath: {
      root: 'lib',      // Output to lib/ directory
      js: '',           // Flat structure, no subdirectories
      jsAsync: 'chunks', // Async chunks go to lib/chunks/ directory
    },

    // File naming - descriptive names for debugging and cache management
    filename: {
      js: '[name].js',
    },

    // Enable ES modules output
    module: true,

    // Minification based on environment
    minify: isProduction ? {
      js: true,
      jsOptions: {
        minimizerOptions: {
          compress: {
            passes: 2,
            drop_console: true, // Drop console logs in production
            drop_debugger: true,
          },
          mangle: true,
        },
      },
    } : false,

    // Source maps for development
    sourceMap: {
      js: isDev ? 'source-map' : false,
      css: false,
    },

    // Charset
    charset: 'utf8',

    // Clean dist directory before build
    cleanDistPath: true,

    // Copy public assets (if any)
    copy: [],

    // External dependencies - do not bundle these
    externals: [
      // Electron core
      'electron',
      /^electron\/.*/,

      // Node.js built-in modules
      /^node:.*/,

      // Electron ecosystem packages
      'electron-log',
      'electron-store',
      'electron-unhandled',
      'electron-update-notifier',
      'electron-context-menu',

      // Other native/platform-specific modules
      'auto-launch',

      // Utility packages that should be bundled are NOT listed here
      // e.g., 'throttle-debounce' will be bundled
    ],
  },

  // Rspack-specific configuration
  tools: {
    rspack: (config, { target }) => {
      // Override target to electron-main for better Electron support
      config.target = 'electron-main';

      // Ensure proper module resolution
      config.resolve = config.resolve || {};
      config.resolve.extensions = ['.ts', '.js', '.json'];
      config.resolve.extensionAlias = {
        '.js': ['.ts', '.js'],
      };

      // Configure output to properly indicate ESM format
      config.output = config.output || {};
      config.output.module = true; // Ensure module output
      config.output.chunkFormat = 'module'; // Use ESM chunk format
      config.output.library = {
        type: 'module', // Library type as module
      };
      config.experiments = config.experiments || {};
      config.experiments.outputModule = true; // Enable output module experiment

      // Persistent filesystem cache for faster incremental dev builds
      // Only enabled in dev mode — production builds must always be clean
      if (!isProduction) {
        config.cache = {
          type: 'filesystem',
          buildDependencies: {
            // Invalidate cache when this config file changes
            config: [new URL(import.meta.url).pathname],
          },
        };
      }

      // Optimization settings
      config.optimization = config.optimization || {};
      config.optimization.minimize = isProduction;
      config.optimization.minimizer = isProduction ? config.optimization.minimizer : [];

      // Tree shaking
      config.optimization.usedExports = true;
      config.optimization.sideEffects = true;

      // Enable code splitting for dynamic imports
      // This allows deferred features to load on-demand for faster startup
      config.optimization.splitChunks = {
        chunks: 'async', // Only split async chunks (dynamic imports)
        minSize: 0, // Split even small chunks (important for Electron)
        maxAsyncRequests: 30, // Allow many parallel chunks
        maxInitialRequests: 30,
        cacheGroups: {
          default: false, // Disable default cache groups
          vendors: false, // Disable vendor splitting
          // Each dynamic import gets its own named chunk
          asyncFeatures: {
            test: (module) => {
              // Match feature and utils modules
              const resource = module.resource || module.identifier?.() || '';
              return /[\\/](features|utils)[\\/]/.test(resource);
            },
            chunks: 'async',
            name: (module) => {
              // Extract feature name from module resource path
              const resource = module.resource || module.identifier?.() || '';

              // Try to match features directory
              const featureMatch = resource.match(/[\\/]features[\\/]([^/\\]+)\.(?:ts|js)/);
              if (featureMatch) return featureMatch[1];

              // Try to match utils directory
              const utilMatch = resource.match(/[\\/]utils[\\/]([^/\\]+)\.(?:ts|js)/);
              if (utilMatch) return utilMatch[1];

              // Fallback: try to extract filename
              const filenameMatch = resource.match(/[\\/]([^/\\]+)\.(?:ts|js)$/);
              if (filenameMatch) return filenameMatch[1];

              // Last resort: use module id
              return `chunk-${module.id || 'unknown'}`;
            },
            priority: 10,
            reuseExistingChunk: false, // Always create new chunks for better splitting
          },
        },
      };
      config.optimization.runtimeChunk = false; // No separate runtime chunk

      return config;
    },
  },

  // Performance configuration
  performance: {
    // Bundle size warnings and budgets
    chunkSplit: {
      strategy: 'split-by-experience', // Allow async chunks for dynamic imports
    },

    // Print file sizes after build
    printFileSize: {
      total: true,
      detail: true,
    },

    // Remove moment locales if present
    removeMomentLocale: true,
  },

  // Development server (not used for Electron, but keeping config)
  server: {
    port: 3000,
  },

  // Disable HTML generation (Node.js target doesn't need HTML)
  html: {
    template: undefined,
  },
});
