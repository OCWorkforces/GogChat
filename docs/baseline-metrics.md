# Baseline Metrics

**Date**: 2026-04-21
**Branch**: refactor/codebase-improvement

## sentrux-mcp Health

| Metric | Value |
|---|---|
| Quality signal | 0.5436 |
| Acyclicity | 1.0 |
| Depth score | 0.40 (12 level breaks, propagation cost 722) |
| Modularity | 0.49 (222 cross-module edges / 394 total) |
| Equality | 0.61 |
| Redundancy | 0.80 |

## Test Coverage (bun run test:coverage)

| Metric | Percentage | Count |
|---|---|---|
| Statements | 98.7% | 1988/2014 |
| Branches | 96.41% | 753/781 |
| Functions | 98.68% | 449/455 |
| Lines | 98.93% | 1950/1971 |
| Test files | 80 | All passing |
| Total tests | 1808 | All passing |

**File coverage**: 90/140 source files have colocated tests (64.3%). 50 source files have no test file.

### Low-Coverage Files (< 95% statements)

| File | Statements | Branches |
|---|---|---|
| registerSecurityFeatures.ts | 83.33% | 100% |
| packageInfo.ts | 84.61% | 100% |
| registerAppReady.ts | 93.24% | 62.5% |
| deepLinkHandler.ts | 94.87% | 97.05% |
| config.ts | 98% | 90% |
| featureManager.ts | 97.58% | 87.5% |
| performanceMonitor.ts | 97.46% | 94.28% |

## God File Import Counts

| File | Imports | Status |
|---|---|---|
| registerAppReady.ts | 14 | Non-orchestrator, exceeds 8 |
| registerShutdown.ts | 12 | Non-orchestrator, exceeds 8 |
| index.ts | 12 | Orchestrator (acceptable) |
| appMenu.ts | 11 | Non-orchestrator, exceeds 8 |
| badgeIcon.ts | 11 | Non-orchestrator, exceeds 8 |
| accountWindowManager.ts | 7 | Hub but within limit |

## Dependency Analysis

- Circular dependencies: 0 (confirmed by sentrux-mcp acyclicity=1.0)
- Total import edges: 394
- Cross-module edges: 222
- madge: not installed (needs `bun add -D madge` for CI)

## Build

- Tests: 80 files, 1808 tests, all passing (19.3s)
- E2E tests: 1 file (tests/e2e/user-workflows.test.ts)
- docs/ directory: created (was missing)
