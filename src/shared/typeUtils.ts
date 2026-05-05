/**
 * Compile-time exhaustiveness helper for discriminated unions.
 *
 * Place in the `default` branch of a switch on a discriminated union —
 * if any variant is unhandled, TypeScript will error at compile time.
 * At runtime, this is unreachable when the switch is exhaustive.
 *
 * @example
 *   function handleIcon(state: IconState): string {
 *     switch (state.type) {
 *       case 'offline': return '/icons/offline.png';
 *       case 'normal': return '/icons/normal.png';
 *       case 'badge':  return `/icons/badge-${state.count}.png`;
 *       default:       return assertNever(state);
 *     }
 *   }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union variant: ${JSON.stringify(value)}`);
}

/**
 * Greppable, intentional type assertion.
 * Zero runtime cost beyond the function call. Use when surrounding validation, narrowing,
 * or structural guarantees have already proven the type but TypeScript cannot infer it.
 *
 * DO NOT use:
 *   - For branded nominal types → use asAccountIndex / asValidatedURL / toPartition
 *   - For `as const` or `as const satisfies` → keep the structural literals
 *   - For catch binding errors (`catch (e) { e as Error }`) → keep pattern (explicitly out of scope)
 *   - As a general replacement for fixing incorrect types — fix the root cause instead.
 */
export function asType<T>(value: unknown): T {
  return value as T;
}

/**
 * Marked tech-debt / unsafe cast. The reason string is required and becomes part of the
 * source-level documentation, making every unsafe cast searchable via `grep "asUnsafe<"`.
 * Semantics are identical to `asType`; the marker exists solely for audit & future hardening.
 */
export function asUnsafe<T>(value: unknown, _reason: string): T {
  return value as T;
}
