import React, { createContext, useContext, useState, useCallback } from 'react';
import { RunAnywhere } from '@runanywhere/core';

// Model IDs - using officially supported models
const MODEL_IDS = {
  llm: 'smollm2-360m-instruct-q8_0',
  stt: 'sherpa-onnx-whisper-tiny.en',
  tts: 'vits-piper-en_US-lessac-medium',
} as const;

interface ModelServiceState {
  // Download state
  isLLMDownloading: boolean;
  isSTTDownloading: boolean;
  isTTSDownloading: boolean;
  
  llmDownloadProgress: number;
  sttDownloadProgress: number;
  ttsDownloadProgress: number;
  
  // Load state
  isLLMLoading: boolean;
  isSTTLoading: boolean;
  isTTSLoading: boolean;
  
  // Loaded state
  isLLMLoaded: boolean;
  isSTTLoaded: boolean;
  isTTSLoaded: boolean;
  
  isVoiceAgentReady: boolean;
  
  // Actions
  downloadAndLoadLLM: () => Promise<void>;
  downloadAndLoadSTT: () => Promise<void>;
  downloadAndLoadTTS: () => Promise<void>;
  downloadAndLoadAllModels: () => Promise<void>;
  unloadAllModels: () => Promise<void>;
}

const ModelServiceContext = createContext<ModelServiceState | null>(null);

export const useModelService = () => {
  const context = useContext(ModelServiceContext);
  if (!context) {
    throw new Error('useModelService must be used within ModelServiceProvider');
  }
  return context;
};

interface ModelServiceProviderProps {
  children: React.ReactNode;
}

