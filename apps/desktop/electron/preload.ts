import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Secure storage
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },

  // Auth
  auth: {
    openExternal: (url: string) => ipcRenderer.invoke('auth:openExternal', url),
    onToken: (callback: (token: string) => void) => {
      ipcRenderer.on('auth:token', (event, token) => callback(token));
    },
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
        clear: () => Promise<void>;
      };
      auth: {
        openExternal: (url: string) => Promise<void>;
        onToken: (callback: (token: string) => void) => void;
      };
      platform: NodeJS.Platform;
      isElectron: boolean;
    };
  }
}
