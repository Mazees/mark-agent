import OpenAI from 'openai';
import { getAllConfig } from './db';

// Mengkonversi Float32Array PCM (hasil ScriptProcessorNode) ke format WAV
function pcmToWav(buffer, sampleRate = 16000) {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * bytesPerSample;
  const bufferArray = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufferArray);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Menulis sampel PCM ke WAV
  let offset = 44;
  for (let i = 0; i < buffer.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  // Bungkus menjadi File untuk dikirim via form-data
  return new File([new Blob([view], { type: 'audio/wav' })], 'audio.wav', { type: 'audio/wav' });
}

export const transcribeAudioGroq = async (pcmBuffer) => {
  const configs = await getAllConfig();
  const groqApiKey = configs[0]?.groqApiKey;
  
  if (!groqApiKey || groqApiKey.trim() === '') {
    throw new Error('Key API Groq belum disetel. Silakan isi di halaman Configuration.');
  }

  const client = new OpenAI({
    apiKey: groqApiKey,
    baseURL: 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true // Diizinkan karena kita memanggilnya langsung dari browser (Electron renderer)
  });

  const file = pcmToWav(pcmBuffer, 16000);

  const response = await client.audio.transcriptions.create({
    file: file,
    model: 'whisper-large-v3', // Menggunakan model standar yang lebih pintar auto-detect
    temperature: 0.0,
    prompt: 'Umm, halo? Ini percakapan asisten virtual berbahasa Indonesia. Putar lagu dangdut, nyalakan musik, coding React, open YouTube, play some music, you know what I mean.',
    response_format: 'json'
  });

  return response.text;
}
