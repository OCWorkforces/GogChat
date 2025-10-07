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
- **Windows**: [Download .exe](https://github.com/CCWorkforce/GChat/releases/latest)
- **macOS (Intel)**: [Download .zip](https://github.com/CCWorkforce/GChat/releases/latest)
- **macOS (ARM)**: [Download .zip](https://github.com/CCWorkforce/GChat/releases/latest)
- **Linux (Debian)**: [Download .deb](https://github.com/CCWorkforce/GChat/releases/latest)

## Development

### Prerequisites
- Node.js >= 22.0.0
- pnpm >= 10.0.0

### Setup
```bash
# Install dependencies
pnpm install

# Run in development mode
npm start

# Run tests
npm run test:run

# Build for your platform
npm run pack:windows  # Windows
npm run pack:mac      # macOS Intel
npm run pack:mac-arm  # macOS ARM
npm run pack:linux    # Linux
```

### Testing
```bash
# Run unit tests
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test
```

### Building Installers
```bash
# Windows
npm run build:windows

# macOS
npm run build:mac-zip    # Intel
npm run build:mac-arm-zip # ARM

# Linux
npm run build:deb
```

## CI/CD

This project uses GitHub Actions for automated building and testing:

- **Build Workflow**: Runs on every push and PR, builds for all platforms
- **Release Workflow**: Automatically creates releases when tags are pushed
- **Multi-platform**: Windows, macOS (Intel & ARM), Linux (Debian)

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
