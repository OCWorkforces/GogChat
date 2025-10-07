import Store from 'electron-store';

interface StoreType {
  window: {
    bounds: {
      x: number | null;
      y: number | null;
      width: number;
      height: number;
    };
    isMaximized: boolean;
  };
  app: {
    autoCheckForUpdates: boolean;
    autoLaunchAtLogin: boolean;
    startHidden: boolean;
    hideMenuBar: boolean;
    disableSpellChecker: boolean;
  };
}

const schema = {
  window: {
    type: 'object',
    properties: {
      bounds: {
        type: 'object',
        properties: {
          x: {
            type: 'number'
          },
          y: {
            type: 'number'
          },
          width: {
            type: 'number'
          },
          height: {
            type: 'number'
          },
        },
        default: {
          x: null,
          y: null,
          width: 800,
          height: 600,
        }
      },
      isMaximized: {
        type: 'boolean',
        default: false
      }
    },
    default: {
      bounds: {}
    }
  },
  app: {
    type: 'object',
    properties: {
      autoCheckForUpdates: {
        type: 'boolean',
        default: true
      },
      autoLaunchAtLogin: {
        type: 'boolean',
        default: true
      },
      startHidden: {
        type: 'boolean',
        default: false
      },
      hideMenuBar: {
        type: 'boolean',
        default: false
      },
      disableSpellChecker: {
        type: 'boolean',
        default: false
      },
    },
    default: {}
  }
};

const store = new Store<StoreType>({schema});

export default store;