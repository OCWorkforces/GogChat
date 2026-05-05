# GogChat

A secure, feature-rich desktop application for GogChat with native OS integrations and enterprise-grade security.

## Features

✨ **Native Desktop Experience**

- System tray integration
- Native notifications
- Auto-launch on startup
- Window state persistence
- Keyboard shortcuts
- Multi-account sessions with per-account isolation
- Idle window memory management (hydrate/dehydrate)

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

Get the latest release:

- **macOS (Apple Silicon M1+)**: [Download .dmg](https://github.com/OCWorkforces/GogChat/releases/latest)

> **Requirement:** Apple Silicon (M1 or later) is required.

## Development

### Prerequisites

- Bun >= 1.3.11 (Node.js >= 22.0.0)

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
bun run build:mac  # ARM64 DMG
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
# Build ARM64 DMG (production)
bun run build:mac
```

## CI/CD

This project uses GitHub Actions for automated building and testing:

- **Build Workflow**: Runs on every push and PR, builds for macOS (ARM64)
- **Release Workflow**: Automatically creates releases when tags are pushed
- **Platform**: macOS Apple Silicon (arm64)

### Creating a Release

```bash
# Tag a new version
git tag v3.12.3
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

## Tech Stack

| Layer    | Tech             |
| -------- | ---------------- |
| Runtime  | Electron 41      |
| Language | TypeScript 6.0   |
| Build    | Rsbuild (Rspack) |
| Test     | Vitest 4         |

## Contact

If you have any questions or encounter issues, feel free to reach out to [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com)

## License

MIT
