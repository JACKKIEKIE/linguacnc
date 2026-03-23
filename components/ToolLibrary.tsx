import React, { useState } from 'react';
import { Tool, ToolType } from '../types';

interface ToolLibraryProps {
    isOpen: boolean;
    onClose: () => void;
    tools: Tool[];
    onUpdateTools: (tools: Tool[]) => void;
}

const ToolLibrary: React.FC<ToolLibraryProps> = ({ isOpen, onClose, tools, onUpdateTools }) => {
    const [newTool, setNewTool] = useState<Partial<Tool>>({
        type: ToolType.END_MILL,
        diameter: 10,
        name: 'New Tool'
    });
    const [isAdding, setIsAdding] = useState(false);

    if (!isOpen) return null;

    const handleAdd = () => {
        const tool: Tool = {
            id: `T${tools.length + 1}`,
            name: newTool.name || `Tool ${tools.length + 1}`,
            type: newTool.type || ToolType.END_MILL,
            diameter: newTool.diameter || 10,
            description: newTool.description || ''
        };
        onUpdateTools([...tools, tool]);
        setIsAdding(false);
    };

    const handleDelete = (id: string) => {
        onUpdateTools(tools.filter(t => t.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white/90 backdrop-blur-xl w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative border border-white/50 animate-fade-in flex flex-col max-h-[80vh]">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-200/60 bg-white/50 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <i className="fa-solid fa-toolbox text-blue-500"></i> 智能刀具库
                        </h2>
                        <p className="text-xs text-slate-500">AI 将优先使用库中定义的刀具进行编程</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Tool List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/50">
                    {tools.map((tool) => (
                        <div key={tool.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold font-mono text-sm border border-blue-100">
                                    {tool.id}
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700 text-sm">{tool.name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{tool.type}</span>
                                        <span>D{tool.diameter}mm</span>
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleDelete(tool.id)}
                                className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                            >
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    ))}

                    {isAdding ? (
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 animate-slide-up">
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">名称</label>
                                    <input 
                                        type="text" 
                                        value={newTool.name} 
                                        onChange={e => setNewTool({...newTool, name: e.target.value})}
                                        className="w-full mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">直径 (mm)</label>
                                    <input 
                                        type="number" 
                                        value={newTool.diameter} 
                                        onChange={e => setNewTool({...newTool, diameter: parseFloat(e.target.value)})}
                                        className="w-full mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none" 
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">类型</label>
                                    <select 
                                        value={newTool.type} 
                                        onChange={e => setNewTool({...newTool, type: e.target.value as ToolType})}
                                        className="w-full mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none" 
                                    >
                                        <option value={ToolType.END_MILL}>平底铣刀 (End Mill)</option>
                                        <option value={ToolType.BALL_MILL}>球头铣刀 (Ball Mill)</option>
                                        <option value={ToolType.DRILL}>钻头 (Drill)</option>
                                        <option value={ToolType.FACE_MILL}>面铣刀 (Face Mill)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">取消</button>
                                <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30">
                                    确认添加
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 font-medium text-sm"
                        >
                            <i className="fa-solid fa-plus"></i> 添加新刀具
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ToolLibrary;