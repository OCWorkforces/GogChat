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
