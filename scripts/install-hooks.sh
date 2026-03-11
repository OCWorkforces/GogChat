#!/bin/bash

# Install git hooks for GiChat
# This script copies hooks from scripts/hooks/ to .git/hooks/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOKS_DIR="$PROJECT_ROOT/scripts/hooks"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "📦 Installing git hooks..."
echo ""

# Check if .git directory exists
if [ ! -d "$GIT_HOOKS_DIR" ]; then
  echo "❌ Error: .git/hooks directory not found. Are you in a git repository?"
  exit 1
fi

# Copy hooks and make them executable
for hook in "$HOOKS_DIR"/*; do
  if [ -f "$hook" ]; then
    hook_name=$(basename "$hook")
    echo "  Installing $hook_name..."
    cp "$hook" "$GIT_HOOKS_DIR/$hook_name"
    chmod +x "$GIT_HOOKS_DIR/$hook_name"
  fi
done

echo ""
echo "✅ Git hooks installed successfully!"
echo ""
echo "Installed hooks:"
ls -lh "$GIT_HOOKS_DIR"/pre-* 2>/dev/null | grep -v ".sample" || echo "  (none)"
echo ""
