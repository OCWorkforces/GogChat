#!/bin/bash

# Linting and formatting script for GChat
# Usage: ./scripts/lint.sh [--fix]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if --fix flag is provided
FIX_MODE=false
if [[ "$1" == "--fix" ]]; then
  FIX_MODE=true
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Open GChat Linting and Formatting${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0

# Function to run a command and track status
run_check() {
  local name="$1"
  shift
  local cmd=("$@")

  echo -e "${YELLOW}▶ ${name}${NC}"

  if "${cmd[@]}"; then
    echo -e "${GREEN}✓ ${name} passed${NC}"
    echo ""
    return 0
  else
    echo -e "${RED}✗ ${name} failed${NC}"
    echo ""
    OVERALL_STATUS=1
    return 1
  fi
}

# ESLint
if [ "$FIX_MODE" = true ]; then
  run_check "ESLint (fixing)" npx eslint "src/**/*.ts" "scripts/**/*.js" --fix || true
else
  run_check "ESLint" npx eslint "src/**/*.ts" "scripts/**/*.js" || true
fi

# Prettier
if [ "$FIX_MODE" = true ]; then
  run_check "Prettier (fixing)" npx prettier --write "src/**/*.{ts,js,json}" "scripts/**/*.js" "*.{json,md}" || true
else
  run_check "Prettier" npx prettier --check "src/**/*.{ts,js,json}" "scripts/**/*.js" "*.{json,md}" || true
fi

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $OVERALL_STATUS -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
else
  if [ "$FIX_MODE" = true ]; then
    echo -e "${YELLOW}⚠ Some issues were fixed. Please review the changes.${NC}"
  else
    echo -e "${RED}✗ Some checks failed. Run with --fix to auto-fix issues.${NC}"
  fi
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

exit $OVERALL_STATUS
