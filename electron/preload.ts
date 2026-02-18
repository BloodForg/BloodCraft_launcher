import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bloodcraft', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
});
