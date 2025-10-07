# CI/CD Documentation

This document explains the Continuous Integration and Continuous Deployment setup for GChat.

## Overview

GChat uses **GitHub Actions** for automated building, testing, and releasing across multiple platforms:
- Windows (x64)
- macOS Intel (x64)
- macOS ARM (Apple Silicon)
- Linux Debian (x64)

## Workflows

### 1. Build & Test Workflow (`build.yml`)

**Triggers:**
- Push to `main`, `develop`, or `init-feature` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Stages:**

#### Stage 1: Test
Runs on Ubuntu (fastest for testing):
- Checkout code
- Install dependencies with pnpm
- Run TypeScript compilation (`npm run ts`)
- Run unit tests (`npm run test:run`)
- Run security audit (`npm audit --production`)

#### Stage 2: Multi-Platform Builds
Runs in parallel after tests pass:

**Windows Build** (runs on windows-latest):
- Package app with electron-packager
- Build installer with Inno Setup
- Upload `.exe` installer as artifact (30-day retention)

**macOS Build** (runs on macos-latest, matrix strategy):
- Builds both Intel (x64) and ARM (arm64) versions
- Package app with electron-packager
- Create ZIP archives
- Upload ZIP files as artifacts (30-day retention)

**Linux Build** (runs on ubuntu-latest):
- Package app with electron-packager
- Build `.deb` package with electron-installer-debian
- Generate SHA512 checksums
- Upload `.deb` and checksums as artifacts (30-day retention)

#### Stage 3: Build Summary
- Checks status of all platform builds
- Fails if any build failed
- Provides summary of build results

**Artifacts Retention:** 30 days

---

### 2. Release Workflow (`release.yml`)

**Triggers:**
- Push of version tags (format: `v*.*.*`, e.g., `v3.0.7`)
- Manual workflow dispatch with version input

**Stages:**

#### Stage 1: Create Release
- Extracts version from Git tag
- Reads changelog from CHANGELOG.md (if exists)
- Creates GitHub Release with:
  - Release notes
  - Download links
  - Security information
  - Auto-generated description

#### Stage 2: Build & Upload Assets
Runs in parallel, similar to Build workflow but with additional steps:

**For each platform:**
1. Run full test suite (zero failures required)
2. Build platform-specific installer
3. Upload installer directly to GitHub Release as asset

**Release Assets:**
- `GChat-Setup-{version}.exe` (Windows)
- `GChat-{version}-mac-x64.zip` (macOS Intel)
- `GChat-{version}-mac-arm64.zip` (macOS ARM)
- `GChat-{version}-amd64.deb` (Linux)
- `GChat-deb-SHA512.txt` (Linux checksums)

#### Stage 3: Release Summary
- Verifies all platform builds succeeded
- Fails if any upload failed
- Confirms successful release publication

---

## Configuration Details

### Node.js Version
- **Version:** 22.x (set via `NODE_VERSION` environment variable)
- **Reason:** Required by Electron 38 and project dependencies
- **Consistency:** Same version across all runners

### Package Manager
- **Manager:** pnpm
- **Version:** 10.x
- **Setup:** Uses `pnpm/action-setup@v4`
- **Caching:** pnpm store cached using `actions/cache@v4`

### Caching Strategy

**pnpm Store Caching:**
```yaml
- uses: actions/cache@v4
  with:
    path: ${{ pnpm store path }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: ${{ runner.os }}-pnpm-store-
```

**Benefits:**
- Faster builds (dependencies cached)
- Reduced network usage
- Consistent dependency resolution

---

## Platform-Specific Notes

### Windows
- **Runner:** windows-latest (Windows Server 2022)
- **Build Tool:** Inno Setup (via `./windows/installer.js`)
- **Output:** `.exe` installer with blockmap
- **Signing:** Not configured (TODO: Add code signing)

### macOS
- **Runner:** macos-latest (macOS 14 Sonoma)
- **Matrix Strategy:** Builds both x64 and arm64 in parallel
- **Build Tool:** Shell scripts (`./mac/installer-zip.sh`, `./mac/installer-arm-zip.sh`)
- **Output:** ZIP archives
- **Signing:** Not configured (TODO: Add notarization)

### Linux
- **Runner:** ubuntu-latest (Ubuntu 22.04)
- **Build Tool:** electron-installer-debian
- **Output:** `.deb` package with SHA512 checksums
- **Config:** `./debian/config.json`

---

## Usage

### Running Build Workflow Manually

1. Go to **Actions** tab on GitHub
2. Select **Build & Test** workflow
3. Click **Run workflow**
4. Select branch
5. Click **Run workflow** button

