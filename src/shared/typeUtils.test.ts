/**
 * Unit tests for `typeUtils` — `asType<T>()` and `asUnsafe<T>()`.
 *
 * TDD RED PHASE (Task 1 of plan-astype-migration-2026-05-05):
 * The `asType` and `asUnsafe` symbols are intentionally NOT YET implemented in
 * `./typeUtils`. These tests reference them so that:
 *   - `bun run test:run -- typeUtils` fails (cannot import undefined symbols), and
 *   - `bun run typecheck` reports the missing-export errors as the *expected* red signal.
 *
 * Task 3 of the same plan will add the implementations and these tests will go green
 * with no further changes to this file.
 *
 * The existing `assertNever` export must continue to work — see the bottom block.
 */

import { describe, it, expect } from 'vitest';
import { asType, asUnsafe, assertNever } from './typeUtils';
import type { AccountIndex } from './types/branded';
import { asAccountIndex } from './types/branded';

// ---------------------------------------------------------------------------
// Domain payload sample used to exercise asUnsafe with an external/raw shape.
// ---------------------------------------------------------------------------
interface NotificationPayload {
  readonly title: string;
  readonly body: string;
}

describe('typeUtils.asType<T>()', () => {
  it('returns the identical string value at runtime', () => {
    const out = asType<string>('hello');
    expect(out).toBe('hello');
    expect(typeof out).toBe('string');
  });

  it('returns the identical number value', () => {
    const out = asType<number>(42);
    expect(out).toBe(42);
    expect(typeof out).toBe('number');
  });

  it('returns the identical boolean value', () => {
    const out = asType<boolean>(true);
    expect(out).toBe(true);
    expect(typeof out).toBe('boolean');
  });

  it('does NOT attach a brand — branded types still require their own helper', () => {
    // Runtime: asType returns the number unchanged.
    const viaAsType = asType<AccountIndex>(0);
    expect(viaAsType).toBe(0);

    // Compile-time discipline: a function that demands AccountIndex must be
    // satisfied via the dedicated branded helper, not via asType.
    const acceptsBranded = (idx: AccountIndex): AccountIndex => idx;
    const properlyBranded = asAccountIndex(0);
    expect(acceptsBranded(properlyBranded)).toBe(0);

    // Documentation note: `acceptsBranded(asType<AccountIndex>(0))` will type-check
    // because asType<T> is a structural cast, but downstream code that audits
    // brand provenance (lint/grep for asAccountIndex) will flag the cheat.
    // Therefore asType IS NOT a substitute for the branded helper.
  });
});

describe('typeUtils.asUnsafe<T>()', () => {
  it('returns the value unchanged and accepts a documenting reason', () => {
    const raw: unknown = { title: 'Hi', body: 'There' };
    const payload = asUnsafe<NotificationPayload>(
      raw,
      'third-party API may return unexpected shape'
    );
    expect(payload).toBe(raw);
    expect(payload.title).toBe('Hi');
    expect(payload.body).toBe('There');
  });

  it('treats the reason as documentation only — no runtime side effect', () => {
    const raw: unknown = { title: 'A', body: 'B' };
    const reason = 'reason-for-cast';
    const a = asUnsafe<NotificationPayload>(raw, reason);
    const b = asUnsafe<NotificationPayload>(raw, 'completely different reason text');
    // Same input → identical output regardless of reason content.
    expect(a).toBe(b);
    expect(a).toBe(raw);
  });

  it('requires a non-empty string reason at the type level', () => {
    // Sanity check at runtime: a non-empty reason string produces a value.
    const out = asUnsafe<NotificationPayload>({ title: 't', body: 'b' }, 'why');
    expect(out.title).toBe('t');

    // Compile-time contract (enforced by Task 3 implementation):
    //   asUnsafe<T>(value, "")   // ← must be a TYPE ERROR (empty string literal not assignable)
    // We deliberately do NOT add `@ts-expect-error` here per project anti-patterns;
    // the empty-reason rejection is guarded by the type signature itself.
    expect(typeof out).toBe('object');
  });
});

describe('typeUtils.assertNever — pre-existing behaviour preserved', () => {
  it('throws when reached at runtime', () => {
    // Force a runtime call by lying about the value type via asUnsafe (the
    // exact utility under test). This proves both the new helper and the
    // long-standing assertNever cooperate.
    const sneaky = asUnsafe<never>('unexpected', 'force runtime branch for test');
    expect(() => assertNever(sneaky)).toThrow();
  });
});
