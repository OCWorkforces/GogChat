import store from '../config.js';

export interface WindowDefaults {
  hideMenuBar: boolean;
  startHidden: boolean;
  disableSpellChecker: boolean;
}

/**
 * Read window-related defaults from the store.
 * Leaf utility — keeps windowWrapper.ts decoupled from the full config chain.
 */
export function getWindowDefaults(): WindowDefaults {
  return {
    hideMenuBar: store.get('app.hideMenuBar') as boolean,
    startHidden: store.get('app.startHidden') as boolean,
    disableSpellChecker: store.get('app.disableSpellChecker') as boolean,
  };
}
