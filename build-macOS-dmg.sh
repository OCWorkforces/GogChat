#!/bin/bash

##
# Unified build script for macOS DMG installers
# Supports both Intel (x64) and Apple Silicon (arm64) architectures
# This script uses electron-builder for packaging and DMG creation
##

set -euo pipefail  # Exit on error, undefined vars, pipe failures

echo "════════════════════════════════════════════════════════════════"
echo "  Open GChat - macOS DMG Build Script"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Record build start time for elapsed time reporting
BUILD_START_TIME=$(date +%s)


# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Error trap — prints failing line number for fast diagnosis
trap 'print_error "Build failed at line ${LINENO} (exit code: $?)"; exit 1' ERR

# Parse command line arguments
ENVIRONMENT=""
ARCH="both"  # Default to building both architectures
ENABLE_CODE_SIGN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --arch)
            ARCH="$2"
            shift 2
            ;;
        --enable-code-sign)
            ENABLE_CODE_SIGN=true
            shift
            ;;
        *)
            print_error "Unknown argument: $1"
            echo "Usage: $0 --environment <environment> [--arch <x64|arm64|both>] [--enable-code-sign]"
            echo ""
            echo "Arguments:"
            echo "  --environment <env>   Required. Environment name (e.g., production, develop, staging)"
            echo "  --arch <arch>         Optional. Architecture to build (x64, arm64, or both). Default: both"
            echo "  --enable-code-sign    Optional. Enable macOS code signing (requires CSC_LINK env var)"
            echo ""
            echo "Examples:"
            echo "  $0 --environment production              # Build both architectures (no signing)"
            echo "  $0 --environment develop --arch x64      # Build only Intel"
            echo "  $0 --environment production --enable-code-sign  # Build with code signing"
            exit 1
            ;;
    esac
done

# Validate environment argument
if [ -z "$ENVIRONMENT" ]; then
    print_error "Missing required argument: --environment"
    echo "Usage: $0 --environment <environment> [--arch <x64|arm64|both>]"
    echo "Example: $0 --environment production"
    exit 1
fi

# Validate arch argument
case "$ARCH" in
    x64|arm64|both)
        # Valid architecture
        ;;
    *)
        print_error "Invalid architecture: $ARCH"
        echo "Valid options: x64, arm64, both"
        exit 1
        ;;
esac

print_success "Environment: ${ENVIRONMENT}"
print_success "Architecture: ${ARCH}"
echo ""

# Pre-flight checks
print_step "Running pre-flight checks..."

# Check Node.js version (requires >= 22)
_NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
if [ "${_NODE_MAJOR}" -lt 22 ]; then
    print_error "Node.js >= 22 is required (found $(node --version))"
    exit 1
fi

# Check node_modules exists
if [ ! -d "./node_modules" ]; then
    print_error "node_modules not found — run 'npm install' first"
    exit 1
fi

# Check electron-builder is available
if ! npx electron-builder --version > /dev/null 2>&1; then
    print_error "electron-builder not found — run 'npm install' first"
    exit 1
fi

# Warn if available disk space is below 2 GB
_AVAIL_KB=$(df -k . | awk 'NR==2 {print $4}')
_AVAIL_GB=$(echo "scale=1; ${_AVAIL_KB} / 1048576" | bc)
if [ "${_AVAIL_KB}" -lt 2097152 ]; then
    print_warning "Low disk space: ${_AVAIL_GB} GB available (2 GB recommended for DMG build)"
fi

print_success "Pre-flight checks passed"


# Extract version from package.json
print_step "Extracting version from package.json..."
PACKAGE_VERSION=$(node -p "require('./package.json').version")
if [ -z "$PACKAGE_VERSION" ]; then
    print_error "Failed to extract version from package.json"
    exit 1
fi
print_success "Version: ${PACKAGE_VERSION}"
echo ""

# Step 1: Clean previous builds
print_step "Step 1/3: Cleaning previous builds..."

# Unmount any existing DMG volumes that might be mounted
MOUNTED_VOLUMES=$(mount | grep "Google Chat" | awk '{print $3}' || true)
if [ ! -z "$MOUNTED_VOLUMES" ]; then
    print_warning "Unmounting existing DMG volumes..."
    while IFS= read -r volume; do
        if [ ! -z "$volume" ]; then
            print_warning "  Unmounting: $volume"
            hdiutil detach "$volume" -quiet -force 2>/dev/null || true
        fi
    done <<< "$MOUNTED_VOLUMES"
fi

if [ -d "./dist" ]; then
    print_warning "Removing dist directory..."
    rm -rf ./dist
fi
if [ -d "./lib" ]; then
    print_warning "Removing lib directory..."
    rm -rf ./lib
