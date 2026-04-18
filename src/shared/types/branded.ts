/**
 * Branded/nominal types for the shared type surface.
 */

/**
 * Branded type for nominal typing — prevents mixing structurally-identical primitive types.
 * Wrap a primitive with a unique brand to make it distinguishable at compile time.
 *
 * @example
 *   type UserId = Branded<string, 'UserId'>;
 *   type RoomId = Branded<string, 'RoomId'>;
 *   declare function getRoom(id: RoomId): void;
 *   const uid = 'abc' as UserId;
 *   getRoom(uid); // Error: Argument of type 'UserId' is not assignable to parameter of type 'RoomId'
 */
export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

/**
 * A URL string that has been validated by validateExternalURL() or validateFaviconURL().
 * Use this type to distinguish raw strings from validated URLs in function signatures.
 */
export type ValidatedURL = Branded<string, 'ValidatedURL'>;
