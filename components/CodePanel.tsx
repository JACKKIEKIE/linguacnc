
import React, { useState, useEffect, useRef } from 'react';
import { CNCOutput, ToolType, MachineOperationType, SafetyAuditResult } from '../types';
import { auditGCode } from '../services/cncGenerator';

interface CodePanelProps {
  data: CNCOutput | null;
  onCodeChange?: (newCode: string) => void;
  onDeleteOperation?: (index: number) => void;
}

const CodePanel: React.FC<CodePanelProps> = ({ data, onCodeChange, onDeleteOperation }) => {
  const [copied, setCopied] = useState(false);
  const [localCode, setLocalCode] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditResult, setAuditResult] = useState<SafetyAuditResult | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (data) {
        setLocalCode(data.gcode);
    }
  }, [data]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setLocalCode(newVal);
      if (onCodeChange) {
          onCodeChange(newVal);
      }
  };

  const runAudit = () => {
      const result = auditGCode(localCode);
      setAuditResult(result);
      setShowAudit(true);
  };

  const downloadCode = () => {
    if (!data) return;
    const blob = new Blob([localCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.isScreen ? 'EasyScreen.com' : 'program.mpf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(localCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  const getToolIcon = (type: ToolType) => {
    switch (type) {
        case ToolType.DRILL: return 'fa-screwdriver';
        case ToolType.FACE_MILL: return 'fa-layer-group';
        case ToolType.BALL_MILL: return 'fa-circle';
        default: return 'fa-pen-nib';
    }
  };

  const getScoreColor = (score: number) => {
      if (score >= 90) return 'text-green-500';
      if (score >= 60) return 'text-orange-500';
      return 'text-red-500';
  };

  if (!data) {
    return (
      <div className="glass-panel h-full w-full rounded-[2rem] flex flex-col items-center justify-center text-slate-400 border border-white/50 bg-white/40 backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)]">
        <i className="fa-solid fa-code text-5xl mb-4 opacity-50 drop-shadow-sm"></i>
        <p className="font-semibold tracking-wide text-slate-500">等待代码生成</p>
      </div>
    );
  }

  // Safe check for type
  if (data.operations.some(op => op?.type === MachineOperationType.GENERAL_CHAT)) {
      return (
        <div className="glass-panel h-full w-full rounded-[2rem] flex flex-col items-center justify-center text-slate-500 bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)]">
            <i className="fa-regular fa-comment-dots text-5xl mb-4 opacity-70 text-blue-500 drop-shadow-sm"></i>
            <p className="font-semibold tracking-wide text-sm opacity-90">通用对话模式</p>
            <p className="text-xs mt-2 opacity-60">未生成代码</p>
        </div>
      );
  }

  const fileName = data.isScreen ? 'EasyScreen.com' : 'program.mpf';

  return (
    <div className="glass-panel h-full flex flex-col rounded-[2rem] overflow-hidden shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)] relative group bg-white/40 backdrop-blur-3xl border border-white/50">
      
      {/* Audit Overlay */}
      {showAudit && auditResult && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur z-50 flex flex-col animate-fade-in">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shadow-sm">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                      <i className="fa-solid fa-shield-halved text-blue-500"></i>
                      安全检查报告
                  </h3>
                  <button onClick={() => setShowAudit(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors">
                      <i className="fa-solid fa-xmark"></i>
                  </button>
              </div>
              
              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
                  {/* Score Card */}
                  <div className="flex items-center gap-6 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                      <div className={`text-5xl font-black tracking-tighter ${getScoreColor(auditResult.score)}`}>
                          {auditResult.score}
                      </div>
                      <div className="h-10 w-px bg-slate-100"></div>
                      <div>
                          <div className="text-sm font-bold text-slate-700">安全评分</div>
                          <div className={`text-xs font-medium ${auditResult.passed ? 'text-green-600' : 'text-red-500'}`}>
                              {auditResult.passed ? '检测通过 (Passed)' : '存在高风险 (Failed)'}
                          </div>
                      </div>
                  </div>

                  {/* Issues List */}
                  <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">检测详情</h4>
                      {auditResult.issues.length === 0 ? (
                          <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 text-green-700">
                              <i className="fa-solid fa-circle-check text-xl"></i>
                              <span className="text-sm font-medium">未发现明显安全隐患。</span>
                          </div>
                      ) : (
                          auditResult.issues.map((issue, idx) => (
                              <div key={idx} className={`p-4 rounded-xl border flex gap-4 ${issue.severity === 'critical' ? 'bg-red-50 border-red-100' : issue.severity === 'warning' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${issue.severity === 'critical' ? 'bg-red-100 text-red-600' : issue.severity === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                      <i className={`fa-solid ${issue.severity === 'critical' ? 'fa-triangle-exclamation' : 'fa-info'}`}></i>
                                  </div>
                                  <div>
                                      <div className={`font-bold text-sm mb-0.5 ${issue.severity === 'critical' ? 'text-red-800' : issue.severity === 'warning' ? 'text-orange-800' : 'text-blue-800'}`}>
                                          {issue.line ? `Line ${issue.line}: ` : ''}{issue.message}
                                      </div>
                                      {issue.suggestion && (
                                          <div className={`text-xs ${issue.severity === 'critical' ? 'text-red-600/80' : 'text-slate-500'}`}>
                                              <i className="fa-solid fa-lightbulb mr-1 opacity-70"></i> {issue.suggestion}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Header - Added horizontal scroll and gap for mobile optimization */}
      <div className="bg-white/40 px-6 py-4 border-b border-white/50 flex justify-between items-center backdrop-blur-md shrink-0 overflow-x-auto scrollbar-hide gap-4">
        <div className="flex items-center gap-3 shrink-0">
            {data.isScreen ? (
                <span className="text-sm font-bold text-purple-600 font-mono flex items-center gap-2 bg-purple-50/50 px-3 py-1 rounded-lg border border-purple-100/50">
                    <i className="fa-solid fa-desktop"></i> {fileName}
                </span>
            ) : (
                <span className="text-sm font-bold text-slate-700 font-mono bg-white/50 px-3 py-1 rounded-lg border border-white/50 shadow-sm">{fileName}</span>
            )}
            <span className="ml-2 text-[10px] font-bold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/50 uppercase tracking-wider">
                {isEditing ? 'EDITING' : 'READ ONLY'}
            </span>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
            <button
                onClick={runAudit}
                className="text-[10px] font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 border border-slate-200/50 bg-white/50 hover:bg-white text-slate-600 hover:text-blue-600 backdrop-blur-sm"
            >
                <i className="fa-solid fa-shield-halved"></i>
                安全检查
            </button>

            <button
                onClick={() => setIsEditing(!isEditing)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 border backdrop-blur-sm ${isEditing ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white/50 border-slate-200/50 text-slate-600'}`}
            >
                <i className={`fa-solid ${isEditing ? 'fa-lock-open' : 'fa-pen'}`}></i>
                {isEditing ? '完成' : '编辑'}
            </button>

            <button
              onClick={copyToClipboard}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 border backdrop-blur-sm ${
                  copied 
                  ? 'bg-green-50 border-green-200 text-green-600' 
                  : 'bg-white/50 hover:bg-white text-slate-600 border-slate-200/50'
              }`}
            >
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>
              {copied ? '已复制' : '复制'}
            </button>
            
            <button
              onClick={downloadCode}
              className="text-[10px] font-bold bg-white/50 hover:bg-white text-slate-600 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 border border-slate-200/50 backdrop-blur-sm"
            >
              <i className="fa-solid fa-download"></i> 导出
            </button>
        </div>
      </div>
      
      {/* Scrollable Params with Delete Functionality */}
      {!data.isScreen && (
        <div className="bg-slate-50/30 px-4 py-2 border-b border-slate-100/50 flex overflow-x-auto gap-3 scrollbar-hide backdrop-blur-sm shrink-0">
            {data.operations.map((op, i) => (
                op && op.type ? (
                <div key={i} className="group relative flex items-center gap-2 bg-white/60 px-2.5 py-1 rounded-lg border border-slate-200/50 flex-shrink-0 transition-all hover:shadow-sm hover:border-blue-200 pr-7">
                    <span className="text-[10px] text-slate-400 font-bold">工序{i+1}</span>
                    <i className={`fa-solid ${getToolIcon(op.tool_type)} text-cyan-600 text-[10px]`}></i>
                    <span className="text-slate-700 font-mono text-xs">D{op.tool_diameter}</span>
                    <span className="text-slate-300 text-[10px]">|</span>
                    <span className="text-blue-600 text-[10px] font-medium tracking-tight">{(op.type || 'UNKNOWN').split('_')[0]}</span>
                    
                    {/* Delete Button */}
                    {onDeleteOperation && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onDeleteOperation(i); // Directly call, App handles confirmation
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors z-20"
                            title="删除此工序"
                            type="button"
                        >
                            <i className="fa-solid fa-xmark text-[10px]"></i>
                        </button>
                    )}
                </div>
                ) : null
            ))}
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden relative bg-white/30 backdrop-blur-sm">
        {isEditing ? (
            <textarea
                ref={textareaRef}
                value={localCode}
                onChange={handleCodeChange}
                className="w-full h-full p-5 font-mono text-sm bg-transparent outline-none resize-none text-slate-700 leading-relaxed custom-scrollbar"
                spellCheck={false}
            />
        ) : (
            <div className="w-full h-full p-5 font-mono text-sm overflow-y-auto custom-scrollbar">
                <div className="text-xs leading-relaxed">
                {localCode.split('\n').map((line, i) => (
                    <div key={i} className="flex group/line hover:bg-white/50 px-1 rounded-sm transition-colors">
                        <span className="text-slate-300 select-none w-8 text-right mr-4 flex-shrink-0 text-[10px] py-0.5">{i+1}</span>
                        <span className={`${
                            line.trim().startsWith(';') || line.trim().startsWith('//') ? 'text-green-600/80 italic' : 
                            line.includes('G0 ') || line.includes('G1 ') ? 'text-blue-600' :
                            line.includes('PRESS') || line.includes('//S') ? 'text-purple-600 font-bold' :
                            line.includes('VS') || line.includes('HS') ? 'text-orange-600' :
                            line.includes('M') ? 'text-pink-600' :
                            line.includes('T') ? 'text-orange-600' :
                            'text-slate-700'
                        }`}>{line}</span>
                    </div>
                ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default CodePanel;
