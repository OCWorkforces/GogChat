#!/bin/bash
set -e

echo "Starting mac x64 DMG build..."

echo "Finding package version..."
PACKAGE_VERSION=$(cat ./package.json | grep '"version"' | sed s/'  \"version\": \"'//g | sed s/'\",'//g)
echo "Version: $PACKAGE_VERSION"

SOURCE_DIR="./dist/gchat-darwin-x64/"
APP_NAME="gchat.app"
OUT_DIR="./dist/"
OUT_FILE_PATH="${OUT_DIR}gchat-v${PACKAGE_VERSION}.dmg"
TEMP_DMG="./dist/gchat-v${PACKAGE_VERSION}-temp.dmg"
VOLUME_NAME="GChat ${PACKAGE_VERSION}"

echo "Creating output folder: ${OUT_DIR}"
mkdir -p "$OUT_DIR"

echo "Remove DMG file if exists"
rm -f "$OUT_FILE_PATH"
rm -f "$TEMP_DMG"

echo "Creating temporary DMG..."
hdiutil create -srcfolder "${SOURCE_DIR}${APP_NAME}" -volname "${VOLUME_NAME}" -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW -size 500m "$TEMP_DMG"

echo "Mounting temporary DMG..."
MOUNT_OUTPUT=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_DMG")
MOUNT_DIR=$(echo "$MOUNT_OUTPUT" | grep -E '^/dev/' | tail -1 | awk '{$1=$2=""; print $0}' | sed 's/^ *//')

echo "Mount directory: $MOUNT_DIR"

echo "Creating Applications symlink..."
ln -s /Applications "$MOUNT_DIR/Applications"

echo "Unmounting temporary DMG..."
hdiutil detach "$MOUNT_DIR" -force

echo "Converting to compressed DMG: ${OUT_FILE_PATH}"
hdiutil convert "$TEMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$OUT_FILE_PATH"

echo "Remove temporary DMG"
rm -f "$TEMP_DMG"

echo "Show file info"
du -sh "$OUT_FILE_PATH"

echo "Finished!"
