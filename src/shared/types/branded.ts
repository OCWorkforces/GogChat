/**
 * Branded/nominal types for the shared type surface.
 *
 * INTERNAL CAST CONVENTION (Plan Task 5, 2026-05-05):
 * Each branded helper below performs exactly ONE bare `as` cast — the
 * authoritative construction site for that brand. We keep the bare `as` form
 * (rather than routing through `asUnsafe<T>()`) because:
 *   1. These are the ONLY allowed sites for the cast; centralizing them here
 *      makes them auditable via this file alone.
 *   2. Each cast carries an inline `// internal branded factory: ...` comment
 *      so future readers see the justification without leaving the file.
 *   3. This file is exempted from `no-restricted-syntax` in
 *      `eslint.config.js` precisely because every cast below is intentional
 *      and reviewed at this single audit boundary.
 * All callers MUST go through these helpers — never write `x as <Brand>` at a
 * call site.
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

/**
 * Account index identifier.
 * Distinguishes account indexes from other numeric values like window IDs or port numbers.
 */
export type AccountIndex = Branded<number, 'AccountIndex'>;

/**
 * Session partition string for per-account isolation (e.g. "persist:account-0").
 */
export type AccountPartition = Branded<string, 'AccountPartition'>;

/**
 * Feature module name identifier.
 */
export type FeatureNameBrand = Branded<string, 'FeatureName'>;

/**
 * Renderer webContents numeric identifier.
 * Distinguishes webContents IDs from other numeric values like account indexes.
 */
export type WebContentsId = Branded<number, 'WebContentsId'>;

/**
 * Cast a validated string to the `ValidatedURL` branded type.
 * Only call this after the string has been through validateExternalURL(),
 * validateFaviconURL(), or validateDeepLinkURL().
 * This is a type-level marker — it does not perform any validation itself.
 */
export function asValidatedURL(s: string): ValidatedURL {
  // internal branded factory: only allowed cast site for ValidatedURL
  return s as ValidatedURL;
}

/**
 * Cast a number to the `AccountIndex` branded type.
 * Only call this after the number has been validated as a genuine account index.
 */
export function asAccountIndex(n: number): AccountIndex {
  // internal branded factory: only allowed cast site for AccountIndex
  return n as AccountIndex;
}

/**
 * Create a session partition string from an account index.
 */
export function toPartition(index: AccountIndex): AccountPartition {
  // internal branded factory: only allowed cast site for AccountPartition
  return `persist:account-${String(index)}` as AccountPartition;
}

/**
 * Cast a string to the `FeatureNameBrand` branded type.
 * Only call this after the string has been validated as a registered feature name.
 * This is a type-level marker — it does not perform any validation itself.
 */
export function asFeatureName(name: string): FeatureNameBrand {
  // internal branded factory: only allowed cast site for FeatureNameBrand
  return name as FeatureNameBrand;
}

/**
 * Cast a number to the `WebContentsId` branded type.
 * Only call this with a genuine Electron webContents.id value.
 * This is a type-level marker — it does not perform any validation itself.
 */
export function asWebContentsId(n: number): WebContentsId {
  // internal branded factory: only allowed cast site for WebContentsId
  return n as WebContentsId;
}
