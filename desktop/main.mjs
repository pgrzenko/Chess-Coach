import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { speak, stopSpeech } from './speech.mjs';
import { createStockfish, defaultEnginePath } from './stockfish.mjs';
import { createLionLesson } from './lion-lesson.mjs';
import { readOpenAIKey } from './openai-env.mjs';
import { readRecordedClip, readSparringClips } from './recorded-clips.mjs';
import { sparringHintSpeech } from './speech-normalizer.mjs';

const index = path.join(import.meta.dirname, '..', 'dist', 'index.html');
const indexUrl = pathToFileURL(index).href;
const stockfish = createStockfish(defaultEnginePath);
let lion;
app.on('before-quit', () => {
  stopSpeech();
  lion?.stop();
  stockfish.close();
});
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  const envKey = readOpenAIKey(path.join(import.meta.dirname, '..', '.env'));
  lion = createLionLesson({ stockfish, readKey: () => envKey, recordedClip: readRecordedClip });
  const window = new BrowserWindow({
    show: false,
    width: 1190,
    height: 900,
    minWidth: 520,
    minHeight: 560,
    backgroundColor: '#161c1b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  function isAppFrame(event) {
    return event.sender === window.webContents && event.senderFrame?.url === indexUrl &&
      event.senderFrame === event.sender.mainFrame;
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('chess-coach:analyze', (event, position) => {
    return isAppFrame(event) ? stockfish.analyze(position) : { status: 'unavailable' };
  });
  ipcMain.handle('chess-coach:recorded-clip', (event, request) => {
    if (!isAppFrame(event)) return null;
    const bytes = readRecordedClip(request);
    if (bytes) stopSpeech();
    return bytes;
  });
  ipcMain.handle('chess-coach:recorded-hint', (event, move) => {
    return isAppFrame(event) ? readSparringClips(move) : null;
  });
  ipcMain.handle('chess-coach:speak-hint', (event, move) => {
    if (!isAppFrame(event)) return false;
    const text = sparringHintSpeech(move);
    return text ? speak(text) : false;
  });
  ipcMain.handle('chess-coach:stop-speech', event => {
    if (isAppFrame(event)) stopSpeech();
  });

  ipcMain.handle('chess-coach:coach-lion', (event, move) => {
    if (!isAppFrame(event)) return { status: 'unavailable' };
    stopSpeech();
    return lion.attempt(move);
  });
  ipcMain.handle('chess-coach:stop-lion', event => {
    if (isAppFrame(event)) lion.stop();
  });
  ipcMain.handle('chess-coach:lion-voice-settings', event => ({
    envConfigured: isAppFrame(event) && Boolean(envKey),
  }));
  window.webContents.on('render-process-gone', () => lion.stop());

  await window.loadFile(index);
  window.show();
  window.maximize();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
