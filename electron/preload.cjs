const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localAI', {
  status: () => ipcRenderer.invoke('gemini:status'),
  setKey: (value) => ipcRenderer.invoke('gemini:set-key', value),
  research: (topic) => ipcRenderer.invoke('gemini:research', { topic }),
  generate: (prompt) => ipcRenderer.invoke('gemini:generate', { prompt }),
})