### Creating a Release

#### Option 1: Git Tag (Recommended)
```bash
# Update version in package.json first
npm version patch  # or minor, major

# Tag the commit
git tag v3.0.7

# Push tag to trigger release
git push origin v3.0.7
```

#### Option 2: Manual Dispatch
1. Go to **Actions** tab
2. Select **Release** workflow
3. Click **Run workflow**
4. Enter version (e.g., `v3.0.7`)
5. Click **Run workflow** button

### Monitoring Builds

**Via GitHub UI:**
- Go to **Actions** tab
- Click on workflow run
- View logs for each job
- Download artifacts from summary page

**Via CLI (with gh):**
```bash
# List workflow runs
gh run list --workflow=build.yml

# View specific run
gh run view <run-id>

# Download artifacts
gh run download <run-id>
```

---

## Troubleshooting

### Build Failures

**TypeScript Compilation Fails:**
```bash
# Locally reproduce
npm run ts

# Check for type errors
# Fix in source code
```

**Tests Fail:**
```bash
# Run tests locally
npm run test:run

# Check test output
# Fix failing tests
```

**Platform-Specific Build Fails:**
```bash
# Windows
npm run pack:windows
npm run build:windows

# macOS
npm run pack:mac
npm run build:mac-zip

# Linux
npm run pack:linux
npm run build:deb
```

### Artifact Issues

**Artifact Not Found:**
- Check if build stage succeeded
- Verify artifact upload step completed
- Check retention period (30 days)

**Missing Files in Artifact:**
- Review build logs
- Check file paths in workflow
- Verify build scripts produce expected output

### Release Issues

**Release Creation Fails:**
- Ensure tag format is `v*.*.*`
- Check GITHUB_TOKEN permissions
- Verify no existing release for tag

**Asset Upload Fails:**
- Check asset file exists
- Verify file path is correct
- Ensure content type is appropriate

---

## Best Practices

### Commit Messages
Follow conventional commits for clear history:
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
chore: Update dependencies
ci: Update CI/CD configuration
```

### Version Bumping
Use npm version commands:
```bash
npm version patch  # 3.0.6 -> 3.0.7
npm version minor  # 3.0.7 -> 3.1.0
npm version major  # 3.1.0 -> 4.0.0
```

### Pre-Release Testing
Before pushing tags:
```bash
# Run all tests
npm run test:run

# Build locally
npm run ts
npm run pack:linux  # or your platform

# Verify build works
npm start
```

### Changelog Maintenance
Keep CHANGELOG.md updated:
```markdown
## [3.0.7] - 2025-10-07
### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Change description
```

---

## Security Considerations

### Secrets Management
- **GITHUB_TOKEN:** Automatically provided by GitHub Actions
- **No custom secrets required** for basic builds

### Dependency Security
- Security audit runs on every build
- Production dependencies checked with `npm audit --production`
- Audit level: moderate (fails on moderate+ vulnerabilities)

### Code Signing (TODO)
Future enhancements:
- [ ] Windows code signing with certificate
- [ ] macOS app notarization
- [ ] Linux package signing

---

## Performance Optimization

### Build Time Optimization
- **Parallel builds:** Windows, macOS, Linux build simultaneously
- **Caching:** pnpm store cached across runs
- **Matrix strategy:** macOS x64 and ARM64 build in parallel

### Typical Build Times
- Test stage: ~2-3 minutes
- Windows build: ~5-7 minutes
- macOS build (per arch): ~5-7 minutes
- Linux build: ~4-6 minutes
- **Total (parallel):** ~7-10 minutes

---

## Future Enhancements

### Planned Improvements
- [ ] Code coverage reporting
- [ ] Automated changelog generation
- [ ] Code signing for all platforms
- [ ] Automated version bumping
- [ ] Pre-release/beta channel
- [ ] Integration tests
- [ ] E2E tests with Playwright
- [ ] Performance benchmarking
- [ ] Docker builds
- [ ] Snap/AppImage for Linux

### Nice-to-Have
- [ ] Auto-update server integration
- [ ] Crash reporting setup
- [ ] Analytics integration
- [ ] Automated security scanning (Snyk, Dependabot)
- [ ] Nightly builds

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Packager](https://github.com/electron/electron-packager)
- [electron-builder](https://www.electron.build/) (alternative to current setup)
- [Code Signing Guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)

---

## Support

For CI/CD issues:
1. Check GitHub Actions logs
2. Review this documentation
3. Open an issue with workflow run ID
4. Contact: [Repository Issues](https://github.com/CCWorkforce/GChat/issues)

---

Last Updated: 2025-10-07
