/**
 * Menu Action Registry
 *
 * Decouples features from appMenu by providing a registry for menu actions.
 * Features register their actions here during initialization, and appMenu
 * consumes them via the registry instead of direct feature→feature imports.
 *
 * This eliminates boundary violations where appMenu.ts imported from
 * openAtLogin.ts, aboutPanel.ts, and externalLinks.ts.
 */

/**
 * Menu action descriptor
 */
export interface MenuAction {
  /** Human-readable label for logging */
  label: string;
  /** The action handler */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => any;
}

/**
 * Global registry of menu actions, keyed by action id.
 * Actions are registered by features during their init phase and
 * consumed by appMenu when building the menu template.
 */
const actions = new Map<string, MenuAction>();

/**
 * Register a menu action.
 * Called by features during their initialization phase.
 */
export function registerMenuAction(id: string, action: MenuAction): void {
  actions.set(id, action);
}

/**
 * Retrieve a registered menu action by id.
 * Called by appMenu when building the menu template.
 * Returns undefined if no action registered (defensive — feature may not have loaded).
 */
export function getMenuAction(id: string): MenuAction | undefined {
  return actions.get(id);
}

/**
 * Clear all registered actions (for testing / cleanup).
 */
export function clearMenuActions(): void {
  actions.clear();
}
