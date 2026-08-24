import WhisperWorker from './whisperWorker.js?worker';

let worker = null;
let isDownloading = false;
let isLoaded = false;
let loadPromise = null;

const requestResolvers = new Map();
let requestIdCounter = 0;

let globalOnProgress = null;

const initWorker = () => {
  if (!worker) {
    worker = new WhisperWorker();
    worker.onmessage = (e) => {
      const { type, data, error, id, text } = e.data;
      
      if (type === 'progress') {
        if (globalOnProgress) globalOnProgress(data);
      } else if (type === 'loaded') {
        isLoaded = true;
        isDownloading = false;
        if (loadPromise) loadPromise.resolve();
      } else if (type === 'error' && !id) {
        isDownloading = false;
        if (loadPromise) loadPromise.reject(new Error(error));
      } else if (type === 'result') {
        if (requestResolvers.has(id)) {
          requestResolvers.get(id).resolve(text);
          requestResolvers.delete(id);
        }
      } else if (type === 'error' && id) {
        if (requestResolvers.has(id)) {
          requestResolvers.get(id).reject(new Error(error));
          requestResolvers.delete(id);
        }
      }
    };
  }
};

export const loadWhisper = async (onProgress) => {
  globalOnProgress = onProgress;
  
  if (isLoaded) return true;
  
  if (isDownloading && loadPromise) {
    return loadPromise.promise;
  }
  
  initWorker();
  isDownloading = true;
  
  const promise = new Promise((resolve, reject) => {
    loadPromise = { resolve, reject };
  });
  loadPromise.promise = promise;
  
  worker.postMessage({ type: 'load' });
  
  return promise;
};

export const unloadWhisper = () => {
  if (worker) {
    try {
      worker.terminate();
    } catch (e) {
      console.warn('[Whisper] Worker terminate error:', e);
    }
    worker = null;
    isLoaded = false;
    isDownloading = false;
    loadPromise = null;
    requestResolvers.clear();
    console.log('[Whisper] Local Whisper model unloaded and RAM freed.');
  }
};

export const transcribeAudioLocal = async (pcmBuffer, onProgress) => {
  if (!isLoaded) {
    await loadWhisper(onProgress);
  }
  
  initWorker();
  
  const id = ++requestIdCounter;
  const promise = new Promise((resolve, reject) => {
    requestResolvers.set(id, { resolve, reject });
  });
  
  worker.postMessage(
    { type: 'transcribe', data: { id, pcmBuffer } },
    [pcmBuffer.buffer] // Transferable object for zero-copy
  );
  
  return promise;
};
