import { defineConfig } from '@rsbuild/core';
import type { RsbuildConfig } from '@rsbuild/core';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';

/**
 * Rsbuild configuration for GChat Electron application
 *
 * This replaces the previous esbuild setup with Rspack-powered builds.
 * Key requirements:
 * - Target: Electron main process (Node.js environment)
 * - Format: ESM modules
 * - Bundling: Bundle dependencies except Electron modules
 * - Output: lib/ directory maintaining src/ structure
 */

// Environment detection
const isDev = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const shouldAnalyze = process.env.ANALYZE === 'true';

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
      jsAsync: '',      // No separate async chunks directory
    },

    // File naming - no hashing to maintain predictable imports
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

      // Optimization settings
      config.optimization = config.optimization || {};
      config.optimization.minimize = isProduction;
      config.optimization.minimizer = isProduction ? config.optimization.minimizer : [];

      // Tree shaking
      config.optimization.usedExports = true;
      config.optimization.sideEffects = true;

      // No code splitting for Node.js bundles
      config.optimization.splitChunks = false;
      config.optimization.runtimeChunk = false;

      // Bundle analyzer plugin (only when ANALYZE=true)
      if (shouldAnalyze) {
        config.plugins = config.plugins || [];
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: 'bundle-analysis.html',
            openAnalyzer: true,
            generateStatsFile: true,
            statsFilename: 'bundle-stats.json',
            logLevel: 'info',
          })
        );
      }

      return config;
    },
  },

  // Performance configuration
  performance: {
    // Bundle size warnings
    chunkSplit: {
      strategy: 'all-in-one', // Single bundle per entry
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

  // Environment-specific configurations
  environments: {
    // Development environment
    development: {
      output: {
        minify: false,
        sourceMap: {
          js: 'source-map',
        },
      },
    },

    // Production environment
    production: {
      output: {
        minify: {
          js: true,
          jsOptions: {
            minimizerOptions: {
              compress: {
                passes: 2,
                drop_console: false, // Keep console logs for Electron
                drop_debugger: true,
              },
              mangle: {
                keep_classnames: false,
                keep_fnames: false,
              },
            },
          },
        },
        sourceMap: {
          js: false,
        },
      },
      performance: {
        printFileSize: {
          total: true,
          detail: true,
        },
      },
    },
  },
} satisfies RsbuildConfig);
