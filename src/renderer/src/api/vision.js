import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
  env
} from '@huggingface/transformers';

// Hindari penggunaan local/cache error jika environment Electron
env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;

let processor = null;
let model = null;
let isInitializing = false;

export const initVisionModel = async (onProgress) => {
  if (processor && model) return { processor, model };
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 500));
    }
    return { processor, model };
  }
  
  isInitializing = true;
  try {
    const isWebGPUSupported = navigator.gpu !== undefined;
    if (!isWebGPUSupported) {
      console.warn("[Vision] WebGPU tidak didukung di perangkat ini. Vision AI (FastVLM) dilewati agar CPU tidak terbebani.");
      return { processor: null, model: null };
    }

    const model_id = "onnx-community/FastVLM-0.5B-ONNX";
    
    const options = {
      progress_callback: onProgress
    };

    processor = await AutoProcessor.from_pretrained(model_id, options);
    model = await AutoModelForImageTextToText.from_pretrained(model_id, {
      dtype: {
        embed_tokens: "fp16",
        vision_encoder: "fp16",
        decoder_model_merged: "q4f16",
      },
      device: "webgpu",
      ...options
    });
  } catch (error) {
    console.error("Gagal load vision model:", error);
  } finally {
    isInitializing = false;
  }
  
  return { processor, model };
}

/**
 * Menganalisis gambar menggunakan FastVLM
 * @param {string|Blob} imageSource - URL, Base64 Data URL, atau file Blob
 * @param {string} userPrompt - Prompt untuk model
 * @returns {Promise<string>}
 */
export const analyzeImage = async (imageSource, userPrompt = "Describe this image in detail.") => {
  try {
    const { processor, model } = await initVisionModel();
    if (!processor || !model) {
      console.warn("Vision model skipped (WebGPU tidak disupport).");
      return "";
    }

    const messages = [
      {
        role: "user",
        content: `<image>${userPrompt}`,
      },
    ];
    
    const prompt = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });

    const image = await load_image(imageSource);
    const inputs = await processor(image, prompt, {
      add_special_tokens: false,
    });

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: 512,
      do_sample: false,
    });

    const decoded = processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true },
    );
    
    return decoded[0];
  } catch (error) {
    console.error("Gagal menganalisis gambar:", error);
    return "Error: Gagal menganalisis gambar.";
  }
}
