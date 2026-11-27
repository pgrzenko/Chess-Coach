const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chessCoach', {
  analyze: position => ipcRenderer.invoke('chess-coach:analyze', position),
  recordedClip: request => ipcRenderer.invoke('chess-coach:recorded-clip', request),
  recordedHint: move => ipcRenderer.invoke('chess-coach:recorded-hint', move),
  speakHint: move => ipcRenderer.invoke('chess-coach:speak-hint', move),
  stopSpeech: () => ipcRenderer.invoke('chess-coach:stop-speech'),
  coachLion: move => ipcRenderer.invoke('chess-coach:coach-lion', move),
  stopLion: () => ipcRenderer.invoke('chess-coach:stop-lion'),
  lionVoiceSettings: () => ipcRenderer.invoke('chess-coach:lion-voice-settings'),
});
