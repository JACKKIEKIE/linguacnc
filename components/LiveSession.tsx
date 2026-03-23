import React, { useEffect, useRef, useState } from 'react';
import { connectLive, OmniRealtimeConfig } from '../services/modelService';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Define local types to avoid importing from @google/genai
interface LiveServerMessage {
  serverContent?: {
    modelTurn?: {
      parts: { inlineData: { data: string; mimeType: string } }[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

interface Blob {
  data: string;
  mimeType: string;
}

interface LiveSessionProps {
  onClose: () => void;
  initialVideoEnabled?: boolean;
}

const LiveSession: React.FC<LiveSessionProps> = ({ onClose, initialVideoEnabled = false }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'permission-denied'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [volume, setVolume] = useState(0);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideoEnabled);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSettings, setShowSettings] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  
  // Refs for Audio
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Refs for Video
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Connection
  const sessionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Load custom URL
    const savedUrl = localStorage.getItem('GEMINI_LIVE_URL');
    if (savedUrl) setCustomUrl(savedUrl);
  }, []);

  const handleSaveSettings = () => {
      if (customUrl) {
          localStorage.setItem('GEMINI_LIVE_URL', customUrl);
          // Reload to apply
          window.location.reload();
      }
      setShowSettings(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    
    // 1. Initialize Audio Contexts & AI Connection (Run Once)
    const initSession = async () => {
        try {
            setStatus('connecting');

            // Audio Contexts with mobile fallback
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error("您的浏览器不支持 Web Audio API");
            }

            inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
            outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });

            // CRITICAL FOR MOBILE: Resume contexts on user gesture
            if (inputAudioContextRef.current && inputAudioContextRef.current.state === 'suspended') {
                await inputAudioContextRef.current.resume();
            }
            if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
            }

            // Visualizer
            if (outputAudioContextRef.current) {
                analyserRef.current = outputAudioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256;
            }

            // Connect to Gemini
            const config: OmniRealtimeConfig = {
                modalities: ['AUDIO', 'TEXT'],
                voice: 'Cherry',
                inputAudioFormat: 'PCM_16000HZ_MONO_16BIT',
                outputAudioFormat: 'pcm24',
                enableTurnDetection: true,
                enableInputAudioTranscription: true,
                smooth_output: true,
                instructions: "You are a helpful AI assistant capable of seeing and hearing via camera and microphone."
            };

