import React from 'react';
import { ChatSession } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  currentSessionId: string | null;
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onDeleteSession,
  currentSessionId
}) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed inset-y-0 left-0 w-80 bg-white/90 backdrop-blur-xl shadow-2xl z-[70] transform transition-transform duration-300 ease-out border-r border-white/50 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50">
            <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-blue-500"></i>
                历史记录
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center">
                <i className="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-xs">
                    <i className="fa-regular fa-folder-open text-2xl mb-2 opacity-50"></i>
                    暂无历史记录
                </div>
            ) : (
                sessions.sort((a,b) => b.timestamp - a.timestamp).map(session => (
                    <div 
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className={`group relative p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                            currentSessionId === session.id 
                            ? 'bg-blue-50 border-blue-200 shadow-sm' 
                            : 'bg-white border-slate-100 hover:border-blue-100'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <h3 className={`font-semibold text-sm truncate pr-6 ${currentSessionId === session.id ? 'text-blue-700' : 'text-slate-700'}`}>
                                {session.title}
                            </h3>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all"
                                title="删除"
                            >
                                <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                            <i className="fa-regular fa-calendar"></i>
                            {new Date(session.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed opacity-80">
                            {session.messages.find(m => m.role === 'user')?.text || "无内容"}
                        </p>
                    </div>
                ))
            )}
        </div>
      </div>
    </>
  );
};

export default HistoryDrawer;