export const ModelServiceProvider: React.FC<ModelServiceProviderProps> = ({ children }) => {
  // Download state
  const [isLLMDownloading, setIsLLMDownloading] = useState(false);
  const [isSTTDownloading, setIsSTTDownloading] = useState(false);
  const [isTTSDownloading, setIsTTSDownloading] = useState(false);
  
  const [llmDownloadProgress, setLLMDownloadProgress] = useState(0);
  const [sttDownloadProgress, setSTTDownloadProgress] = useState(0);
  const [ttsDownloadProgress, setTTSDownloadProgress] = useState(0);
  
  // Load state
  const [isLLMLoading, setIsLLMLoading] = useState(false);
  const [isSTTLoading, setIsSTTLoading] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  
  // Loaded state
  const [isLLMLoaded, setIsLLMLoaded] = useState(false);
  const [isSTTLoaded, setIsSTTLoaded] = useState(false);
  const [isTTSLoaded, setIsTTSLoaded] = useState(false);
  
  const isVoiceAgentReady = isLLMLoaded && isSTTLoaded && isTTSLoaded;
  
  // Check if model is downloaded
  const isModelDownloaded = useCallback(async (modelId: string): Promise<boolean> => {
    try {
      const models = await RunAnywhere.availableModels();
      const model = models.find(m => m.id === modelId);
      return !!model?.localPath;
    } catch {
      return false;
    }
  }, []);
  
  // Download and load LLM
  const downloadAndLoadLLM = useCallback(async () => {
    if (isLLMDownloading || isLLMLoading) return;
    
    try {
      const isDownloaded = await isModelDownloaded(MODEL_IDS.llm);
      
      if (!isDownloaded) {
        setIsLLMDownloading(true);
        setLLMDownloadProgress(0);
        
        // Download with progress
        await RunAnywhere.downloadModel(MODEL_IDS.llm, (progress) => {
          setLLMDownloadProgress(progress.percentage);
        });
        
        setIsLLMDownloading(false);
      }
      
      // Load the model
      setIsLLMLoading(true);
      await RunAnywhere.loadModel(MODEL_IDS.llm);
      setIsLLMLoaded(true);
      setIsLLMLoading(false);
    } catch (error) {
      console.error('LLM download/load error:', error);
      setIsLLMDownloading(false);
      setIsLLMLoading(false);
    }
  }, [isLLMDownloading, isLLMLoading, isModelDownloaded]);
  
  // Download and load STT
  const downloadAndLoadSTT = useCallback(async () => {
    if (isSTTDownloading || isSTTLoading) return;
    
    try {
      const isDownloaded = await isModelDownloaded(MODEL_IDS.stt);
      
      if (!isDownloaded) {
        setIsSTTDownloading(true);
        setSTTDownloadProgress(0);
        
        await RunAnywhere.downloadModel(MODEL_IDS.stt, (progress) => {
          setSTTDownloadProgress(progress.percentage);
        });
        
        setIsSTTDownloading(false);
      }
      
      // Load the model
      setIsSTTLoading(true);
      await RunAnywhere.loadSTTModel(MODEL_IDS.stt);
      setIsSTTLoaded(true);
      setIsSTTLoading(false);
    } catch (error) {
      console.error('STT download/load error:', error);
      setIsSTTDownloading(false);
      setIsSTTLoading(false);
    }
  }, [isSTTDownloading, isSTTLoading, isModelDownloaded]);
  
  // Download and load TTS
  const downloadAndLoadTTS = useCallback(async () => {
    if (isTTSDownloading || isTTSLoading) return;
    
    try {
      const isDownloaded = await isModelDownloaded(MODEL_IDS.tts);
      
      if (!isDownloaded) {
        setIsTTSDownloading(true);
        setTTSDownloadProgress(0);
        
        await RunAnywhere.downloadModel(MODEL_IDS.tts, (progress) => {
          setTTSDownloadProgress(progress.percentage);
        });
        
        setIsTTSDownloading(false);
      }
      
      // Load the model
      setIsTTSLoading(true);
      await RunAnywhere.loadTTSVoice(MODEL_IDS.tts);
      setIsTTSLoaded(true);
      setIsTTSLoading(false);
    } catch (error) {
      console.error('TTS download/load error:', error);
      setIsTTSDownloading(false);
      setIsTTSLoading(false);
    }
  }, [isTTSDownloading, isTTSLoading, isModelDownloaded]);
  
  // Download and load all models
  const downloadAndLoadAllModels = useCallback(async () => {
    await Promise.all([
      downloadAndLoadLLM(),
      downloadAndLoadSTT(),
      downloadAndLoadTTS(),
    ]);
  }, [downloadAndLoadLLM, downloadAndLoadSTT, downloadAndLoadTTS]);
  
  // Unload all models
  const unloadAllModels = useCallback(async () => {
    try {
      await RunAnywhere.unloadModel();
      await RunAnywhere.unloadSTTModel();
      await RunAnywhere.unloadTTSVoice();
      setIsLLMLoaded(false);
      setIsSTTLoaded(false);
      setIsTTSLoaded(false);
    } catch (error) {
      console.error('Error unloading models:', error);
    }
  }, []);
  
  const value: ModelServiceState = {
    isLLMDownloading,
    isSTTDownloading,
    isTTSDownloading,
    llmDownloadProgress,
    sttDownloadProgress,
    ttsDownloadProgress,
    isLLMLoading,
    isSTTLoading,
    isTTSLoading,
    isLLMLoaded,
    isSTTLoaded,
    isTTSLoaded,
    isVoiceAgentReady,
    downloadAndLoadLLM,
    downloadAndLoadSTT,
    downloadAndLoadTTS,
    downloadAndLoadAllModels,
    unloadAllModels,
  };
  
  return (
    <ModelServiceContext.Provider value={value}>
      {children}
    </ModelServiceContext.Provider>
  );
};

// Function to register default models
export const registerDefaultModels = async () => {
  const { LlamaCPP } = await import('@runanywhere/llamacpp');
  const { ONNX } = await import('@runanywhere/onnx');
  const { ModelCategory } = await import('@runanywhere/core');
  
  // LLM Model - SmolLM2 360M (small, fast, good for demos)
  await LlamaCPP.addModel({
    id: MODEL_IDS.llm,
    name: 'SmolLM2 360M Instruct Q8_0',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
    memoryRequirement: 400000000, // ~400MB
  });
  
  // STT Model - Whisper Tiny English (fast transcription)
  await ONNX.addModel({
    id: MODEL_IDS.stt,
    name: 'Sherpa Whisper Tiny (ONNX)',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/sherpa-onnx-whisper-tiny.en.tar.gz',
    modality: ModelCategory.SpeechRecognition,
  });
  
  // TTS Model - Piper TTS (US English - Medium quality)
  await ONNX.addModel({
    id: MODEL_IDS.tts,
    name: 'Piper TTS (US English - Medium)',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/vits-piper-en_US-lessac-medium.tar.gz',
    modality: ModelCategory.SpeechSynthesis,
  });
};
