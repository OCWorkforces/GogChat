# Platform Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns macOS platform integration: tray, dock badges, app menu, help menu actions, icon cache, and window defaults.

## Conventions

- GogChat is macOS-only. Do not add cross-platform fallbacks unless product scope changes.
- Tray/badge coupling is one-way through `trayIconState.setTrayUnread()`.
- Badge image composition belongs in `badgeHelpers.ts` using `nativeImage` primitives.
- `helpMenuBuilder.ts` consumes feature actions through `features/menuActionRegistry.ts`; it should not import feature modules directly.
- `windowDefaults.ts` centralizes BrowserWindow defaults used by account managers.

## Icon cache

`iconCache.ts` intentionally warms assets in tiers:

1. INITIAL: immediate startup-critical icons.
2. SOON_DEFERRED: short-delay warmup, around 2s.
3. IDLE_DEFERRED: idle/late warmup, around 30s.

Do not move all icon work into startup; it affects app-ready latency.

## Anti-patterns

- No direct feature imports from menu/platform utilities except the menu action registry.
- No platform checks that imply Windows/Linux support.
- No badge or tray state writes from unrelated modules; route through platform helpers.
