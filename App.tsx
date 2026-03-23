
import React, { useState, useEffect, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import CodePanel from './components/CodePanel';
import SimulationPanel from './components/SimulationPanel';
import HistoryDrawer from './components/HistoryDrawer';
import ToolLibrary from './components/ToolLibrary';
import SetupSheet from './components/SetupSheet';
import LiveSession from './components/LiveSession';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { CNCOutput, AppMode, ModelOption, OperationParams, StockDimensions, ChatMessage, MachineOperationType, ChatSession, Tool, ToolType } from './types';
import { analyzeRequest, Attachment } from './services/modelService';
import { generateCNCCode } from './services/cncGenerator';
import * as THREE from 'three';
import { parseGCodeToPath } from './services/gcodeParser';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const App: React.FC = () => {
  // --- Core State ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [cncData, setCncData] = useState<CNCOutput | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'sim' | 'code' | 'menu'>('chat');
  
  // --- CNC Logic State ---
  const [operations, setOperations] = useState<OperationParams[]>([]);
  const [currentStock, setCurrentStock] = useState<StockDimensions>({ 
    shape: 'RECTANGULAR',
    width: 100, length: 100, height: 20, diameter: 0, material: "Aluminum" 
  });
  const [tools, setTools] = useState<Tool[]>([
      { id: 'T1', name: 'Standard End Mill', type: ToolType.END_MILL, diameter: 10 },
      { id: 'T2', name: 'Finishing Ball', type: ToolType.BALL_MILL, diameter: 6 },
      { id: 'T3', name: 'Drill Bit', type: ToolType.DRILL, diameter: 8 },
  ]);
  const [customPath, setCustomPath] = useState<THREE.CurvePath<THREE.Vector3> | null>(null);

  // --- UI Modules State ---
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isToolLibraryOpen, setIsToolLibraryOpen] = useState(false);
  const [isSetupSheetOpen, setIsSetupSheetOpen] = useState(false);
  const [isLiveSessionOpen, setIsLiveSessionOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Persistence ---
  useEffect(() => {
    try {
        const saved = localStorage.getItem('smart-cnc-sessions');
        if (saved) setSessions(JSON.parse(saved));
        const savedTools = localStorage.getItem('smart-cnc-tools');
        if (savedTools) setTools(JSON.parse(savedTools));
    } catch (e) {
        console.error("Failed to load history", e);
    }
  }, []);

  useEffect(() => {
      localStorage.setItem('smart-cnc-tools', JSON.stringify(tools));
  }, [tools]);

  // --- Session Management ---
  useEffect(() => {
    if (messages.length === 0) return;
    const sessionId = currentSessionId || Date.now().toString();
    const title = messages[0].text.length > 20 
        ? messages[0].text.substring(0, 20) + "..." 
        : messages[0].text || "新对话";

    const sessionToSave: ChatSession = {
        id: sessionId,
        title,
        timestamp: Date.now(),
        messages,
        cncData,
        operations,
        stock: currentStock
    };

    setSessions(prev => {
        const idx = prev.findIndex(s => s.id === sessionId);
        const newSessions = idx >= 0 ? prev.map((s, i) => i === idx ? sessionToSave : s) : [sessionToSave, ...prev];
        localStorage.setItem('smart-cnc-sessions', JSON.stringify(newSessions));
        return newSessions;
    });

    if (!currentSessionId) setCurrentSessionId(sessionId);
  }, [messages, cncData, operations, currentStock]);

  // --- Actions ---
  const handleReset = () => {
      setOperations([]);
      setCncData(null);
      setMessages([]);
      setCurrentStock({ shape: 'RECTANGULAR', width: 100, length: 100, height: 20, diameter: 0, material: "Aluminum" });
      setCurrentSessionId(null);
      setCustomPath(null);
      setActiveTab('chat');
  };

  const handleLoadSession = (session: ChatSession) => {
      setCurrentSessionId(session.id);
      setMessages(session.messages);
      setCncData(session.cncData);
      setOperations(session.operations);
      setCurrentStock(session.stock);
      setCustomPath(null);
      setIsHistoryOpen(false);
      setActiveTab('chat');
  };

  const handleDeleteSession = (id: string) => {
      const newSessions = sessions.filter(s => s.id !== id);
      setSessions(newSessions);
      localStorage.setItem('smart-cnc-sessions', JSON.stringify(newSessions));
      if (currentSessionId === id) handleReset();
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setIsProcessing(false);
      const stopMsg: ChatMessage = { id: Date.now().toString(), role: 'ai', text: "🛑 已停止生成。" };
      setMessages(prev => [...prev, stopMsg]);
  };

  const handleCodeEdit = (newCode: string) => {
      if (cncData) setCncData({ ...cncData, gcode: newCode });
      const path = parseGCodeToPath(newCode);
      setCustomPath(path);
  };

  // --- Main Logic: Delete Operation ---
  const handleDeleteOperation = (index: number) => {
      if (index < 0 || index >= operations.length) return;

      const opToDelete = operations[index];
      const typeLabel = opToDelete ? opToDelete.type : "工序";

      // Logic: Only ask to reset if it's the LAST item
      if (operations.length === 1) {
          if(window.confirm("这是最后一个工序，删除它将重置所有内容。确定吗？")) {
             handleReset();
          }
          return;
      }

      if(window.confirm(`确认删除工序 ${index + 1} (${typeLabel})?`)) {
         confirmDelete(index, typeLabel);
      }
  };

  const confirmDelete = (index: number, label: string) => {
      const newOps = operations.filter((_, i) => i !== index);
      setOperations(newOps);
      
      let newResult: CNCOutput | null = null;
      if (newOps.length > 0) {
          newResult = generateCNCCode(currentStock, newOps, cncData?.explanation || "已删除工序");
          setCncData(newResult);
      } else {
          setCncData(null);
      }
      
      const sysMsg: ChatMessage = {
          id: Date.now().toString(),
          role: 'ai',
          text: `🗑️ 已删除工序 ${index + 1} (${label})。`,
          cncResult: newResult || undefined
      };
      setMessages(prev => [...prev, sysMsg]);
  };

  // --- Main Logic: Send Message ---
  const handleSendMessage = async (text: string, attachment: Attachment | null, model: ModelOption, mode: AppMode) => {
    setIsProcessing(true);
    setCustomPath(null); 
    
    if (text.includes("新工序") || text.includes("新建") || text.includes("重置")) setOperations([]);

    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: text || (attachment ? `已上传文件: ${attachment.fileName}` : '...'),
        attachment: attachment?.data
    };
    setMessages(prev => [...prev, userMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let prompt = text;
      if (!prompt && mode === 'GENERATE') {
         if (attachment?.mimeType === 'text/plain') prompt = "分析这个 DXF/文本文件。";
         else if (attachment?.mimeType === 'application/pdf') prompt = "分析这张 PDF 图纸。";
         else prompt = "分析这个图像/模型。";
      }

      const analysis = await analyzeRequest(
          prompt, attachment || undefined, model, mode, 
          controller.signal, tools, messages, operations 
      );
      
      if (!analysis) throw new Error("AI 未返回有效数据");

      let explanationText = analysis.explanation || "未提供说明";
      let result: CNCOutput;

      if (mode === 'SCREEN' && analysis.screen_code) {
          const screenOp: OperationParams = {
              type: MachineOperationType.RUN_MYSCREEN,
              x: 0, y: 0, z_start: 0, z_depth: 0, feed_rate: 0, spindle_speed: 0, tool_diameter: 0, tool_type: 'END_MILL' as any, step_down: 0
          };
          result = {
              gcode: analysis.screen_code,
              explanation: explanationText,
              operations: [screenOp],
              stock: currentStock,
              isScreen: true
          };
          setCncData(result);
          setOperations([]);
          if (window.innerWidth < 1024) { setActiveTab('code'); }
      } else {
          let rawOp = Array.isArray(analysis.operation) ? analysis.operation[0] : analysis.operation;
          const safeOp: OperationParams = {
            type: MachineOperationType.GENERAL_CHAT,
            x: 0, y: 0, z_start: 0, z_depth: 0, feed_rate: 0, spindle_speed: 0, tool_diameter: 0, tool_type: 'END_MILL' as any, step_down: 0,
            ...(rawOp || {}) 
          };
          
          let safeStock = analysis.stock || currentStock;
          const isReconfig = text.includes("毛坯") || text.includes("尺寸") || text.includes("stock");
          if (operations.length > 0 && !isReconfig) safeStock = currentStock;
          
          let newOpsList = [...operations];
          if (safeOp.type !== MachineOperationType.GENERAL_CHAT) newOpsList.push(safeOp);

          if (mode === 'OPTIMIZE' && analysis.optimized_gcode) {
              result = { gcode: analysis.optimized_gcode, explanation: explanationText, operations: [safeOp], stock: safeStock };
              setOperations([safeOp]);
          } else {
              result = generateCNCCode(safeStock, newOpsList, explanationText);
              setOperations(newOpsList);
          }
          
          setCurrentStock(safeStock);
          setCncData(result);
          
          if (window.innerWidth < 1024 && safeOp.type !== MachineOperationType.GENERAL_CHAT) {
              setActiveTab('sim');
          }
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'ai', text: result.explanation, cncResult: result };
      setMessages(prev => [...prev, aiMsg]);

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: err.message || "请求失败" }]);
    } finally {
      if (abortControllerRef.current === controller) { setIsProcessing(false); abortControllerRef.current = null; }
    }
  };

  // --- RENDER HELPERS ---
  const tabBtnClass = (id: string) => cn(
      "flex flex-col items-center justify-center gap-0.5 py-1 transition-all relative w-14",
      activeTab === id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
  );

  return (
    <div className="h-full w-full fixed inset-0 flex flex-col bg-[#f2f2f7] font-sans">
      <CalibrationOverlay />
      
      {/* --- DRAWERS & MODALS --- */}
      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        sessions={sessions} 
        onSelectSession={handleLoadSession} 
        onDeleteSession={handleDeleteSession} 
        currentSessionId={currentSessionId} 
      />
      <ToolLibrary isOpen={isToolLibraryOpen} onClose={() => setIsToolLibraryOpen(false)} tools={tools} onUpdateTools={setTools} />
      <SetupSheet isOpen={isSetupSheetOpen} onClose={() => setIsSetupSheetOpen(false)} data={cncData} />
      {isLiveSessionOpen && <LiveSession onClose={() => setIsLiveSessionOpen(false)} initialVideoEnabled={true} />}

      {/* --- MAIN LAYOUT (DESKTOP: SPLIT, MOBILE: TABS) --- */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT COLUMN (Desktop: Navigation + Chat) */}
        <div className="hidden lg:flex w-[380px] flex-col border-r border-white/40 bg-white/40 backdrop-blur-2xl shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-20">
             <div className="h-16 border-b border-white/40 flex items-center px-6 bg-transparent shrink-0">
                 <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                        <i className="fa-solid fa-microchip text-white text-sm"></i>
                    </div>
                    <span className="font-bold text-slate-800 tracking-tight text-lg">AI CNC</span>
                 </div>
                 <div className="ml-auto flex gap-1.5">
                    <button onClick={handleReset} className="w-8 h-8 rounded-full hover:bg-white/60 text-slate-500 transition-colors flex items-center justify-center shadow-sm border border-transparent hover:border-white/50" title="新对话"><i className="fa-solid fa-square-plus text-lg"></i></button>
                    <button onClick={() => setIsHistoryOpen(true)} className="w-8 h-8 rounded-full hover:bg-white/60 text-slate-500 transition-colors flex items-center justify-center shadow-sm border border-transparent hover:border-white/50" title="历史"><i className="fa-solid fa-clock-rotate-left text-lg"></i></button>
                 </div>
             </div>
             <ChatPanel 
                onSendMessage={handleSendMessage} 
                onStop={handleStopGeneration} 
                onDeleteOperation={handleDeleteOperation} 
                onReset={handleReset}
                onStartLiveSession={() => setIsLiveSessionOpen(true)}
                isProcessing={isProcessing} 
                messages={messages} 
             />
        </div>

        {/* MIDDLE/RIGHT COLUMN (Desktop: Workspace) */}
        <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
             {/* Desktop Toolbar */}
             <div className="hidden lg:flex h-16 border-b border-white/40 bg-white/20 backdrop-blur-3xl px-6 items-center justify-between shrink-0 z-10">
                 <div className="flex gap-1 bg-white/40 p-1 rounded-xl border border-white/50 shadow-sm backdrop-blur-md">
                     <button onClick={() => setActiveTab('sim')} className={cn("px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300", activeTab === 'sim' || activeTab === 'chat' ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-800")}>
                        <i className="fa-solid fa-cube mr-2"></i>仿真
                     </button>
                     <button onClick={() => setActiveTab('code')} className={cn("px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300", activeTab === 'code' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800")}>
                        <i className="fa-solid fa-code mr-2"></i>代码
                     </button>
                 </div>
                 <div className="flex gap-3">
                     <button onClick={() => setIsToolLibraryOpen(true)} className="px-5 py-2 bg-white/60 border border-white/50 rounded-xl text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-white transition-all shadow-sm backdrop-blur-md">
                         <i className="fa-solid fa-toolbox mr-2"></i>刀具库
                     </button>
                     <button onClick={() => setIsSetupSheetOpen(true)} disabled={!cncData} className="px-5 py-2 bg-white/60 border border-white/50 rounded-xl text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-white transition-all shadow-sm backdrop-blur-md disabled:opacity-50 disabled:hover:bg-white/60 disabled:hover:text-slate-700">
                         <i className="fa-solid fa-file-invoice mr-2"></i>工艺单
                     </button>
                 </div>
             </div>

             {/* Content Area (Desktop & Mobile) */}
             <div className="flex-1 relative overflow-hidden">
                 
                 {/* Mobile: Chat Layer */}
                 <div className={cn("absolute inset-0 lg:hidden transition-all duration-300 z-10 pb-16", activeTab === 'chat' ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none translate-x-[-20px]")}>
                      <div className="h-full flex flex-col bg-transparent">
                          {/* ChatPanel now handles its own header entirely for consistent UI */}
                          <ChatPanel 
                            onSendMessage={handleSendMessage} 
                            onStop={handleStopGeneration} 
                            onDeleteOperation={handleDeleteOperation} 
                            onReset={handleReset}
                            onStartLiveSession={() => setIsLiveSessionOpen(true)}
                            isProcessing={isProcessing} 
                            messages={messages} 
                          />
                      </div>
                 </div>

                 {/* Simulation Layer */}
                 <div 
                    className={cn(
                        "absolute inset-0 transition-opacity duration-300 pb-24 lg:pb-0",
                        (window.innerWidth >= 1024 && (activeTab === 'sim' || activeTab === 'chat')) || (activeTab === 'sim') 
                            ? "opacity-100 z-20 pointer-events-auto" 
                            : "opacity-0 z-0 pointer-events-none"
                    )}
                 >
                     <div className="h-full p-2 lg:p-6">
                        <SimulationPanel data={cncData} customPath={customPath} />
                     </div>
                 </div>

                 {/* Code Layer */}
                 <div 
                    className={cn(
                        "absolute inset-0 transition-all duration-300 pb-24 lg:pb-0",
                        activeTab === 'code' ? "opacity-100 z-30 pointer-events-auto translate-x-0" : "opacity-0 z-0 pointer-events-none translate-x-[20px]"
                    )}
                 >
                     <div className="h-full p-2 lg:p-6 bg-transparent">
                        <CodePanel data={cncData} onCodeChange={handleCodeEdit} onDeleteOperation={handleDeleteOperation} />
                     </div>
                 </div>

                 {/* Mobile Menu Layer */}
                 <div className={cn("absolute inset-0 lg:hidden bg-white/80 backdrop-blur-xl z-40 transition-all duration-300 flex flex-col p-6 gap-4 pb-28", activeTab === 'menu' ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[20px] pointer-events-none")}>
                     <h2 className="text-2xl font-semibold text-slate-800 mb-2 mt-4 tracking-tight">更多功能</h2>
                     <button onClick={() => { setIsHistoryOpen(true); setActiveTab('chat'); }} className="p-4 bg-white/60 rounded-2xl border border-slate-200/50 flex items-center gap-4 active:scale-95 transition-transform shadow-sm">
                         <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20"><i className="fa-solid fa-clock-rotate-left text-lg"></i></div>
                         <div className="flex-1 text-left"><div className="font-semibold text-slate-800 text-lg">历史记录</div><div className="text-sm text-slate-500">查看过往对话</div></div>
                         <i className="fa-solid fa-chevron-right text-slate-300"></i>
                     </button>
                     <button onClick={() => { setIsToolLibraryOpen(true); setActiveTab('chat'); }} className="p-4 bg-white/60 rounded-2xl border border-slate-200/50 flex items-center gap-4 active:scale-95 transition-transform shadow-sm">
                         <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-orange-500/20"><i className="fa-solid fa-toolbox text-lg"></i></div>
                         <div className="flex-1 text-left"><div className="font-semibold text-slate-800 text-lg">刀具库管理</div><div className="text-sm text-slate-500">配置加工刀具</div></div>
                         <i className="fa-solid fa-chevron-right text-slate-300"></i>
                     </button>
                     <button onClick={() => { setIsSetupSheetOpen(true); setActiveTab('chat'); }} disabled={!cncData} className="p-4 bg-white/60 rounded-2xl border border-slate-200/50 flex items-center gap-4 active:scale-95 transition-transform shadow-sm disabled:opacity-50">
                         <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-green-500/20"><i className="fa-solid fa-file-invoice text-lg"></i></div>
                         <div className="flex-1 text-left"><div className="font-semibold text-slate-800 text-lg">工艺单</div><div className="text-sm text-slate-500">查看加工参数</div></div>
                         <i className="fa-solid fa-chevron-right text-slate-300"></i>
                     </button>
                     <button onClick={handleReset} className="mt-auto p-4 bg-red-50/80 rounded-2xl border border-red-100 flex items-center justify-center gap-2 text-red-600 font-semibold text-lg active:scale-95 transition-transform">
                         <i className="fa-solid fa-trash-can"></i> 清空重置
                     </button>
                 </div>

             </div>
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION (Dynamic Island Style) --- */}
      <div className="lg:hidden fixed bottom-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <nav className="pointer-events-auto w-[90%] max-w-[360px] bg-white/90 backdrop-blur-2xl border border-white/50 rounded-[2rem] flex items-center justify-between px-6 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            <button onClick={() => setActiveTab('chat')} className={tabBtnClass('chat')}>
               <div className="relative">
                   <i className={cn("fa-solid fa-message text-[20px] mb-0.5 transition-transform", activeTab === 'chat' ? "scale-110" : "")}></i>
                   {isProcessing && <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span></span>}
               </div>
               <span className="text-[10px] font-medium">助手</span>
            </button>
            <button onClick={() => setActiveTab('sim')} className={tabBtnClass('sim')}>
               <i className={cn("fa-solid fa-cube text-[20px] mb-0.5 transition-transform", activeTab === 'sim' ? "scale-110" : "")}></i>
               <span className="text-[10px] font-medium">仿真</span>
            </button>
            <button onClick={() => setActiveTab('code')} className={tabBtnClass('code')}>
               <i className={cn("fa-solid fa-code text-[20px] mb-0.5 transition-transform", activeTab === 'code' ? "scale-110" : "")}></i>
               <span className="text-[10px] font-medium">代码</span>
            </button>
            <button onClick={() => setActiveTab('menu')} className={tabBtnClass('menu')}>
               <i className={cn("fa-solid fa-bars text-[20px] mb-0.5 transition-transform", activeTab === 'menu' ? "scale-110" : "")}></i>
               <span className="text-[10px] font-medium">更多</span>
            </button>
        </nav>
      </div>
    </div>
  );
};

export default App;