            sessionRef.current = await connectLive({
                onopen: () => {
                    console.log("Live Session Opened");
                    if (mountedRef.current) setStatus('connected');
                },
                onmessage: async (message: LiveServerMessage) => {
                    // Handle Audio Output
                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        try {
                            const ctx = outputAudioContextRef.current;
                            if (ctx.state === 'suspended') await ctx.resume();

                            const audioData = decode(base64Audio);
                            const audioBuffer = await decodeAudioData(audioData, ctx, 24000, 1);
                            
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            
                            if (analyserRef.current) {
                                source.connect(analyserRef.current);
                                analyserRef.current.connect(ctx.destination);
                            } else {
                                source.connect(ctx.destination);
                            }

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            
                            sourcesRef.current.add(source);
                            source.onended = () => sourcesRef.current.delete(source);

                        } catch (e) {
                            console.error("Audio Decode Error", e);
                        }
                    }

                    // Handle Interruption
                    if (message.serverContent?.interrupted) {
                        console.log("Interrupted");
                        sourcesRef.current.forEach(src => src.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (err: any) => {
                    console.error("Session Error", err);
                    if (mountedRef.current) {
                        setErrorMessage(err.message || "Connection Error");
                        setStatus('error');
                    }
                },
                onclose: () => {
                    console.log("Session Closed");
                    if (mountedRef.current) onClose();
                }
            }, config);

            animateVolume();

        } catch (e: any) {
            console.error("Init Failed", e);
            if (mountedRef.current) {
                if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                    setStatus('permission-denied');
                } else {
                    setErrorMessage(e.message || "Initialization Failed");
                    setStatus('error');
                }
            }
        }
    };

    initSession();

    return () => {
        mountedRef.current = false;
        cleanupSession();
    };
  }, []);

  // 2. Manage Local Media Stream
  useEffect(() => {
      let localStream: MediaStream | null = null;
      let audioSource: MediaStreamAudioSourceNode | null = null;
      let processor: ScriptProcessorNode | null = null;

      const setupMedia = async () => {
          try {
              // Android compatibility: Use simpler constraints first
              const constraints = {
                  audio: {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true
                  },
                  video: { 
                      facingMode: facingMode,
                      width: { ideal: 640 }, 
                      height: { ideal: 480 } 
                  }
              };

              console.log("Requesting media with constraints:", constraints);
              
              if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                  throw new Error("您的浏览器不支持媒体设备访问，或者当前环境不安全 (需 HTTPS)。");
              }

              let stream: MediaStream;
              try {
                  stream = await navigator.mediaDevices.getUserMedia(constraints);
              } catch (initialErr: any) {
                  console.warn("Failed to get audio+video, trying audio only...", initialErr);
                  try {
                      stream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
                      setIsVideoEnabled(false); // Disable video in UI since we only got audio
                  } catch (audioErr: any) {
                      throw audioErr; // Throw to outer catch block
                  }
              }
              
              localStream = stream;
              mediaStreamRef.current = stream;

              // Setup Audio Input
              if (inputAudioContextRef.current) {
                  const ctx = inputAudioContextRef.current;
                  if (ctx.state === 'suspended') await ctx.resume();

                  audioSource = ctx.createMediaStreamSource(stream);
                  processor = ctx.createScriptProcessor(4096, 1, 1);

                  processor.onaudioprocess = (e) => {
                      if (!mountedRef.current) return;
                      const inputData = e.inputBuffer.getChannelData(0);
                      const pcmBlob = createBlob(inputData);
                      
                      if (sessionRef.current && sessionRef.current.sendRealtimeInput) {
                          sessionRef.current.sendRealtimeInput({ media: pcmBlob });
                      }
                  };

                  audioSource.connect(processor);
                  processor.connect(ctx.destination);
              }

              // Setup Video Input (Always attach, just hide via CSS if needed)
              if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  // Explicit play for Android
                  videoRef.current.onloadedmetadata = () => {
                      videoRef.current?.play().catch(e => console.warn("Video play error:", e));
                  };
              }

              // Start Frame Capture Loop
              if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
              videoIntervalRef.current = setInterval(captureAndSendFrame, 1000); // 1 FPS for stability

          } catch (e: any) {
              console.error("Media Error", e);
              if (mountedRef.current) {
                   setErrorMessage(e.message || e.name);
                   if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                       setStatus('permission-denied');
                   } else {
                       setStatus('error');
                   }
              }
          }
      };

      setupMedia();

      return () => {
          // Cleanup this effect's resources
          if (localStream) {
              localStream.getTracks().forEach(track => track.stop());
          }
          if (audioSource) audioSource.disconnect();
          if (processor) {
              processor.disconnect();
              processor.onaudioprocess = null;
          }
          if (videoIntervalRef.current) {
              clearInterval(videoIntervalRef.current);
              videoIntervalRef.current = null;
          }
          if (videoRef.current) {
              videoRef.current.srcObject = null;
          }
      };
  }, [facingMode]); // Re-run when facingMode changes

  // Effect to handle video play/pause based on visibility if needed, 
  // but keeping it playing is safer for Android stream persistence.
  useEffect(() => {
      if (videoRef.current && mediaStreamRef.current) {
          // Ensure it's playing when enabled
          if (isVideoEnabled) {
             videoRef.current.play().catch(console.warn);
          }
      }
  }, [isVideoEnabled]);

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

  const cleanupSession = () => {
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
      if (sessionRef.current) {
          try { sessionRef.current.close(); } catch(e) {}
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
  };

  const captureAndSendFrame = () => {
      // Only send frame if video is enabled in UI
      if (!isVideoEnabled || !videoRef.current || !canvasRef.current || !sessionRef.current?.sendRealtimeVideo) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx && video.videoWidth > 0) {
          // Reduce resolution for stability and API limits
          canvas.width = 320; // Fixed width
          canvas.height = 240; // Fixed height
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to JPEG base64 (lower quality)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          const base64Data = dataUrl.split(',')[1];
          
          sessionRef.current.sendRealtimeVideo({ 
              image: { data: base64Data, mimeType: 'image/jpeg' } 
          });
      }
  };

  const animateVolume = () => {
      if (!mountedRef.current) return;
      
      if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const avg = sum / dataArray.length;
          setVolume(avg / 128); // Normalize 0-2 (approx)
      }
      
      animationFrameRef.current = requestAnimationFrame(animateVolume);
  };

  // --- Helpers ---

  function createBlob(data: Float32Array): Blob {
      const l = data.length;
      const int16 = new Int16Array(l);
      for (let i = 0; i < l; i++) {
        let s = Math.max(-1, Math.min(1, data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const buffer = new Uint8Array(int16.buffer);
      return {
          data: encode(buffer),
          mimeType: 'audio/pcm;rate=16000',
      };
  }

  function encode(bytes: Uint8Array) {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
  }

  function decode(base64: string) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  }

  async function decodeAudioData(
      data: Uint8Array,
      ctx: AudioContext,
      sampleRate: number,
      numChannels: number,
  ): Promise<AudioBuffer> {
      const dataInt16 = new Int16Array(data.buffer);
      const frameCount = dataInt16.length / numChannels;
      const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

      for (let channel = 0; channel < numChannels; channel++) {
          const channelData = buffer.getChannelData(channel);
          for (let i = 0; i < frameCount; i++) {
              channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
          }
      }
      return buffer;
  }

  return (
    <div 
        className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-[#0f172a] to-blue-900 flex flex-col items-center justify-between animate-fade-in text-white overflow-hidden"
        style={{ 
            paddingTop: 'calc(env(safe-area-inset-top) + 24px)', 
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
            paddingLeft: '24px',
            paddingRight: '24px'
        }}
    >
        
        {/* Hidden Canvas for Frame Capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Settings Modal */}
        {showSettings && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
                <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl">
                    <h3 className="text-lg font-medium mb-4">设置 API 地址</h3>
                    <p className="text-xs text-white/50 mb-2">如果您使用自己的转发节点，请在此输入完整 URL。</p>
                    <input 
                        type="text" 
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="wss://generativelanguage.googleapis.com"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleSaveSettings}
                            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
                        >
                            保存并重启
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="w-full flex justify-between items-center text-white/60 z-10">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'} `}></div>
                <span className="text-xs font-mono uppercase tracking-widest">QWEN-OMNI REALTIME</span>
            </div>
            <div className="flex items-center gap-3">
                {isVideoEnabled && (
                    <button 
                        onClick={toggleCamera} 
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        title="切换摄像头"
                    >
                        <i className="fa-solid fa-camera-rotate text-sm"></i>
                    </button>
                )}
                <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <i className="fa-solid fa-gear text-sm"></i>
                </button>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <i className="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>
        </div>

        {/* Main Content Area - Flexible with min-height 0 to allow shrinking */}
        <div className="flex-1 w-full flex flex-col items-center justify-center gap-4 relative min-h-0 my-4">
            
            {/* Video Preview (Always mounted for stability, toggled visibility) */}
            <div className={`relative w-full max-w-md flex-1 min-h-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/50 flex flex-col ${isVideoEnabled ? 'flex' : 'hidden'}`}>
                <video 
                    ref={videoRef} 
                    className={cn("w-full h-full object-cover", facingMode === 'user' ? "transform scale-x-[-1]" : "")} // Mirror only for front camera
                    muted 
                    playsInline
                    autoPlay
                />
                {/* Overlay Status */}
                <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-medium border border-white/10 flex items-center gap-2">
                    <i className="fa-solid fa-video text-green-400"></i> LIVE VIDEO
                </div>
            </div>

            {/* Audio Visualizer Orb (Only visible in Voice Mode) */}
            {!isVideoEnabled && (
                <div className="relative transition-all duration-500 flex-shrink-0 scale-100 h-48 flex items-center justify-center">
                    {/* Core */}
                    <div 
                        className={`w-32 h-32 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 blur-md transition-all duration-75 shadow-[0_0_100px_rgba(59,130,246,0.5)]`}
                        style={{ transform: `scale(${1 + volume * 0.8})` }}
                    ></div>
                    
                    {/* Rings */}
                    <div 
                        className="absolute inset-0 rounded-full border border-white/20 scale-150 opacity-30 animate-[spin_10s_linear_infinite]"
                    ></div>
                    <div 
                        className="absolute inset-0 rounded-full border border-blue-400/30 scale-125 opacity-50"
                        style={{ transform: `scale(${1.2 + volume * 0.4})` }}
                    ></div>

                    {/* Status Icon Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {status === 'connecting' && <i className="fa-solid fa-circle-notch fa-spin text-3xl text-white/80"></i>}
                        {(status === 'error' || status === 'permission-denied') && <i className="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i>}
                    </div>
                </div>
            )}

            {/* Status Text */}
            <div className="text-center space-y-1 z-10 flex-shrink-0">
                 <div className="text-xl font-light tracking-wide text-white/90">
                     {status === 'connecting' && "正在连接..."}
                     {status === 'connected' && (isVideoEnabled ? "视频通话中..." : "语音通话中...")}
                     {status === 'error' && "连接失败"}
                     {status === 'permission-denied' && (
                         <div className="flex flex-col items-center gap-1">
                             <span>无法访问媒体设备</span>
                             <span className="text-xs text-white/50">请允许浏览器访问麦克风和摄像头</span>
                             <span className="text-[10px] text-red-400 mt-1">{errorMessage}</span>
                         </div>
                     )}
                 </div>
                 {status === 'connected' && (
                     <p className="text-xs text-blue-200/60 font-light">Qwen-Omni 正在聆听与观看</p>
                 )}
            </div>
        </div>

        {/* Mode Switcher */}
        <div className="z-10 mb-6 flex bg-black/20 backdrop-blur-md rounded-full p-1.5 border border-white/10 shrink-0">
            <button 
                onClick={() => setIsVideoEnabled(false)}
                className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${!isVideoEnabled ? 'bg-white text-slate-900 shadow-lg' : 'text-white/70 hover:text-white'}`}
            >
                <i className="fa-solid fa-microphone"></i> 仅语音
            </button>
            <button 
                onClick={() => setIsVideoEnabled(true)}
                className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${isVideoEnabled ? 'bg-white text-slate-900 shadow-lg' : 'text-white/70 hover:text-white'}`}
            >
                <i className="fa-solid fa-video"></i> 视频通话
            </button>
        </div>

        {/* Controls Footer */}
        <div className="z-10 flex items-center gap-8 shrink-0">
            {/* Mute */}
            <button 
                className="w-14 h-14 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all backdrop-blur-sm border border-white/5"
                title="静音 (暂未实现)"
            >
                <i className="fa-solid fa-microphone-slash text-xl"></i>
            </button>

            {/* Hangup */}
            <button 
                onClick={onClose}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-500/40 hover:scale-105 transition-all active:scale-95"
            >
                <i className="fa-solid fa-phone-slash text-3xl"></i>
            </button>
            
            {/* Placeholder for balance */}
             <div className="w-14 h-14"></div>
        </div>
        
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
             <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-600 rounded-full blur-[128px]"></div>
             <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600 rounded-full blur-[128px]"></div>
        </div>
    </div>
  );
};

export default LiveSession;