
import React, { useState, useRef, useEffect } from 'react';
import { Attachment } from '../services/modelService';
import { AppMode, ModelOption, CNCOutput, ChatMessage, MachineOperationType } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface ChatPanelProps {
  onSendMessage: (text: string, attachment: Attachment | null, model: ModelOption, mode: AppMode) => void;
  onStop: () => void;
  onDeleteOperation?: (index: number) => void;
  onReset?: () => void;
  onStartLiveSession?: (videoEnabled: boolean) => void;
  isProcessing: boolean;
  messages: ChatMessage[];
}

const MODEL_LABELS: Record<string, string> = {
    'auto': '智能选择 (Auto)',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'qwen-max': 'Qwen Max',
    'qwen-plus': 'Qwen Plus',
    'qwen-turbo': 'Qwen Turbo',
    'qwen3.5-plus': 'Qwen 3.5 Plus',
    'qwen3.5-flash': 'Qwen 3.5 Flash',
    'mimo-v2-flash': 'MiMo v2'
};

const ChatPanel: React.FC<ChatPanelProps> = ({ onSendMessage, onStop, onDeleteOperation, onReset, onStartLiveSession, isProcessing, messages }) => {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('GENERATE');
  const [model, setModel] = useState<ModelOption>('auto');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isProcessing]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Optimized resizing logic: only grow when needed, reset to 1 row when empty
  useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
          textarea.style.height = 'auto'; // Reset
          if (inputText) {
            textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
          } else {
            textarea.style.height = '24px'; // Default single line height
          }
      }
  }, [inputText]);

  const handleSend = () => {
    if ((!inputText.trim() && !attachment) || isProcessing) return;
    onSendMessage(inputText, attachment, model, mode);
    setInputText('');
    setAttachment(null);
    setFileName(null);
  };

  const handleDemo = () => {
      const demoText = mode === 'SCREEN' 
        ? "创建一个包含“循环时间”和“零件计数”变量的界面，并添加一个“重置”按钮。" 
        : "帮我在 100x100 的铝板中心铣一个直径 50 的圆槽，深度 5mm。";
      setInputText(demoText);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = () => setAttachment({ data: (reader.result as string).split(',')[1], mimeType: file.type, fileName: file.name });
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
            const utf8Bytes = new TextEncoder().encode(reader.result as string);
            setAttachment({ data: btoa(String.fromCodePoint(...utf8Bytes)), mimeType: 'text/plain', fileName: file.name });
        };
        reader.readAsText(file);
      }
    }
  };

  const lastOpMsgIndex = messages.map(m => !!(m.cncResult?.operations?.length && m.cncResult.operations[0].type !== MachineOperationType.GENERAL_CHAT)).lastIndexOf(true);

  return (
    <div className="flex flex-col h-full bg-transparent relative min-h-0">
      
      {/* 1. Header: Increased top padding for safe area / status bar */}
      <div className="px-4 pb-3 pt-[calc(env(safe-area-inset-top)+2rem)] lg:pt-4 bg-white/40 backdrop-blur-3xl border-b border-white/50 z-10 shrink-0 flex flex-col gap-3 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.05)]">
        
        {/* Top Row: Model & Actions */}
        <div className="flex justify-between items-center relative z-50">
            {/* Custom Model Selector */}
            <div className="relative" ref={modelDropdownRef}>
                <button
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    className="bg-white/80 hover:bg-white text-slate-800 text-sm font-semibold py-2 pl-4 pr-10 rounded-2xl flex items-center w-[180px] relative transition-all active:scale-95 border border-slate-200/50 shadow-sm"
                >
                    <span className="truncate">{MODEL_LABELS[model] || model}</span>
                    <i className={`fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 transition-transform duration-300 ${isModelDropdownOpen ? 'rotate-180' : ''}`}></i>
                </button>

                <AnimatePresence>
                    {isModelDropdownOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} // Apple-like easing
                            className="absolute top-full left-0 mt-2 w-[200px] bg-white rounded-2xl shadow-xl shadow-blue-900/10 border border-slate-100 overflow-hidden"
                        >
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-1">
                                {/* Auto Group */}
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 flex items-center gap-1">
                                    <i className="fa-solid fa-wand-magic-sparkles text-slate-300"></i> 智能 (Smart)
                                </div>
                                <button onClick={() => { setModel('auto'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>智能选择 (Auto)</span>
                                    {model === 'auto' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>

                                {/* Gemini Group */}
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 flex items-center gap-1 border-t border-slate-50 mt-1">
                                    <i className="fa-solid fa-star text-blue-400"></i> Google Gemini
                                </div>
                                <button onClick={() => { setModel('gemini-2.5-flash'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Gemini 2.5 Flash <span className="text-[9px] text-slate-400 font-normal ml-1">最新</span></span>
                                    {model === 'gemini-2.5-flash' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                                <button onClick={() => { setModel('gemini-2.0-flash'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Gemini 2.0 Flash <span className="text-[9px] text-slate-400 font-normal ml-1">稳定</span></span>
                                    {model === 'gemini-2.0-flash' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>

                                {/* Aliyun Group */}
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 flex items-center gap-1 border-t border-slate-50 mt-1">
                                    <i className="fa-brands fa-alipay text-slate-300"></i> 阿里云 (Aliyun)
                                </div>
                                <button onClick={() => { setModel('qwen-max'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Qwen Max <span className="text-[9px] text-slate-400 font-normal ml-1">旗舰</span></span>
                                    {model === 'qwen-max' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                                <button onClick={() => { setModel('qwen-plus'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Qwen Plus <span className="text-[9px] text-slate-400 font-normal ml-1">均衡</span></span>
                                    {model === 'qwen-plus' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                                <button onClick={() => { setModel('qwen-turbo'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Qwen Turbo <span className="text-[9px] text-slate-400 font-normal ml-1">极速</span></span>
                                    {model === 'qwen-turbo' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                                <button onClick={() => { setModel('qwen3.5-plus'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Qwen 3.5 Plus <span className="text-[9px] text-slate-400 font-normal ml-1">最新</span></span>
                                    {model === 'qwen3.5-plus' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                                <button onClick={() => { setModel('qwen3.5-flash'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>Qwen 3.5 Flash <span className="text-[9px] text-slate-400 font-normal ml-1">极速</span></span>
                                    {model === 'qwen3.5-flash' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>

                                {/* Xiaomi Group */}
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-t border-slate-50 flex items-center gap-1 mt-1">
                                    <span className="w-3 h-3 bg-orange-500 rounded-sm flex items-center justify-center text-[8px] text-white font-serif">mi</span> 小米 (Xiaomi)
                                </div>
                                <button onClick={() => { setModel('mimo-v2-flash'); setIsModelDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex justify-between items-center group">
                                    <span>MiMo v2</span>
                                    {model === 'mimo-v2-flash' && <motion.i initial={{scale:0}} animate={{scale:1}} className="fa-solid fa-check text-blue-500 text-[10px]"></motion.i>}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Actions Group */}
            <div className="flex items-center gap-2">
                {/* Live Session Button */}
                {onStartLiveSession && (
                    <button 
                        onClick={() => onStartLiveSession(false)}
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30 flex items-center justify-center transition-all active:scale-95"
                        title="开启实时语音"
                    >
                        <i className="fa-solid fa-microphone text-xs"></i>
                    </button>
                )}

                {/* New Chat Button */}
                {onReset && (
                    <button 
                        onClick={onReset}
                        className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors active:scale-95"
                        title="新对话"
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                    </button>
                )}
            </div>
        </div>
        
        {/* Bottom Row: Mode Toggles (Compact) */}
        <div className="bg-white/40 p-1 rounded-xl flex relative border border-white/50 shadow-sm backdrop-blur-md">
            {['GENERATE', 'OPTIMIZE', 'OMNI', 'SCREEN'].map(m => (
                <button 
                    key={m} 
                    onClick={() => setMode(m as AppMode)} 
                    className={cn(
                        "flex-1 py-1.5 text-xs font-semibold transition-all duration-300 rounded-lg relative z-10",
                        mode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
                    )}
                >
                    {m === 'GENERATE' ? '生成' : m === 'OPTIMIZE' ? '优化' : m === 'OMNI' ? '全能' : '界面'}
                </button>
            ))}
        </div>
      </div>

      {/* 2. Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-transparent min-h-0">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-90">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-[2rem] shadow-xl shadow-blue-500/20 flex items-center justify-center mb-6 border border-white/20">
                    <i className="fa-solid fa-microchip text-5xl text-white drop-shadow-md"></i>
                </div>
                <p className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">AI CNC Copilot</p>
                <p className="text-sm font-medium mb-8 text-slate-500 bg-white/40 px-4 py-1.5 rounded-full border border-white/50 shadow-sm backdrop-blur-md">基于阿里云与小米大模型</p>
                <button onClick={handleDemo} className="px-8 py-3.5 bg-white/80 backdrop-blur-xl shadow-sm border border-white/50 rounded-full text-[15px] text-blue-600 font-bold active:scale-95 transition-all hover:bg-white hover:shadow-md hover:-translate-y-0.5">
                    试一试 Demo
                </button>
            </div>
        )}
        
        {messages.map((msg, msgIndex) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[85%] lg:max-w-[80%] rounded-3xl px-5 py-3.5 shadow-sm ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-sm shadow-blue-500/20' : 'bg-white/70 backdrop-blur-2xl text-slate-800 border border-white/50 rounded-bl-sm shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)]'}`}>
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                    {msg.attachment && <div className="mt-2 text-xs opacity-80 flex items-center gap-1.5 bg-black/10 px-2.5 py-1.5 rounded-lg w-fit"><i className="fa-solid fa-paperclip"></i> {msg.role === 'user' ? '已上传附件' : '附件'}</div>}

                    {msg.role === 'ai' && msg.cncResult && msg.cncResult.operations.length > 0 && msg.cncResult.operations[0].type !== MachineOperationType.GENERAL_CHAT && (
                        <div className="mt-4 pt-3 border-t border-slate-200/50 space-y-2">
                            {msg.cncResult.operations.map((op, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100 relative group shadow-sm">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-800">{op.type}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">Z: {op.z_depth} | D{op.tool_diameter}</div>
                                    </div>
                                    {onDeleteOperation && msgIndex === lastOpMsgIndex && (
                                        <button onClick={(e) => { e.preventDefault(); onDeleteOperation(idx); }} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors active:scale-95 absolute right-2 top-1/2 -translate-y-1/2">
                                            <i className="fa-solid fa-trash-can text-sm"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        ))}
        {isProcessing && (
            <div className="flex justify-start animate-fade-in"><div className="bg-white/70 backdrop-blur-2xl px-5 py-3.5 rounded-3xl rounded-bl-sm text-slate-500 text-sm shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-white/50 flex items-center gap-3"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div></div> 思考中...</div></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Compact Input Bar (Pill Shape) - Added tiny bottom padding (pb-1) */}
      <div className="px-4 pt-2 pb-4 bg-transparent shrink-0">
         {mode === 'OMNI' ? (
             <div className="flex flex-col items-center gap-3 p-4 bg-white/40 backdrop-blur-xl rounded-3xl border border-white/50 shadow-sm">
                 <div className="text-center space-y-0.5">
                     <h3 className="text-sm font-semibold text-slate-800">Gemini 实时对话</h3>
                     <p className="text-[10px] text-slate-500">体验毫秒级响应的语音与视频交互</p>
                 </div>
                 <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => onStartLiveSession && onStartLiveSession(false)}
                        className="flex-1 py-2.5 bg-white/80 hover:bg-white text-indigo-600 border border-indigo-100 rounded-xl font-semibold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <i className="fa-solid fa-microphone"></i> 仅语音
                    </button>
                    <button 
                        onClick={() => onStartLiveSession && onStartLiveSession(true)}
                        className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <i className="fa-solid fa-video"></i> 视频通话
                    </button>
                 </div>
             </div>
         ) : (
            <>
                {/* Attachment Preview (Floating above input) */}
                {fileName && (
                   <div className="mb-2 px-4 py-2 bg-white/80 backdrop-blur-2xl border border-white/50 rounded-2xl flex justify-between items-center animate-slide-up shadow-sm">
                       <span className="text-sm text-slate-700 font-medium truncate max-w-[200px] flex items-center gap-2"><i className="fa-solid fa-file text-blue-500"></i> {fileName}</span>
                       <button onClick={() => {setFileName(null); setAttachment(null);}} className="text-slate-400 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"><i className="fa-solid fa-xmark text-sm"></i></button>
                   </div>
                )}
                
                <div className="flex items-end gap-2 bg-white/60 backdrop-blur-3xl border border-white/50 rounded-[2rem] p-1.5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white/80 transition-all">
                    {/* Upload Button */}
                    <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="w-10 h-10 rounded-full text-slate-500 flex items-center justify-center shrink-0 hover:bg-slate-100/80 transition-colors mb-0.5">
                       <i className="fa-solid fa-plus text-lg"></i>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".pdf,.dxf,.txt,.step,.stp,.image/*" />

                    {/* Text Input Pill */}
                    <div className="flex-1 flex items-center py-2.5 px-2">
                       <textarea 
                           ref={textareaRef}
                           value={inputText}
                           onChange={(e) => setInputText(e.target.value)}
                           onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                           placeholder={isProcessing ? "生成中..." : "输入加工指令..."}
                           disabled={isProcessing}
                           className="w-full bg-transparent border-none outline-none text-[15px] text-slate-800 placeholder-slate-400 resize-none max-h-[120px] py-0"
                           rows={1}
                           style={{ height: '24px' }} // Initial minimal height
                       />
                    </div>
                   
                    {/* Send Button */}
                    <button 
                       onClick={isProcessing ? onStop : handleSend}
                       disabled={!isProcessing && !inputText && !attachment}
                       className={cn(
                           "w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm transition-all active:scale-95 mb-0.5",
                           isProcessing ? "bg-red-500" : (!inputText && !attachment) ? "bg-blue-500/50 shadow-none cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600 hover:shadow-md hover:shadow-blue-500/20"
                       )}
                    >
                       <i className={cn("fa-solid text-sm", isProcessing ? "fa-stop" : "fa-arrow-up")}></i>
                    </button>
                </div>
            </>
         )}
      </div>
    </div>
  );
};

export default ChatPanel;
