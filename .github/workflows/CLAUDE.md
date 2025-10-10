# .github/workflows/

This directory contains GitHub Actions workflows for continuous integration, testing, and release automation.

## Overview

**CI/CD Pipeline**: Automated workflows for:
- **Testing**: Run unit tests, linting, and security audits
- **Building**: Package the app for macOS (Intel and ARM)
- **Releasing**: Create GitHub releases with installers attached

**Workflow triggers**:
- Push to main/develop branches
- Pull requests to main/develop
- Manual workflow dispatch
- Git tags (releases only)

## Workflows

### build.yml
Continuous integration workflow for testing and building the application.

**Triggers:**
- Push to `main`, `develop`, or `init-feature` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Jobs:**

#### 1. test (ubuntu-latest)
Runs automated tests and checks on every commit.

**Steps:**
1. Checkout code
2. Setup Node.js (version 22.x) with npm cache enabled
3. Install dependencies with `npm ci`
4. **Run TypeScript compiler** (`npm run ts`)
   - Compiles `src/` to `lib/`
   - Catches type errors and syntax issues
7. **Run unit tests** (`npm run test:run`)
   - Executes all tests in `*.test.ts` files
   - Uses Vitest test runner
8. **Security audit** (`npm audit --production`)
   - Checks for known vulnerabilities in dependencies
   - Continues on error (informational only, doesn't block build)

**Performance optimizations:**
- Uses npm ci for clean, reproducible installs
- Caches npm packages between runs
- Parallel job execution

#### 2. build-macos (macos-latest)
Builds macOS application packages for both Intel and ARM architectures.

**Runs after**: `test` job succeeds
**Strategy**: Matrix build for both architectures (x64, arm64)

**Steps:**
1. Checkout code
2. Setup Node.js (version 22.x) with npm cache enabled
3. Install dependencies with `npm ci`
5. Build TypeScript
6. **Package macOS app**:
   - Intel: `npm run pack:mac` (calls electron-packager)
   - ARM: `npm run pack:mac-arm`
7. **Build DMG installer**:
   - Intel: `npm run build:mac-dmg`
   - ARM: `npm run build:mac-arm-dmg`
8. **Upload artifacts**:
   - Intel: `gchat-macos-x64`
   - ARM: `gchat-macos-arm64`
   - Retention: 30 days

**Artifacts location**: `dist/*.dmg`

**Why matrix build?**
- Creates both Intel (x64) and ARM (Apple Silicon) builds in parallel
- Ensures compatibility with all macOS hardware
- Reduces total build time vs sequential builds

#### 3. build-summary (ubuntu-latest)
Summarizes build results and reports status.

**Runs after**: All build jobs complete (even if failed)
**Condition**: `always()` - runs regardless of previous job results

**Steps:**
1. Check status of macOS build
2. Display summary (✅ success or ❌ failed)
3. Exit with error if any build failed

**Purpose:**
- Provides clear success/failure indication
- Useful for PR status checks
- Centralizes build result reporting

### release.yml
Release automation workflow for creating GitHub releases with downloadable installers.

**Triggers:**
- Push of version tags (e.g., `v3.0.8`)
- Manual workflow dispatch with version input

**Jobs:**

#### 1. create-release (ubuntu-latest)
Creates a GitHub release with changelog.

**Steps:**
1. Checkout code
2. **Get version**:
   - From tag if triggered by tag push
   - From manual input if workflow_dispatch
3. **Read CHANGELOG.md**:
   - Extracts latest version's changelog
   - Uses `awk` to parse markdown sections
   - Fallback if no changelog exists
4. **Create GitHub release**:
   - Tag: Version from step 2
   - Name: "Release vX.Y.Z"
   - Body: Includes changelog and download links
   - Not a draft, not a prerelease

**Outputs:**
- `upload_url`: URL for uploading release assets
- `version`: Version string for other jobs

**Release body format:**
```markdown
## GChat vX.Y.Z

[Changelog content from CHANGELOG.md]

### Downloads
- **macOS Intel (x64)**: GChat-vX.Y.Z-mac-x64.zip
- **macOS ARM (Apple Silicon)**: GChat-vX.Y.Z-mac-arm64.zip

### Security
- See SECURITY.md for security details

---
🤖 Generated with Claude Code
```

#### 2. build-and-upload-macos (macos-latest)
Builds and uploads macOS installers to the release.

**Runs after**: `create-release` job succeeds
**Strategy**: Matrix build for both architectures (x64, arm64)

**Steps:**
1. Checkout code
2. Setup Node.js with npm cache enabled
3. Install dependencies with `npm ci`
5. Build TypeScript
6. **Run tests** (ensures release quality)
7. **Package macOS app**:
   - Intel: `npm run pack:mac`
   - ARM: `npm run pack:mac-arm`
8. **Build DMG installer**:
   - Intel: `npm run build:mac-dmg`
   - ARM: `npm run build:mac-arm-dmg`
9. **Get installer filename** (from `dist/*.dmg`)
10. **Upload to GitHub release**:
    - Uses upload URL from `create-release` job
    - Asset type: `application/x-apple-diskimage`

**Why run tests in release?**
- Additional safety check
- Ensures no last-minute breaking changes
- Verifies build quality before public release

#### 3. release-summary (ubuntu-latest)
Summarizes release results.

**Runs after**: All build and upload jobs complete
**Condition**: `always()`

**Steps:**
1. Check status of macOS builds
2. Display summary
3. Exit with error if any build failed
4. Success message: "🎉 Release vX.Y.Z published successfully!"

## Environment Variables

**NODE_VERSION**: `22.x`
- Node.js version for all jobs
- Matches Electron 38's bundled Node.js version
- Ensures consistent build environment

## Secrets

**GITHUB_TOKEN**: Automatically provided by GitHub Actions
- Used for creating releases
- Used for uploading release assets
- Read/write permissions required

## Release Process

### Automated Release (Recommended)

1. **Update version** in `package.json`:
   ```bash
   npm version patch  # or minor, or major
   ```

2. **Update CHANGELOG.md** with release notes

3. **Commit and push**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Release vX.Y.Z"
   git push
   ```

4. **Create and push tag**:
   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

5. **GitHub Actions automatically**:
   - Creates GitHub release
   - Builds macOS installers (Intel and ARM)
   - Uploads installers to release
   - Publishes release

### Manual Release (Fallback)

1. Navigate to Actions tab on GitHub
2. Select "Release" workflow
3. Click "Run workflow"
4. Enter version (e.g., `v3.0.8`)
5. Click "Run workflow" button

**Use cases for manual release:**
- Tag was pushed but workflow failed
- Need to re-run release for same version
- Testing release workflow

## Build Artifacts

**CI builds** (`build.yml`):
- Stored for 30 days
- Accessible from Actions tab → Workflow run → Artifacts
- Useful for testing before release

**Release builds** (`release.yml`):
- Attached to GitHub release (permanent)
- Publicly downloadable
- Named: `GChat-vX.Y.Z-mac-{arch}.zip`

## Caching Strategy

**npm cache:**
- Key: Based on package-lock.json hash
- Managed automatically by actions/setup-node with `cache: 'npm'`
- Invalidates when `package-lock.json` changes
- Speeds up dependency installation (2-3x faster)

## Platform Support

**Current platforms:**
- ✅ macOS Intel (x64)
- ✅ macOS ARM (Apple Silicon, M1/M2/M3+)

**Not currently supported in CI:**
- ❌ Windows - Not implemented (no `windows/` directory)
- ❌ Linux - Not implemented (no `debian/` or `linux/` directory)

**Why macOS only?**
- GChat is currently a macOS-exclusive application
- Focused development on single platform for better quality
- Features like passkey support are macOS-specific
- Simplifies CI/CD pipeline and reduces maintenance
- Future platform support can be added if needed

## Troubleshooting

### Build Failures

**TypeScript compilation fails:**
- Check for type errors in code
- Ensure `tsconfig.json` is correct
- Verify Node.js version matches (22.x)

**Tests fail:**
- Review test output in workflow logs
- Run tests locally: `npm run test:run`
- Check for environment-specific issues

**Packaging fails:**
- Verify `package.json` scripts are correct
- Check electron-packager configuration
- Ensure all resources are present

**Security audit fails:**
- Review vulnerable dependencies
- Update dependencies if safe
- Workflow continues on audit error (informational)

### Release Failures

**Tag not triggering release:**
- Ensure tag format is `vX.Y.Z` (starts with `v`)
- Check workflow file `on.push.tags` pattern
- Verify tag was pushed: `git push --tags`

**Release creation fails:**
- Check GITHUB_TOKEN permissions
- Ensure release doesn't already exist
- Review CHANGELOG.md format

**Asset upload fails:**
- Verify installer was built successfully
- Check filename matches expected format
- Ensure upload URL is valid

**Multiple releases created:**
- Don't push same tag multiple times
- Use manual dispatch to retry failed release
- Delete duplicate releases manually

## Modifying Workflows

### Adding New Platform Builds

To add Windows or Linux builds back:

1. Add new job in `build.yml`:
   ```yaml
   build-windows:
     name: Build Windows
     runs-on: windows-latest
     needs: test
     steps:
       # Similar to build-macos steps
       # Use npm run pack:windows
       # Use npm run build:windows
   ```

2. Add corresponding job in `release.yml`

3. Update build-summary to include new platform

4. Test workflow on feature branch first

### Changing Node.js Version

1. Update `NODE_VERSION` in both workflows
2. Ensure version matches Electron's bundled Node.js
3. Test all builds after changing

### Adding New Test Steps

Add step to `test` job in `build.yml`:
```yaml
- name: Run integration tests
  run: npm run test:integration
```

### Modifying Release Format

Edit `create-release` step in `release.yml`:
```yaml
body: |
  ## Custom Release Format
  [Your custom content]
```

## Best Practices

1. **Always test locally** before pushing:
   ```bash
   npm run ts
   npm run test:run
   npm run pack:mac
   ```

2. **Version format**: Use semantic versioning (vMAJOR.MINOR.PATCH)

3. **CHANGELOG.md**: Keep updated with each version

4. **Commit messages**: Use conventional commits for clarity

5. **Test in PR**: All builds run on pull requests

6. **Monitor workflows**: Check Actions tab for failures

7. **Artifact retention**: Download important builds within 30 days

## Security Considerations

**Dependency security:**
- `npm audit` runs on every build
- Continues on error (doesn't block deployment)
- Review audit results regularly

**Secrets management:**
- Only GITHUB_TOKEN is used (auto-provided)
- No custom secrets required
- Token has minimal necessary permissions

**Code signing:**
- Not currently implemented
- Consider adding for production releases
- Requires Apple Developer certificate

**Supply chain security:**
- Use pinned versions for actions (e.g., `@v4.6.2`)
- Review action source before adding
- Keep actions updated for security patches

## Future Improvements

**Potential enhancements:**
1. Add code signing for macOS
2. Add Windows and Linux builds
3. Add DMG creation (currently ZIP only)
4. Implement automatic version bumping
5. Add deployment to auto-update server
6. Add performance benchmarks
7. Add E2E tests in CI
8. Add release notes generation from commits
9. Add Slack/Discord notifications
10. Add download statistics tracking
