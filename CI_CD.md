# CI/CD Documentation

This document explains the Continuous Integration and Continuous Deployment setup for GChat.

## Overview

GChat uses **GitHub Actions** for automated building, testing, and releasing for macOS:

- macOS Intel (x64)
- macOS ARM (Apple Silicon)

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
- Install dependencies with npm
- Run TypeScript compilation (`npm run ts`)
- Run unit tests (`npm run test:run`)
- Run security audit (`npm audit --production`)

#### Stage 2: macOS Builds

Runs in parallel after tests pass using matrix strategy:

**macOS Build** (runs on macos-latest, matrix strategy):

- Builds both Intel (x64) and ARM (arm64) versions in parallel
- Package app with electron-packager
- Create ZIP archives
- Upload ZIP files as artifacts (30-day retention)

#### Stage 3: Build Summary

- Checks status of macOS builds
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

Runs in parallel using matrix strategy for both macOS architectures:

**For each architecture:**

1. Run full test suite (zero failures required)
2. Build platform-specific installer
3. Upload installer directly to GitHub Release as asset

**Release Assets:**

- `GChat-{version}-mac-x64.zip` (macOS Intel)
- `GChat-{version}-mac-arm64.zip` (macOS ARM)

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

- **Manager:** npm
- **Setup:** Uses built-in npm from Node.js installation
- **Caching:** npm cache cached using `actions/cache@v4`

### Caching Strategy

**npm Cache:**

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-npm-
```

**Benefits:**

- Faster builds (dependencies cached)
- Reduced network usage
- Consistent dependency resolution

---

## Platform-Specific Notes

### macOS

- **Runner:** macos-latest (macOS 14 Sonoma)
- **Matrix Strategy:** Builds both x64 (Intel) and arm64 (Apple Silicon) in parallel
- **Build Tools:**
  - Intel: `./mac/installer-zip.sh`
  - ARM: `./mac/installer-arm-zip.sh`
- **Output:** ZIP archives
- **Architectures:**
  - x64: Intel-based Macs
  - arm64: Apple Silicon (M1, M2, M3, etc.)
- **Signing:** Not configured (TODO: Add notarization)

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
# macOS Intel
npm run pack:mac
npm run build:mac-zip

# macOS ARM
npm run pack:mac-arm
npm run build:mac-arm-zip
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

- **Parallel builds:** macOS x64 and ARM64 build simultaneously
- **Caching:** npm cache stored across runs
- **Matrix strategy:** Both architectures build in parallel

### Typical Build Times

- Test stage: ~2-3 minutes
- macOS build (per arch): ~5-7 minutes
- **Total (parallel):** ~5-7 minutes (both architectures build simultaneously)

---

## Future Enhancements

### Planned Improvements

- [ ] Code coverage reporting
- [ ] Automated changelog generation
- [ ] macOS code signing and notarization
- [ ] Automated version bumping
- [ ] Pre-release/beta channel
- [ ] Integration tests
- [ ] E2E tests with Playwright
- [ ] Performance benchmarking
- [ ] Universal macOS binary (combined x64 + ARM)

### Nice-to-Have

- [ ] Auto-update server integration
- [ ] Crash reporting setup
- [ ] Analytics integration
- [ ] Automated security scanning (Snyk, Dependabot)
- [ ] Nightly builds
- [ ] Windows and Linux support (currently macOS only)

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
