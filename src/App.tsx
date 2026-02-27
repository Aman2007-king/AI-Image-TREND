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
  StopCircle,
  Globe,
  Link as LinkIcon,
  ExternalLink,
  Wand2,
  BookOpen,
  FileSearch,
  Copy,
  Check,
  Settings,
  Info,
  X,
  Key
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
  generateImage,
  researchWithSearch,
  summarizeUrl,
  upscaleImage,
  GenerationResult 
} from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Mode = 'image-edit' | 'video-gen' | 'analyze' | 'speech' | 'transcribe' | 'generate-image' | 'research' | 'summarize';

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
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('lumina_api_key') || '');
  const [showTooltip, setShowTooltip] = useState(false);
  
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
          text: item.text,
          sources: item.sources ? JSON.parse(item.sources) : undefined
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

  const clearHistory = async () => {
    if (!confirm("Are you sure you want to clear all history?")) return;
    try {
      // Assuming we might want a bulk delete or just loop
      for (const item of results) {
        if (item.id) await fetch(`/api/history/${item.id}`, { method: 'DELETE' });
      }
      setResults([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const handleUpscale = async (result: GenerationResult) => {
    if (result.type !== 'image' && result.type !== 'analysis') return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Extract base64 from data URL
      const base64 = result.url.split(',')[1];
      const mimeType = result.url.split(';')[0].split(':')[1];
      
      const upscaledUrl = await upscaleImage(base64, mimeType);
      
      if (upscaledUrl) {
        const response = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'image',
            data: upscaledUrl,
            prompt: `Upscaled: ${result.prompt}`,
            text: "Image upscaled and enhanced for better clarity."
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
        }
      }
    } catch (err) {
      console.error("Upscale failed:", err);
      setError("Upscaling failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('lumina_api_key', key);
    setShowSettings(false);
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
    if (!prompt && (mode === 'video-gen' || mode === 'speech' || mode === 'generate-image' || mode === 'research' || mode === 'summarize')) {
      setError(`Please enter a prompt or URL for ${mode} generation.`);
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
      let resultSources: any[] | undefined = undefined;
      let resultType: GenerationResult['type'] = 'image';

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API Key is missing. Please configure it in the Secrets panel.");
      }

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
      } else if (mode === 'generate-image') {
        resultUrl = await generateImage(prompt);
        resultType = 'image';
      } else if (mode === 'research') {
        const research = await researchWithSearch(prompt);
        resultText = research.text;
        resultSources = research.sources;
        resultType = 'research';
        resultUrl = ''; // No primary asset for research
      } else if (mode === 'summarize') {
        resultText = await summarizeUrl(prompt);
        resultType = 'summary';
        resultUrl = ''; // No primary asset for summary
      }

      if (resultUrl === null && !resultText) {
        throw new Error("The AI model returned no content. Please try a different prompt or check your connection.");
      }

      if (resultUrl !== null || resultText) {
        // For videos and audio, we need to convert the blob URL to base64 for persistence
        let persistentData = resultUrl || '';
        if (mode === 'video-gen' && resultUrl && resultUrl.startsWith('blob:')) {
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
            text: resultText,
            sources: resultSources
          })
        });

        if (response.ok) {
          const savedItem = await response.json();
          const newResult: GenerationResult = {
            id: savedItem.id,
            type: savedItem.type,
            url: savedItem.data,
            prompt: savedItem.prompt,
            text: savedItem.text,
            sources: savedItem.sources
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
    <div className="min-h-screen bg-[#0a0502] text-white font-sans selection:bg-orange-500/30 flex">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-900/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
      </div>

      {/* Vertical Sidebar Navigation */}
      <aside className="relative z-20 w-20 lg:w-64 h-screen sticky top-0 bg-black/40 backdrop-blur-3xl border-r border-white/10 flex flex-col py-8 px-4 gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight hidden lg:block">Lumina</h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar">
          {[
            { id: 'image-edit', label: 'Edit Image', icon: ImageIcon, desc: 'Refine visuals' },
            { id: 'generate-image', label: 'Create Image', icon: Wand2, desc: 'AI generation' },
            { id: 'video-gen', label: 'Video Gen', icon: Video, desc: 'Cinematic Veo' },
            { id: 'analyze', label: 'Analyze', icon: Search, desc: 'Deep insights' },
            { id: 'research', label: 'Research', icon: Globe, desc: 'Web grounding' },
            { id: 'summarize', label: 'Summarize', icon: BookOpen, desc: 'URL context' },
            { id: 'speech', label: 'Speech', icon: Volume2, desc: 'TTS Engine' },
            { id: 'transcribe', label: 'Transcribe', icon: Mic, desc: 'Audio to text' },
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setMode(tab.id as Mode)}
              className={cn(
                "w-full p-3 rounded-2xl transition-all duration-300 flex items-center gap-4 group relative",
                mode === tab.id 
                  ? "bg-white text-black shadow-xl" 
                  : "text-white/40 hover:text-white hover:bg-white/5"
              )}
            >
              <tab.icon className={cn("w-6 h-6 shrink-0", mode === tab.id ? "text-black" : "group-hover:text-orange-500 transition-colors")} />
              <div className="hidden lg:flex flex-col items-start text-left">
                <span className="text-sm font-bold">{tab.label}</span>
                <span className={cn("text-[10px] font-medium opacity-60", mode === tab.id ? "text-black/60" : "text-white/40")}>{tab.desc}</span>
              </div>
              {mode === tab.id && (
                <motion.div 
                  layoutId="active-pill"
                  className="absolute left-0 w-1 h-6 bg-orange-500 rounded-r-full"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="pt-8 border-t border-white/5 flex flex-col gap-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-4 group"
          >
            <Settings className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
            <span className="text-sm font-medium hidden lg:block">Settings</span>
          </button>
          
          <div className="hidden lg:block">
            {(!process.env.GEMINI_API_KEY && !userApiKey) ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider">
                <AlertCircle className="w-3 h-3" /> Key Missing
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <Check className="w-3 h-3" /> API Ready
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 h-screen overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
          {/* Header (Simplified) */}
          <header className="flex justify-between items-center mb-16 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Lumina</h1>
            </div>
          </header>

          <main className="grid xl:grid-cols-[1fr,400px] gap-12">
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
                {mode === 'generate-image' && 'Create from scratch.'}
                {mode === 'video-gen' && 'Bring it to life.'}
                {mode === 'analyze' && 'Understand deeply.'}
                {mode === 'research' && 'Explore the web.'}
                {mode === 'summarize' && 'Distill the noise.'}
                {mode === 'speech' && 'Give it a voice.'}
                {mode === 'transcribe' && 'Listen and write.'}
              </motion.h2>
              <p className="text-white/40 text-lg">
                {mode === 'image-edit' && 'Transform images with natural language prompts using Nano Banana.'}
                {mode === 'generate-image' && 'Generate stunning visuals from pure imagination.'}
                {mode === 'video-gen' && 'Generate cinematic videos from text or animate your photos with Veo.'}
                {mode === 'analyze' && 'Analyze images and extract insights using Gemini 3.1 Pro.'}
                {mode === 'research' && 'Real-time research with Google Search grounding.'}
                {mode === 'summarize' && 'Summarize any URL or document instantly.'}
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
            ) : mode === 'speech' || mode === 'generate-image' || mode === 'research' || mode === 'summarize' ? (
              <div className="relative aspect-video rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-6 bg-white/[0.02] group">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  {mode === 'speech' && <Volume2 className="w-10 h-10 text-white/40 group-hover:text-orange-500 transition-colors" />}
                  {mode === 'generate-image' && <Wand2 className="w-10 h-10 text-white/40 group-hover:text-orange-500 transition-colors" />}
                  {mode === 'research' && <Globe className="w-10 h-10 text-white/40 group-hover:text-orange-500 transition-colors" />}
                  {mode === 'summarize' && <BookOpen className="w-10 h-10 text-white/40 group-hover:text-orange-500 transition-colors" />}
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">
                    {mode === 'speech' && 'Text-to-Speech Engine'}
                    {mode === 'generate-image' && 'Image Generation Engine'}
                    {mode === 'research' && 'Research & Search Engine'}
                    {mode === 'summarize' && 'URL Summarization Engine'}
                  </p>
                  <p className="text-sm text-white/40">
                    {mode === 'summarize' ? 'Enter a URL below to distill its content' : 'Enter a prompt below to begin'}
                  </p>
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
                    mode === 'generate-image' ? "Describe the image you want to create..." :
                    mode === 'research' ? "What would you like to research? (e.g., 'Latest trends in AI')" :
                    mode === 'summarize' ? "Enter a URL to summarize (e.g., https://example.com)" :
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
                    <div className="relative flex items-center gap-2">
                      <button 
                        onClick={openVeoKeyDialog}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 text-orange-500 text-xs font-bold border border-orange-500/20 hover:bg-orange-500/20 transition-all"
                      >
                        <AlertCircle className="w-4 h-4" /> Setup API Key
                      </button>
                      <div className="relative group">
                        <Info 
                          className="w-4 h-4 text-white/20 cursor-help hover:text-white/40 transition-colors"
                          onMouseEnter={() => setShowTooltip(true)}
                          onMouseLeave={() => setShowTooltip(false)}
                        />
                        <AnimatePresence>
                          {showTooltip && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 10 }}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-black/90 backdrop-blur-xl border border-white/10 text-[10px] leading-relaxed text-white/60 z-50 shadow-2xl"
                            >
                              <p className="font-bold text-white mb-1">Why do I need this?</p>
                              Veo video generation requires a paid Google Cloud project API key. This ensures high-quality, cinematic output and dedicated processing power for your creations.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black/90" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
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
                        mode === 'generate-image' ? 'Create Image' :
                        mode === 'research' ? 'Start Research' :
                        mode === 'summarize' ? 'Summarize URL' :
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchHistory}
                  className="text-[10px] text-white/20 hover:text-white transition-colors flex items-center gap-1"
                  title="Reload History"
                >
                  <History className="w-3 h-3" /> Reload
                </button>
                <button 
                  onClick={clearHistory}
                  className="text-[10px] text-white/20 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
                <span className="text-[10px] bg-white/5 px-2 py-1 rounded-md border border-white/10 text-white/40">
                  {results.length} items
                </span>
              </div>
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
                        {(result.type === 'image' || result.type === 'analysis') && (
                          <button 
                            onClick={() => handleUpscale(result)}
                            title="Upscale & Enhance"
                            className="p-1.5 rounded-lg bg-black/60 hover:bg-emerald-500/80 backdrop-blur-md transition-colors"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                      ) : result.type === 'audio' || result.type === 'transcription' ? (
                        <div className="relative aspect-video bg-white/5 flex items-center justify-center">
                          <audio src={result.url} controls className="w-[80%]" />
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Volume2 className="w-2 h-2" /> Audio
                          </div>
                        </div>
                      ) : (
                        <div className="relative aspect-video bg-white/5 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 opacity-20">
                            {result.type === 'research' ? <Globe className="w-12 h-12" /> : <FileText className="w-12 h-12" />}
                            <span className="text-[10px] uppercase tracking-widest font-bold">Document</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="p-4 space-y-2">
                        <p className="text-xs text-white/60 line-clamp-2 font-medium leading-relaxed">
                          {result.prompt}
                        </p>
                        {result.text && (
                          <div className="relative group/text">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/50 leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                              {result.text}
                            </div>
                            <button 
                              onClick={() => copyToClipboard(result.text!)}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 opacity-0 group-hover/text:opacity-100 hover:bg-white/10 transition-all"
                              title="Copy Text"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {result.sources && result.sources.length > 0 && (
                          <div className="space-y-1 pt-2">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-white/20">Sources</p>
                            <div className="flex flex-wrap gap-1">
                              {result.sources.map((source, sIdx) => (
                                <a 
                                  key={sIdx} 
                                  href={source.uri} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-orange-500/60 hover:text-orange-500 flex items-center gap-1 bg-orange-500/5 px-2 py-0.5 rounded-md border border-orange-500/10 transition-all"
                                >
                                  <LinkIcon className="w-2.5 h-2.5" />
                                  {source.title.length > 15 ? source.title.substring(0, 15) + '...' : source.title}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <span className="text-[10px] text-white/20 flex items-center gap-1">
                            {result.type === 'image' && <ImageIcon className="w-3 h-3" />}
                            {result.type === 'video' && <Video className="w-3 h-3" />}
                            {result.type === 'analysis' && <Search className="w-3 h-3" />}
                            {result.type === 'audio' && <Volume2 className="w-3 h-3" />}
                            {result.type === 'transcription' && <Mic className="w-3 h-3" />}
                            {result.type === 'research' && <Globe className="w-3 h-3" />}
                            {result.type === 'summary' && <BookOpen className="w-3 h-3" />}
                            {result.type === 'image' ? 'Nano Banana' : 
                             result.type === 'video' ? 'Veo Engine' :
                             result.type === 'analysis' ? 'Gemini 3.1 Pro' :
                             result.type === 'audio' ? 'Gemini 2.5 Flash' :
                             result.type === 'research' ? 'Search Grounding' :
                             result.type === 'summary' ? 'URL Context' :
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

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-[#151619] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-blue-500" />
              
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>

              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">API Configuration</h3>
                    <p className="text-xs text-white/40">Manage your creative credentials</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-white/30">Gemini API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={userApiKey}
                        onChange={(e) => setUserApiKey(e.target.value)}
                        placeholder="Paste your API key here..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-white/20 leading-relaxed">
                      Your key is stored locally in your browser and used for all AI features. Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Google AI Studio</a>.
                    </p>
                  </div>

                  <button 
                    onClick={() => saveApiKey(userApiKey)}
                    className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Save Configuration
                  </button>

                  <button 
                    onClick={() => {
                      localStorage.removeItem('lumina_api_key');
                      setUserApiKey('');
                      setShowSettings(false);
                    }}
                    className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-medium text-sm hover:bg-white/10 transition-all"
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  );
}