fi
print_success "Clean complete"
echo ""

# Step 2: Build production code with Rsbuild
print_step "Step 2/3: Building production code with Rsbuild..."
npm run build:prod
print_success "Production build complete"
echo ""

# Step 3: Package and create DMG with electron-builder
print_step "Step 3/3: Packaging app and creating DMG with electron-builder..."

# Display what will be built
case "$ARCH" in
    x64)
        echo "  → Building for macOS Intel (x64) only..."
        ;;
    arm64)
        echo "  → Building for macOS Apple Silicon (arm64) only..."
        ;;
    both)
        echo "  → Building for both Intel (x64) and Apple Silicon (arm64)..."
        ;;
esac
echo "  → This will package the app and create the DMG installer(s)"
echo ""

# Set BUILD_ENV environment variable for artifact naming
export BUILD_ENV="${ENVIRONMENT}"

# Code signing: enabled only if --enable-code-sign flag was passed
# hardenedRuntime and entitlements are only applied when code signing is enabled
# to avoid Team ID mismatch (Electron Framework is pre-signed by Apple)
if [ "${ENABLE_CODE_SIGN}" = "true" ]; then
    print_success "Code signing: enabled"
    unset CSC_IDENTITY_AUTO_DISCOVERY
    CONFIG_FILES="electron-builder.yml electron-builder.sign.yml"
else
    print_warning "Code signing: disabled (pass --enable-code-sign to enable)"
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    CONFIG_FILES="electron-builder.yml"
fi

# Helper to run electron-builder for a specific architecture
run_electron_builder() {
    local target_arch="$1"
    echo ""
    echo "  → Starting electron-builder for macOS ${target_arch}..."
    npx electron-builder --mac --"${target_arch}" --config ${CONFIG_FILES}
}

# Run electron-builder with appropriate architecture flags
case "$ARCH" in
    x64)
        run_electron_builder "x64"
        ;;
    arm64)
        run_electron_builder "arm64"
        ;;
    both)
        run_electron_builder "x64"
        run_electron_builder "arm64"
        ;;
esac


print_success "Packaging and DMG creation complete"
echo ""

# Step 4: Find and report generated DMG files
print_step "Step 4/4: Locating generated DMG file(s)..."

# Find all DMG files created in this build
DMG_FILES=$(find ./dist -name "*.dmg" -type f)

if [ -z "$DMG_FILES" ]; then
    print_error "No DMG files found in ./dist directory"
    exit 1
fi

# Count DMG files
DMG_COUNT=$(echo "$DMG_FILES" | wc -l | tr -d ' ')
print_success "Found ${DMG_COUNT} DMG file(s)"
echo ""

# Build Summary
echo "════════════════════════════════════════════════════════════════"
echo "  Build Summary"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Package Version:  ${PACKAGE_VERSION}"
echo "  Environment:      ${ENVIRONMENT}"
echo "  Architecture(s):  ${ARCH}"
echo ""

# List all generated DMG files with details
while IFS= read -r dmg_file; do
    ARCH_TYPE="unknown"
    if [[ "$dmg_file" =~ x64 ]]; then
        ARCH_TYPE="Intel x64"
    elif [[ "$dmg_file" =~ arm64 ]]; then
        ARCH_TYPE="Apple Silicon ARM64"
    fi

    echo "  Platform:         macOS (${ARCH_TYPE})"
    echo "  Output Location:  ${dmg_file}"
    echo "  File Size:        $(du -sh "$dmg_file" | awk '{print $1}')"
    echo ""

    # Generate SHA-256 checksum
    print_step "Generating SHA-256 checksum..."
    CHECKSUM=$(shasum -a 256 "$dmg_file" | awk '{print $1}')
    CHECKSUM_FILE="${dmg_file}.sha256"
    echo "$CHECKSUM  $(basename "$dmg_file")" > "${CHECKSUM_FILE}"
    print_success "Checksum: ${CHECKSUM}"
    echo "  Saved to: ${CHECKSUM_FILE}"
    echo ""
done <<< "$DMG_FILES"

print_success "Build complete!"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  DMG installer(s) ready for distribution:"
while IFS= read -r dmg_file; do
    echo "  ${dmg_file}"
done <<< "$DMG_FILES"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Build duration
BUILD_END_TIME=$(date +%s)
BUILD_DURATION=$((BUILD_END_TIME - BUILD_START_TIME))
BUILD_MINUTES=$((BUILD_DURATION / 60))
BUILD_SECONDS=$((BUILD_DURATION % 60))
echo "  Build duration:   ${BUILD_MINUTES}m ${BUILD_SECONDS}s"
echo ""

exit 0
