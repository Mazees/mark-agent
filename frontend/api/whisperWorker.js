import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;

// Intercept fetch to fix Vite SPA fallback bug where Transformers.js 
// incorrectly tries to fetch models locally and receives index.html
const originalFetch = env.fetch || fetch;
env.fetch = async (url, init) => {
  let fetchUrl = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : url);
  
  if (typeof fetchUrl === 'string' && (!fetchUrl.startsWith('http') || fetchUrl.includes('models/onnx-community'))) {
    const parts = fetchUrl.split('onnx-community/');
    if (parts.length > 1) {
      const modelAndFileName = parts[1];
      fetchUrl = `https://huggingface.co/onnx-community/${modelAndFileName.replace('resolve/main/', '')}`;
      if (!fetchUrl.includes('resolve/main/')) {
        const pathParts = modelAndFileName.split('/');
        const modelName = pathParts[0];
        const fileName = pathParts.slice(1).join('/');
        fetchUrl = `https://huggingface.co/onnx-community/${modelName}/resolve/main/${fileName}`;
      }
      console.log('[WhisperWorker] Rewrote local fetch to:', fetchUrl);
    }
  }

  const res = await originalFetch(fetchUrl, init);
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') && typeof fetchUrl === 'string' && fetchUrl.includes('.json')) {
    throw new Error(`Gagal memuat model. Menerima HTML saat mengharapkan JSON dari: ${fetchUrl}`);
  }
  
  return res;
};

let transcriber = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'load') {
    if (!transcriber) {
      try {
        const hasWebGPU = typeof navigator !== 'undefined' && navigator.gpu;
        transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
          device: hasWebGPU ? 'webgpu' : 'wasm',
          dtype: 'fp32',
          progress_callback: (prog) => {
            self.postMessage({ type: 'progress', data: prog });
          }
        });
        self.postMessage({ type: 'loaded' });
      } catch (err) {
        console.error('[WhisperWorker] Load error:', err);
        if (err instanceof SyntaxError && err.message.includes('JSON')) {
          try {
            if (typeof caches !== 'undefined') {
              await caches.delete('transformers-cache');
              await caches.delete('experimental_transformers-hash-cache');
            }
          } catch (e) {}
        }
        self.postMessage({ type: 'error', error: err.message || String(err) });
      }
    } else {
      self.postMessage({ type: 'loaded' });
    }
  } else if (type === 'transcribe') {
    try {
      if (!transcriber) throw new Error("Model belum di-load di Worker");
      const result = await transcriber(data.pcmBuffer, {
        language: 'indonesian',
        task: 'transcribe'
      });
      self.postMessage({ type: 'result', id: data.id, text: result.text });
    } catch (err) {
      console.error('[WhisperWorker] Transcribe error:', err);
      self.postMessage({ type: 'error', id: data.id, error: err.message || String(err) });
    }
  }
};
