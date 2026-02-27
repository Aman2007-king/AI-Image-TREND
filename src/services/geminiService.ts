import { GoogleGenAI, Modality, Type } from "@google/genai";

export interface GenerationResult {
  id?: number;
  type: 'image' | 'video' | 'analysis' | 'audio' | 'transcription' | 'research' | 'summary';
  url: string;
  prompt: string;
  text?: string;
  sources?: { title: string; uri: string }[];
}

export const checkVeoKey = async (): Promise<boolean> => {
  if (typeof window.aistudio === 'undefined') return true; // Fallback for non-AI Studio environments
  return await window.aistudio.hasSelectedApiKey();
};

export const openVeoKeyDialog = async (): Promise<void> => {
  if (typeof window.aistudio !== 'undefined') {
    await window.aistudio.openSelectKey();
  }
};

const getApiKey = (): string => {
  const savedKey = localStorage.getItem('lumina_api_key');
  if (savedKey) return savedKey;
  return process.env.API_KEY || process.env.GEMINI_API_KEY || '';
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ text: prompt }],
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

export const researchWithSearch = async (prompt: string): Promise<{ text: string; sources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || "Source",
      uri: chunk.web?.uri
    })).filter((s: any) => s.uri) || [];

    return {
      text: response.text || "No research results.",
      sources
    };
  } catch (error) {
    console.error("Error in research:", error);
    throw error;
  }
};

export const summarizeUrl = async (url: string, prompt?: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `${prompt || "Summarize the content of this URL:"} ${url}`,
      config: {
        tools: [{ urlContext: {} }]
      },
    });
    return response.text || "Failed to summarize URL.";
  } catch (error) {
    console.error("Error summarizing URL:", error);
    throw error;
  }
};

export const analyzeImage = async (base64Image: string, mimeType: string, prompt: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt || "Analyze this image in detail." }
        ]
      }
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return `data:audio/wav;base64,${base64Audio}`;
    }
    return null;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Audio, mimeType } },
          { text: "Transcribe this audio accurately." }
        ]
      }
    });
    return response.text || "No transcription generated.";
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw error;
  }
};

export const editImage = async (base64Image: string, mimeType: string, prompt: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

export const upscaleImage = async (base64Image: string, mimeType: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: "Upscale and enhance this image. Increase resolution, sharpen details, and improve overall clarity while maintaining the original composition." }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error upscaling image:", error);
    throw error;
  }
};

export const generateVideo = async (
  prompt: string, 
  aspectRatio: '16:9' | '9:16' = '16:9',
  image?: { data: string; mimeType: string }
): Promise<string | null> => {
  // Always create a new instance to get the latest API key
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey: apiKey });

  try {
    const config: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio,
      },
    };

    if (image) {
      config.image = {
        imageBytes: image.data,
        mimeType: image.mimeType,
      };
    }

    let operation = await ai.models.generateVideos(config);

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;

    // Fetch the video with the API key header
    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey || '',
      },
    });

    if (!response.ok) throw new Error('Failed to download video');
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error("Error generating video:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_EXPIRED");
    }
    throw error;
  }
};
