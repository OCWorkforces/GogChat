#!/bin/bash

##
# Complete build script for macOS ARM64 (Apple Silicon) DMG
# This script handles the entire build pipeline from source to DMG installer
##

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════"
echo "  GChat - macOS ARM64 (Apple Silicon) DMG Build Script"
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

# Extract version from package.json
print_step "Extracting version from package.json..."
PACKAGE_VERSION=$(cat ./package.json | grep '"version"' | sed 's/.*"version": "\(.*\)".*/\1/')
if [ -z "$PACKAGE_VERSION" ]; then
    print_error "Failed to extract version from package.json"
    exit 1
fi
print_success "Version: ${PACKAGE_VERSION}"
echo ""

# Define paths
ARCH="arm64"
PLATFORM="darwin"
SOURCE_DIR="./dist/GChat-${PLATFORM}-${ARCH}/"
APP_NAME="GChat.app"
OUT_DIR="./dist/"
DMG_NAME="GChat-v${PACKAGE_VERSION}-macOS-arm64.dmg"
OUT_FILE_PATH="${OUT_DIR}${DMG_NAME}"
TEMP_DMG="${OUT_DIR}GChat-v${PACKAGE_VERSION}-arm64-temp.dmg"
VOLUME_NAME="GChat ${PACKAGE_VERSION}"

# Step 1: Clean previous builds
print_step "Step 1/5: Cleaning previous builds..."
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

# Step 2: Build production code with esbuild
print_step "Step 2/5: Building production code with esbuild..."
npm run build:prod
if [ $? -ne 0 ]; then
    print_error "esbuild compilation failed"
    exit 1
fi
print_success "Production build complete"
echo ""

# Step 3: Package the app with electron-packager
print_step "Step 3/5: Packaging app for macOS ARM64 (Apple Silicon)..."
npm run pack:mac-arm
if [ $? -ne 0 ]; then
    print_error "Packaging failed"
    exit 1
fi
print_success "App packaged successfully"
echo ""

# Verify the app bundle exists
if [ ! -d "${SOURCE_DIR}${APP_NAME}" ]; then
    print_error "App bundle not found at ${SOURCE_DIR}${APP_NAME}"
    exit 1
fi

# Step 4: Create DMG installer
print_step "Step 4/5: Creating DMG installer..."

# Create output directory
mkdir -p "$OUT_DIR"

# Remove existing DMG files
if [ -f "$OUT_FILE_PATH" ]; then
    print_warning "Removing existing DMG: ${DMG_NAME}"
    rm -f "$OUT_FILE_PATH"
fi
if [ -f "$TEMP_DMG" ]; then
    rm -f "$TEMP_DMG"
fi

# Create temporary DMG
echo "  → Creating temporary DMG from app bundle..."
hdiutil create -srcfolder "${SOURCE_DIR}${APP_NAME}" \
    -volname "${VOLUME_NAME}" \
    -fs HFS+ \
    -fsargs "-c c=64,a=16,e=16" \
    -format UDRW \
    -size 500m \
    "$TEMP_DMG" > /dev/null

if [ $? -ne 0 ]; then
    print_error "Failed to create temporary DMG"
    exit 1
fi

# Mount temporary DMG
echo "  → Mounting temporary DMG..."
MOUNT_OUTPUT=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_DMG" 2>&1)
MOUNT_DIR=$(echo "$MOUNT_OUTPUT" | grep -E '^/dev/' | tail -1 | awk '{$1=$2=""; print $0}' | sed 's/^ *//')

if [ -z "$MOUNT_DIR" ]; then
    print_error "Failed to mount temporary DMG"
    rm -f "$TEMP_DMG"
    exit 1
fi

echo "  → Mount directory: ${MOUNT_DIR}"

# Create Applications symlink for drag-to-install UX
echo "  → Creating Applications symlink..."
ln -s /Applications "$MOUNT_DIR/Applications"

# Unmount temporary DMG
echo "  → Unmounting temporary DMG..."
hdiutil detach "$MOUNT_DIR" -force > /dev/null 2>&1

# Convert to compressed DMG
echo "  → Converting to compressed DMG (zlib level 9)..."
hdiutil convert "$TEMP_DMG" \
    -format UDZO \
    -imagekey zlib-level=9 \
    -o "$OUT_FILE_PATH" > /dev/null

if [ $? -ne 0 ]; then
    print_error "Failed to convert to compressed DMG"
    rm -f "$TEMP_DMG"
    exit 1
fi

# Remove temporary DMG
echo "  → Cleaning up temporary files..."
rm -f "$TEMP_DMG"

print_success "DMG created successfully"
echo ""

# Step 5: Summary
print_step "Step 5/5: Build Summary"
echo ""
echo "  Package Version:  ${PACKAGE_VERSION}"
echo "  Platform:         macOS (Apple Silicon ARM64)"
echo "  Output Location:  ${OUT_FILE_PATH}"
echo "  File Size:        $(du -sh "$OUT_FILE_PATH" | awk '{print $1}')"
echo ""

# Calculate total app bundle size
APP_SIZE=$(du -sh "${SOURCE_DIR}${APP_NAME}" | awk '{print $1}')
echo "  App Bundle Size:  ${APP_SIZE}"
echo ""

print_success "Build complete!"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  DMG installer ready for distribution:"
echo "  ${OUT_FILE_PATH}"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Optional: Create checksum
print_step "Generating SHA-256 checksum..."
CHECKSUM=$(shasum -a 256 "$OUT_FILE_PATH" | awk '{print $1}')
echo "$CHECKSUM  $DMG_NAME" > "${OUT_FILE_PATH}.sha256"
print_success "Checksum: ${CHECKSUM}"
echo "  Saved to: ${OUT_FILE_PATH}.sha256"
echo ""

exit 0
