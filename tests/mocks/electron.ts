/**
 * Electron Mock Module
 * Provides mock implementations of Electron APIs for unit testing
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Mock BrowserWindow class
 */
export class MockBrowserWindow extends EventEmitter {
  public webContents: MockWebContents;
  public id: number;
  private static nextId = 1;
  private static windows: MockBrowserWindow[] = [];
  private visible = true;
  private maximized = false;
  private minimized = false;
  private fullScreen = false;
  private destroyed = false;
  private bounds = { x: 0, y: 0, width: 800, height: 600 };

  constructor(options?: any) {
    super();
    this.id = MockBrowserWindow.nextId++;
    this.webContents = new MockWebContents();
    MockBrowserWindow.windows.push(this);

    if (options?.show === false) {
      this.visible = false;
    }
  }

  static getAllWindows(): MockBrowserWindow[] {
    return MockBrowserWindow.windows.filter(w => !w.destroyed);
  }

  static fromId(id: number): MockBrowserWindow | null {
    return MockBrowserWindow.windows.find(w => w.id === id && !w.destroyed) || null;
  }

  loadURL(url: string): Promise<void> {
    this.webContents.url = url;
    return Promise.resolve();
  }

  show(): void {
    this.visible = true;
    this.emit('show');
  }

  hide(): void {
    this.visible = false;
    this.emit('hide');
  }

