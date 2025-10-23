#!/bin/bash

##
# Complete build script for macOS x64 DMG
# This script uses electron-builder for packaging and DMG creation
##

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════"
echo "  Open GChat - macOS x64 DMG Build Script"
echo "════════════════════════════════════════════════════════════════"
echo ""

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

# Parse required --environment argument
ENVIRONMENT=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        *)
            print_error "Unknown argument: $1"
            echo "Usage: $0 --environment <environment>"
            exit 1
            ;;
    esac
done

# Validate environment argument
if [ -z "$ENVIRONMENT" ]; then
    print_error "Missing required argument: --environment"
    echo "Usage: $0 --environment <environment>"
    echo "Example: $0 --environment develop"
    exit 1
fi

print_success "Environment: ${ENVIRONMENT}"
echo ""

# Extract version from package.json
print_step "Extracting version from package.json..."
PACKAGE_VERSION=$(cat ./package.json | grep '"version"' | sed 's/.*"version": "\(.*\)".*/\1/')
if [ -z "$PACKAGE_VERSION" ]; then
    print_error "Failed to extract version from package.json"
    exit 1
fi
print_success "Version: ${PACKAGE_VERSION}"
echo ""

# Define output paths
OUT_DIR="./dist/"
DMG_NAME="Google Chat-v${PACKAGE_VERSION}-macOS-x64-${ENVIRONMENT}.dmg"
OUT_FILE_PATH="${OUT_DIR}${DMG_NAME}"

# Step 1: Clean previous builds
print_step "Step 1/3: Cleaning previous builds..."
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
if [ $? -ne 0 ]; then
    print_error "Rsbuild compilation failed"
    exit 1
fi
print_success "Production build complete"
echo ""

# Step 3: Package and create DMG with electron-builder
print_step "Step 3/3: Packaging app and creating DMG with electron-builder..."
echo "  → Building for macOS x64 (Intel)..."
echo "  → This will package the app and create the DMG installer"
echo ""

# Set BUILD_ENV environment variable for artifact naming
export BUILD_ENV="${ENVIRONMENT}"

# Disable automatic code signing discovery
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Run electron-builder with macOS x64 target
npx electron-builder --mac --x64 --config electron-builder.yml

if [ $? -ne 0 ]; then
    print_error "electron-builder failed"
    exit 1
fi

print_success "Packaging and DMG creation complete"
echo ""

# Step 4: Find the generated DMG file
print_step "Step 4/4: Locating generated DMG file..."

# electron-builder creates DMG with the pattern defined in artifactName
# Look for the DMG file in dist directory
ACTUAL_DMG=$(find ./dist -name "*.dmg" -type f | head -n 1)

if [ -z "$ACTUAL_DMG" ]; then
    print_error "DMG file not found in ./dist directory"
    exit 1
fi

print_success "DMG found: $(basename "$ACTUAL_DMG")"
echo ""

# Build Summary
echo "════════════════════════════════════════════════════════════════"
echo "  Build Summary"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Package Version:  ${PACKAGE_VERSION}"
echo "  Environment:      ${ENVIRONMENT}"
echo "  Platform:         macOS (Intel x64)"
echo "  Output Location:  ${ACTUAL_DMG}"
echo "  File Size:        $(du -sh "$ACTUAL_DMG" | awk '{print $1}')"
echo ""

print_success "Build complete!"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  DMG installer ready for distribution:"
echo "  ${ACTUAL_DMG}"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Generate SHA-256 checksum
print_step "Generating SHA-256 checksum..."
CHECKSUM=$(shasum -a 256 "$ACTUAL_DMG" | awk '{print $1}')
CHECKSUM_FILE="${ACTUAL_DMG}.sha256"
echo "$CHECKSUM  $(basename "$ACTUAL_DMG")" > "${CHECKSUM_FILE}"
print_success "Checksum: ${CHECKSUM}"
echo "  Saved to: ${CHECKSUM_FILE}"
echo ""

exit 0
