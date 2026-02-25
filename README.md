# GChat

[![Build & Test](https://github.com/CCWorkforce/GChat/actions/workflows/build.yml/badge.svg)](https://github.com/CCWorkforce/GChat/actions/workflows/build.yml)
[![Release](https://github.com/CCWorkforce/GChat/actions/workflows/release.yml/badge.svg)](https://github.com/CCWorkforce/GChat/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/CCWorkforce/GChat)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/CCWorkforce/GChat)](package.json)

🌾 🥳 🌋 🏰 🌅 🌕 Google Chat Desktop App - Electron Powered 🌖 🌔 🌈 🏆 👑

A secure, feature-rich desktop application for Google Chat with native OS integrations and enterprise-grade security.

## Features

✨ **Native Desktop Experience**

- System tray integration
- Native notifications
- Auto-launch on startup
- Window state persistence
- Keyboard shortcuts

🔒 **Enterprise-Grade Security**

- Process isolation & sandboxing
- AES-256-GCM data encryption
- Certificate pinning (MITM prevention)
- Input validation & rate limiting
- Content Security Policy
- Zero production vulnerabilities

⚡ **Performance Optimized**

- Lazy loading for faster startup
- MutationObserver (90% CPU reduction)
- Icon caching
- Debounced disk I/O

## Download

Get the latest release for your platform:

- **macOS Intel (x64)**: [Download .dmg](https://github.com/CCWorkforce/GChat/releases/latest)
- **macOS ARM (Apple Silicon)**: [Download .dmg](https://github.com/CCWorkforce/GChat/releases/latest)

## Development

### Prerequisites

- Bun >= 1.3.9 (Node.js >= 24.13.1 embedded by Electron)

### Setup

```bash
# Install dependencies
bun install

# Install git hooks (pre-push linting)
bun run hooks:install

# Run in development mode
bun run start

# Run tests
bun run test:run

# Build for macOS
bun run pack:mac      # macOS Intel (x64)
bun run pack:mac-arm  # macOS ARM (Apple Silicon)
```


### Testing

```bash
# Run unit tests
bun run test:run

# Run tests with coverage
bun run test:coverage

# Run tests in watch mode
bun run test
```


### Git Hooks

The project includes a pre-push hook that runs linting checks before allowing code to be pushed. This ensures code quality and consistency across the team.

```bash
# Install git hooks
bun run hooks:install

# The pre-push hook will automatically run:
# - ESLint checks
# - Prettier formatting checks

# If linting fails, the push will be blocked
# Fix issues manually or run:
bun run lint:all:fix
```


**How it works:**

- Pre-push hook runs `bun run lint:all` before every push
- If linting passes ✅, push proceeds
- If linting fails ❌, push is blocked and you'll see specific errors
- Hooks are stored in `scripts/hooks/` and can be version controlled

### Building Installers

```bash
# macOS Intel (x64)
bun run build:mac-dmg

# macOS ARM (Apple Silicon)
bun run build:mac-arm-dmg


# Build only the x64 DMG via the unified script
./build-macOS-dmg.sh --environment stable --arch x64

# Build only the ARM64 DMG via the unified script
./build-macOS-dmg.sh --environment stable --arch arm64

# Build both x64 and ARM64 DMGs in one go (default behavior)
./build-macOS-dmg.sh --environment stable
```

## CI/CD

This project uses GitHub Actions for automated building and testing:

- **Build Workflow**: Runs on every push and PR, builds for macOS (Intel & ARM)
- **Release Workflow**: Automatically creates releases when tags are pushed
- **Platforms**: macOS Intel (x64) and macOS ARM (Apple Silicon)

### Creating a Release

```bash
# Tag a new version
git tag v3.0.7
git push origin v3.0.7

# GitHub Actions will automatically:
# 1. Run tests
# 2. Build for all platforms
# 3. Create a GitHub release
# 4. Upload installers as release assets
```

## Security

This application implements multiple layers of security:

- Context isolation & sandbox mode
- AES-256-GCM encryption for config data
- SSL certificate pinning
- Input validation & rate limiting
- Content Security Policy

For detailed security information, see [SECURITY.md](SECURITY.md).

## Architecture

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## License

See [LICENSE](LICENSE) file for details.

## Credits

Built with [Electron](https://www.electronjs.org/) and enhanced with [Claude Code](https://claude.com/claude-code).