  close(): void {
    const event = { preventDefault: vi.fn() };
    this.emit('close', event);
    if (!event.preventDefault.mock.calls.length) {
      this.destroy();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('closed');
    const index = MockBrowserWindow.windows.indexOf(this);
    if (index > -1) {
      MockBrowserWindow.windows.splice(index, 1);
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  isMaximized(): boolean {
    return this.maximized;
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  isFullScreen(): boolean {
    return this.fullScreen;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  maximize(): void {
    this.maximized = true;
    this.emit('maximize');
  }

  unmaximize(): void {
    this.maximized = false;
    this.emit('unmaximize');
  }

  minimize(): void {
    this.minimized = true;
    this.emit('minimize');
  }

  restore(): void {
    this.minimized = false;
    this.emit('restore');
  }

  setFullScreen(flag: boolean): void {
    this.fullScreen = flag;
    this.emit(flag ? 'enter-full-screen' : 'leave-full-screen');
  }

  getBounds(): typeof this.bounds {
    return { ...this.bounds };
  }

  setBounds(bounds: Partial<typeof this.bounds>): void {
    this.bounds = { ...this.bounds, ...bounds };
    this.emit('move');
    this.emit('resize');
  }

  setOverlayIcon(icon: any, description: string): void {
    // Mock implementation
  }

  focus(): void {
    this.emit('focus');
  }

  blur(): void {
    this.emit('blur');
  }

  static reset(): void {
    MockBrowserWindow.windows = [];
    MockBrowserWindow.nextId = 1;
  }
}

/**
 * Mock WebContents class
 */
export class MockWebContents extends EventEmitter {
  public url = '';
  public session: MockSession;

  constructor() {
    super();
    this.session = new MockSession();
  }

  send(channel: string, ...args: any[]): void {
    this.emit('ipc-message', channel, ...args);
  }

  loadURL(url: string): Promise<void> {
    this.url = url;
    return Promise.resolve();
  }

  reload(): void {
    this.emit('did-navigate');
  }

  getURL(): string {
    return this.url;
  }

  openDevTools(): void {
    // Mock implementation
  }

  closeDevTools(): void {
    // Mock implementation
  }

  getWebPreferences(): any {
    return {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    };
  }

  setWindowOpenHandler(handler: any): void {
    // Mock implementation
  }
}

/**
 * Mock Session class
 */
export class MockSession extends EventEmitter {
  public webRequest = {
    onHeadersReceived: vi.fn(),
    onBeforeRequest: vi.fn(),
  };

  async clearCache(): Promise<void> {
    return Promise.resolve();
  }

  async clearStorageData(options?: any): Promise<void> {
    return Promise.resolve();
  }

  setPermissionRequestHandler(handler: any): void {
    // Mock implementation
  }

  on(event: string, listener: any): this {
    super.on(event, listener);
    return this;
  }
}

/**
 * Mock App class
 */
export class MockApp extends EventEmitter {
  private ready = false;
  private quitting = false;
  private paths: Record<string, string> = {
    userData: '/mock/user/data',
    logs: '/mock/logs',
    temp: '/mock/temp',
    appData: '/mock/app/data',
  };

  whenReady(): Promise<void> {
    if (this.ready) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.once('ready', resolve);
    });
  }

  quit(): void {
    this.quitting = true;
    this.emit('before-quit');
    this.emit('will-quit');
    this.emit('quit');
  }

  exit(code = 0): void {
    process.exit(code);
  }

  getPath(name: string): string {
    return this.paths[name] || `/mock/${name}`;
  }

  setPath(name: string, path: string): void {
    this.paths[name] = path;
  }

  getName(): string {
    return 'GogChat';
  }

  getVersion(): string {
    return '3.1.2';
  }

  getLocale(): string {
    return 'en-US';
  }

  isPackaged = false;

  requestSingleInstanceLock(): boolean {
    return true;
  }

  getBadgeCount(): number {
    return 0;
  }

  setBadgeCount(count: number): boolean {
    return true;
  }

  dock = {
    setBadge: vi.fn(),
    getBadge: vi.fn(() => ''),
    hide: vi.fn(),
    show: vi.fn(),
  };

  setAppUserModelId(id: string): void {
    // Mock implementation
  }

  private protocolClients: Set<string> = new Set();

  setAsDefaultProtocolClient(protocol: string, _path?: string, _args?: string[]): boolean {
    this.protocolClients.add(protocol);
    return true;
  }

  removeAsDefaultProtocolClient(protocol: string): boolean {
    return this.protocolClients.delete(protocol);
  }

  isDefaultProtocolClient(protocol: string): boolean {
    return this.protocolClients.has(protocol);
  }

  setReady(): void {
    this.ready = true;
    this.emit('ready');
  }

  reset(): void {
    this.ready = false;
    this.quitting = false;
    this.protocolClients.clear();
    this.removeAllListeners();
  }
}

/**
 * Mock IpcMain class
 */
export class MockIpcMain extends EventEmitter {
  handle(channel: string, handler: any): void {
    this.on(`handle:${channel}`, handler);
  }

  removeHandler(channel: string): void {
    this.removeAllListeners(`handle:${channel}`);
  }

  handleOnce(channel: string, handler: any): void {
    this.once(`handle:${channel}`, handler);
  }

  async invoke(channel: string, ...args: any[]): Promise<any> {
    const handlers = this.listeners(`handle:${channel}`);
    if (handlers.length > 0) {
      const event = { sender: new MockWebContents() };
      return handlers[0](event, ...args);
    }
    throw new Error(`No handler for channel: ${channel}`);
  }

  reset(): void {
    this.removeAllListeners();
  }
}

/**
 * Mock IpcRenderer class
 */
export class MockIpcRenderer extends EventEmitter {
  send(channel: string, ...args: any[]): void {
    this.emit(channel, {}, ...args);
  }

  sendSync(channel: string, ...args: any[]): any {
    // Simplified sync implementation
    return undefined;
  }

  async invoke(channel: string, ...args: any[]): Promise<any> {
    return new Promise((resolve) => {
      this.once(`${channel}-response`, (event, result) => {
        resolve(result);
      });
      this.send(channel, ...args);
    });
  }

  reset(): void {
    this.removeAllListeners();
  }
}

/**
 * Mock Menu class
 */
export class MockMenu {
  static buildFromTemplate(template: any[]): MockMenu {
    return new MockMenu();
  }

  static setApplicationMenu(menu: MockMenu | null): void {
    // Mock implementation
  }

  static getApplicationMenu(): MockMenu | null {
    return new MockMenu();
  }

  popup(options?: any): void {
    // Mock implementation
  }
}

/**
 * Mock Tray class
 */
export class MockTray extends EventEmitter {
  private tooltip = '';
  private contextMenu: MockMenu | null = null;

  constructor(icon: any) {
    super();
  }

  setToolTip(tooltip: string): void {
    this.tooltip = tooltip;
  }

  setContextMenu(menu: MockMenu): void {
    this.contextMenu = menu;
  }

  setIgnoreDoubleClickEvents(ignore: boolean): void {
    // Mock implementation
  }

  destroy(): void {
    this.emit('destroyed');
  }
}

/**
 * Mock Dialog class
 */
export class MockDialog {
  static showMessageBox(options: any): Promise<any> {
    return Promise.resolve({ response: 0 });
  }

  static showErrorBox(title: string, content: string): void {
    // Mock implementation
  }

  static showOpenDialog(options: any): Promise<any> {
    return Promise.resolve({ canceled: false, filePaths: [] });
  }

  static showSaveDialog(options: any): Promise<any> {
    return Promise.resolve({ canceled: false, filePath: undefined });
  }
}

/**
 * Mock Shell class
 */
export class MockShell {
  static async openExternal(url: string): Promise<void> {
    return Promise.resolve();
  }

  static async openPath(path: string): Promise<string> {
    return Promise.resolve('');
  }

  static showItemInFolder(path: string): void {
    // Mock implementation
  }
}

/**
 * Mock NativeImage class
 */
export class MockNativeImage {
  private data: Buffer | null = null;

  static createFromPath(path: string): MockNativeImage {
    return new MockNativeImage();
  }

  static createFromBuffer(buffer: Buffer): MockNativeImage {
    const image = new MockNativeImage();
    image.data = buffer;
    return image;
  }

  static createEmpty(): MockNativeImage {
    return new MockNativeImage();
  }

  resize(options: { width: number; height: number }): MockNativeImage {
    return this;
  }

  isEmpty(): boolean {
    return this.data === null;
  }

  getSize(): { width: number; height: number } {
    return { width: 100, height: 100 };
  }

  toPNG(): Buffer {
    return this.data || Buffer.from([]);
  }
}

/**
 * Create mock Electron module
 */
export function createElectronMock() {
  const app = new MockApp();
  const ipcMain = new MockIpcMain();
  const ipcRenderer = new MockIpcRenderer();

  return {
    app,
    ipcMain,
    ipcRenderer,
    BrowserWindow: MockBrowserWindow,
    Menu: MockMenu,
    Tray: MockTray,
    dialog: MockDialog,
    shell: MockShell,
    nativeImage: MockNativeImage,
    session: MockSession,
    webContents: MockWebContents,

    // Reset all mocks
    reset: () => {
      app.reset();
      ipcMain.reset();
      ipcRenderer.reset();
      MockBrowserWindow.reset();
    },
  };
}

/**
 * Default mock instance
 */
export const electronMock = createElectronMock();