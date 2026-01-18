import { app, BrowserWindow, shell, ipcMain, protocol } from 'electron';
import Store from 'electron-store';
import path from 'path';

// Initialize secure storage
const store = new Store({
  name: 'chess-gamble-config',
  encryptionKey: 'chess-gamble-secret-key', // In production, use a more secure key
});

// Development mode check
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Deep link protocol
const PROTOCOL = 'chessgamble';

// Create the browser window
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform !== 'darwin',
    backgroundColor: '#0f172a',
    show: false,
  });

  // Load the app
  const devPort = process.env.DEV_PORT || '3000';
  const startUrl = isDev
    ? `http://localhost:${devPort}`
    : `file://${path.join(__dirname, '../web/.next/server/app/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle deep links
function handleDeepLink(url: string) {
  // Parse the URL and handle different routes
  // e.g., chessgamble://auth/callback?token=xxx
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/auth/callback')) {
      const token = parsedUrl.searchParams.get('token');
      if (token && mainWindow) {
        mainWindow.webContents.send('auth:token', token);
      }
    }
  } catch (error) {
    console.error('Failed to parse deep link:', error);
  }
}

// Register protocol handler
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle the protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Handle single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Handle deep link on Windows/Linux
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      handleDeepLink(url);
    }

    // Focus the window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// App ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for secure storage
ipcMain.handle('store:get', (event, key: string) => {
  return store.get(key);
});

ipcMain.handle('store:set', (event, key: string, value: any) => {
  store.set(key, value);
});

ipcMain.handle('store:delete', (event, key: string) => {
  store.delete(key);
});

ipcMain.handle('store:clear', () => {
  store.clear();
});

// Handle OAuth - open browser for auth
ipcMain.handle('auth:openExternal', (event, url: string) => {
  shell.openExternal(url);
});
