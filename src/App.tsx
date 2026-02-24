/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Video, 
  Upload, 
  Send, 
  Loader2, 
  History, 
  Download, 
  Trash2,
  ChevronRight,
  Play,
  Layers,
  Zap,
  AlertCircle,
  Search,
  Mic,
  Volume2,
  FileText,
  StopCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  editImage, 
  generateVideo, 
  checkVeoKey, 
  openVeoKeyDialog,
  analyzeImage,
  generateSpeech,
  transcribeAudio,
  GenerationResult 
} from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Mode = 'image-edit' | 'video-gen' | 'analyze' | 'speech' | 'transcribe';

export default function App() {
  const [mode, setMode] = useState<Mode>('image-edit');
  const [prompt, setPrompt] = useState('');
  const [uploadedImage, setUploadedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{ data: string; mimeType: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const init = async () => {
      const selected = await checkVeoKey();
      setHasKey(selected);
      fetchHistory();
    };
    init();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setRecordedAudio({ data: base64, mimeType: 'audio/webm' });
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history');
      if (response.ok) {
        const data = await response.json();
        // Map 'data' from DB to 'url' for the UI
        setResults(data.map((item: any) => ({
          id: item.id,
          type: item.type,
          url: item.data,
          prompt: item.prompt,
          text: item.text
        })));
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setResults(results.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        setUploadedImage({ data: base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt && (mode === 'video-gen' || mode === 'speech')) {
      setError(`Please enter a prompt for ${mode === 'speech' ? 'speech' : 'video'} generation.`);
      return;
    }
    if (!uploadedImage && (mode === 'image-edit' || mode === 'analyze')) {
      setError("Please upload an image.");
      return;
    }
    if (!recordedAudio && mode === 'transcribe') {
      setError("Please record some audio first.");
      return;
    }

    if (mode === 'video-gen' && !hasKey) {
      await openVeoKeyDialog();
      const selected = await checkVeoKey();
      setHasKey(selected);
      if (!selected) return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      let resultUrl: string | null = null;
      let resultText: string | undefined = undefined;
      let resultType: GenerationResult['type'] = 'image';

      if (mode === 'image-edit' && uploadedImage) {
        resultUrl = await editImage(uploadedImage.data, uploadedImage.mimeType, prompt || "Enhance this image");
        resultType = 'image';
      } else if (mode === 'video-gen') {
        resultUrl = await generateVideo(prompt, aspectRatio, uploadedImage || undefined);
        resultType = 'video';
      } else if (mode === 'analyze' && uploadedImage) {
        resultText = await analyzeImage(uploadedImage.data, uploadedImage.mimeType, prompt);
        resultUrl = `data:${uploadedImage.mimeType};base64,${uploadedImage.data}`;
        resultType = 'analysis';
      } else if (mode === 'speech') {
        resultUrl = await generateSpeech(prompt);
        resultType = 'audio';
      } else if (mode === 'transcribe' && recordedAudio) {
        resultText = await transcribeAudio(recordedAudio.data, recordedAudio.mimeType);
        resultUrl = `data:${recordedAudio.mimeType};base64,${recordedAudio.data}`;
        resultType = 'transcription';
      }

      if (resultUrl || resultText) {
        // For videos and audio, we need to convert the blob URL to base64 for persistence
        let persistentData = resultUrl || '';
        if (mode === 'video-gen' && resultUrl) {
          const blob = await fetch(resultUrl).then(r => r.blob());
          persistentData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }

        const response = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: resultType,
            data: persistentData,
            prompt: prompt || (mode === 'image-edit' ? "Image Edit" : mode === 'analyze' ? "Image Analysis" : "Generation"),
            text: resultText
          })
        });

        if (response.ok) {
          const savedItem = await response.json();
          const newResult: GenerationResult = {
            id: savedItem.id,
            type: savedItem.type,
            url: savedItem.data,
            prompt: savedItem.prompt,
            text: savedItem.text
          };
          setResults([newResult, ...results]);
          setPrompt('');
          setRecordedAudio(null);
        }
      }
    } catch (err: any) {
      if (err.message === 'API_KEY_EXPIRED') {
        setHasKey(false);
        setError("API Key expired or invalid. Please select a valid paid project key.");
      } else {
        setError("Generation failed. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-white font-sans selection:bg-orange-500/30">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-900/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Lumina Studio</h1>
          </div>
          
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: 'image-edit', label: 'Edit', icon: ImageIcon },
              { id: 'video-gen', label: 'Video', icon: Video },
              { id: 'analyze', label: 'Analyze', icon: Search },
              { id: 'speech', label: 'Speech', icon: Volume2 },
              { id: 'transcribe', label: 'Transcribe', icon: Mic },
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setMode(tab.id as Mode)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
                  mode === tab.id ? "bg-white text-black shadow-xl" : "text-white/60 hover:text-white"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="grid lg:grid-cols-[1fr,400px] gap-12">
          {/* Main Interface */}
          <section className="space-y-8">
            <div className="space-y-2">
              <motion.h2 
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-light tracking-tight"
              >
                {mode === 'image-edit' && 'Refine your vision.'}
                {mode === 'video-gen' && 'Bring it to life.'}
                {mode === 'analyze' && 'Understand deeply.'}
                {mode === 'speech' && 'Give it a voice.'}
                {mode === 'transcribe' && 'Listen and write.'}
              </motion.h2>
              <p className="text-white/40 text-lg">
                {mode === 'image-edit' && 'Transform images with natural language prompts using Nano Banana.'}
                {mode === 'video-gen' && 'Generate cinematic videos from text or animate your photos with Veo.'}
                {mode === 'analyze' && 'Analyze images and extract insights using Gemini 3.1 Pro.'}
                {mode === 'speech' && 'Convert text to high-quality speech using Gemini 2.5 Flash.'}
                {mode === 'transcribe' && 'Record audio and transcribe it instantly using Gemini 3 Flash.'}
              </p>
            </div>

            {/* Upload Area / Recording Area */}
            {mode === 'transcribe' ? (
              <div className="relative aspect-video rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-6 bg-white/[0.02] overflow-hidden group">
                <div className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500",
                  isRecording ? "bg-red-500/20 animate-pulse" : "bg-white/5 group-hover:bg-orange-500/10"
                )}>
                  <Mic className={cn("w-10 h-10", isRecording ? "text-red-500" : "text-white/40 group-hover:text-orange-500")} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">{isRecording ? "Recording..." : "Ready to record"}</p>
                  <p className="text-sm text-white/40">{isRecording ? "Click stop when finished" : "Click the button below to start"}</p>
                </div>
                
                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all",
                    isRecording ? "bg-red-500 text-white" : "bg-white text-black"
                  )}
                >
                  {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </button>

                {recordedAudio && !isRecording && (
                  <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5 text-orange-500" />
                      <span className="text-xs font-medium">Audio Recorded</span>
                    </div>
                    <button onClick={() => setRecordedAudio(null)} className="text-white/40 hover:text-white">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : mode === 'speech' ? (
              <div className="relative aspect-video rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-6 bg-white/[0.02] group">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  <Volume2 className="w-10 h-10 text-white/40 group-hover:text-orange-500 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">Text-to-Speech Engine</p>
                  <p className="text-sm text-white/40">Enter text below to generate audio</p>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative aspect-video rounded-3xl border-2 border-dashed transition-all duration-500 cursor-pointer overflow-hidden group",
                  uploadedImage ? "border-white/20" : "border-white/10 hover:border-orange-500/50 hover:bg-orange-500/[0.02]"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept="image/*"
                />
                
                {uploadedImage ? (
                  <div className="relative w-full h-full">
                    <img 
                      src={`data:${uploadedImage.mimeType};base64,${uploadedImage.data}`} 
                      alt="Uploaded" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Upload className="w-4 h-4" /> Change Image
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedImage(null);
                      }}
                      className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-red-500/80 rounded-full backdrop-blur-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      <ImageIcon className="w-8 h-8 text-white/40 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium">Drop your image here</p>
                      <p className="text-sm text-white/40">or click to browse files</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            <div className="space-y-6">
              <div className="relative">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === 'image-edit' ? "Describe the changes... (e.g., 'Add a retro filter')" : 
                    mode === 'video-gen' ? "Describe the scene... (e.g., 'A cinematic drone shot of a neon city')" :
                    mode === 'analyze' ? "What do you want to know about this image?" :
                    mode === 'speech' ? "Enter text to convert to speech..." :
                    "Optional context for transcription..."
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 pt-8 text-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all min-h-[120px] resize-none placeholder:text-white/20"
                />
                <div className="absolute top-4 left-6 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/30">
                  <Zap className="w-3 h-3" /> Prompt Engine
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {mode === 'video-gen' && (
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                      <button 
                        onClick={() => setAspectRatio('16:9')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          aspectRatio === '16:9' ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                        )}
                      >
                        16:9
                      </button>
                      <button 
                        onClick={() => setAspectRatio('9:16')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          aspectRatio === '9:16' ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                        )}
                      >
                        9:16
                      </button>
                    </div>
                  )}
                  
                  {mode === 'video-gen' && !hasKey && (
                    <button 
                      onClick={openVeoKeyDialog}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 text-orange-500 text-xs font-bold border border-orange-500/20 hover:bg-orange-500/20 transition-all"
                    >
                      <AlertCircle className="w-4 h-4" /> Setup API Key
                    </button>
                  )}
                </div>

                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={cn(
                    "relative group px-8 py-4 rounded-2xl font-semibold flex items-center gap-3 transition-all duration-500 overflow-hidden",
                    isGenerating 
                      ? "bg-white/10 text-white/40 cursor-not-allowed" 
                      : "bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_rgba(255,255,255,0.1)]"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      <span>{
                        mode === 'image-edit' ? 'Apply Changes' : 
                        mode === 'video-gen' ? 'Generate Cinematic' :
                        mode === 'analyze' ? 'Analyze Image' :
                        mode === 'speech' ? 'Generate Speech' :
                        'Transcribe Audio'
                      }</span>
                    </>
                  )}
                </button>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </div>
          </section>

          {/* Sidebar / History */}
          <aside className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                <History className="w-4 h-4" /> Recent Creations
              </h3>
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded-md border border-white/10 text-white/40">
                {results.length} items
              </span>
            </div>

            <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {results.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center space-y-4 border border-white/5 rounded-3xl bg-white/[0.02]"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <Layers className="w-6 h-6 text-white/20" />
                    </div>
                    <p className="text-sm text-white/20 px-8">Your creative history will appear here.</p>
                  </motion.div>
                ) : (
                  results.map((result, idx) => (
                    <motion.div 
                      key={result.id || idx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 hover:border-white/30 transition-all"
                    >
                      <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button 
                          onClick={() => setPrompt(result.prompt)}
                          title="Load Prompt"
                          className="p-1.5 rounded-lg bg-black/60 hover:bg-orange-500/80 backdrop-blur-md transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => result.id && deleteHistoryItem(result.id)}
                          title="Delete"
                          className="p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 backdrop-blur-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {result.type === 'image' || result.type === 'analysis' ? (
                        <img src={result.url} alt={result.prompt} className="w-full aspect-video object-cover" />
                      ) : result.type === 'video' ? (
                        <div className="relative aspect-video">
                          <video src={result.url} className="w-full h-full object-cover" controls />
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Play className="w-2 h-2 fill-current" /> Video
                          </div>
                        </div>
                      ) : (
                        <div className="relative aspect-video bg-white/5 flex items-center justify-center">
                          <audio src={result.url} controls className="w-[80%]" />
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Volume2 className="w-2 h-2" /> Audio
                          </div>
                        </div>
                      )}
                      
                      <div className="p-4 space-y-2">
                        <p className="text-xs text-white/60 line-clamp-2 font-medium leading-relaxed">
                          {result.prompt}
                        </p>
                        {result.text && (
                          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/50 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                            {result.text}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <span className="text-[10px] text-white/20 flex items-center gap-1">
                            {result.type === 'image' && <ImageIcon className="w-3 h-3" />}
                            {result.type === 'video' && <Video className="w-3 h-3" />}
                            {result.type === 'analysis' && <Search className="w-3 h-3" />}
                            {result.type === 'audio' && <Volume2 className="w-3 h-3" />}
                            {result.type === 'transcription' && <Mic className="w-3 h-3" />}
                            {result.type === 'image' ? 'Nano Banana' : 
                             result.type === 'video' ? 'Veo Engine' :
                             result.type === 'analysis' ? 'Gemini 3.1 Pro' :
                             result.type === 'audio' ? 'Gemini 2.5 Flash' :
                             'Gemini 3 Flash'}
                          </span>
                          <a 
                            href={result.url} 
                            download={`lumina-${idx}.${result.type === 'image' ? 'png' : 'mp4'}`}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </aside>
        </main>
      </div>

      {/* Footer */}
      <footer className="mt-24 border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-40">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium tracking-tight">Lumina Studio &copy; 2026</span>
          </div>
          <div className="flex gap-8 text-sm text-white/30">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">API Status</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
