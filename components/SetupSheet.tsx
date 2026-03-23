import React from 'react';
import { CNCOutput, ToolType } from '../types';

interface SetupSheetProps {
    isOpen: boolean;
    onClose: () => void;
    data: CNCOutput | null;
}

const SetupSheet: React.FC<SetupSheetProps> = ({ isOpen, onClose, data }) => {
    if (!isOpen || !data) return null;

    const { stock, operations } = data;
    
    // Estimate Time
    let totalTimeSec = 0;
    operations.forEach(op => {
        if (op.feed_rate > 0) {
            // Rough estimate: path length approx (W+L)*2 for simple pockets * depth passes
            const passes = Math.ceil(Math.abs(op.z_depth) / (op.step_down || 1));
            const pathLenPerPass = (op.width || 50) * 2 + (op.length || 50) * 2; 
            const dist = pathLenPerPass * passes;
            totalTimeSec += (dist / op.feed_rate) * 60;
        }
        totalTimeSec += 10; // Tool change buffer
    });
    const timeMin = Math.floor(totalTimeSec / 60);
    const timeSec = Math.floor(totalTimeSec % 60);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white w-full max-w-3xl rounded-none md:rounded-xl shadow-2xl overflow-hidden relative animate-fade-in flex flex-col max-h-[90vh] print:max-h-none print:w-full print:fixed print:inset-0 print:z-[100]">
                
                {/* Print Header */}
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                    <div className="flex gap-4">
                         <div className="w-16 h-16 bg-blue-600 text-white flex items-center justify-center font-bold text-2xl rounded-lg shadow-lg">
                             <i className="fa-solid fa-file-invoice"></i>
                         </div>
                         <div>
                             <h1 className="text-2xl font-bold text-slate-800">加工工艺单</h1>
                             <p className="text-sm text-slate-500 mt-1">PROGRAM: <span className="font-mono text-slate-700 font-bold">AI_CAM_PROG</span></p>
                             <p className="text-sm text-slate-500">DATE: {new Date().toLocaleDateString()}</p>
                         </div>
                    </div>
                    <div className="text-right">
                         <div className="text-3xl font-bold text-slate-700 font-mono">{timeMin}m {timeSec}s</div>
                         <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">预估工时</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        
                        {/* 1. Setup Info */}
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">工件准备 (Stock)</h3>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-slate-400">形状</div>
                                        <div className="font-medium text-slate-700">{stock.shape}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400">材质</div>
                                        <div className="font-medium text-slate-700">{stock.material}</div>
                                    </div>
                                    <div className="col-span-2 grid grid-cols-3 gap-2">
                                        <div className="bg-white p-2 rounded border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400">Length (X)</div>
                                            <div className="font-mono font-bold text-slate-700">{stock.length}</div>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400">Width (Y)</div>
                                            <div className="font-mono font-bold text-slate-700">{stock.width}</div>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400">Height (Z)</div>
                                            <div className="font-mono font-bold text-slate-700">{stock.height}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">坐标系 (WCS)</h3>
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-2 border-blue-200">
                                        <i className="fa-solid fa-crosshairs text-blue-500 text-xl"></i>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-700">G54 - Top Center</div>
                                        <div className="text-xs text-slate-500">X0 Y0 在工件上表面中心</div>
                                        <div className="text-xs text-slate-500">Z0 在工件上表面</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Visual Plot (CSS Only) */}
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">装夹示意图</h3>
                            <div className="flex-1 bg-slate-100 rounded-lg border border-slate-200 relative min-h-[200px] flex items-center justify-center overflow-hidden">
                                {/* Grid */}
                                <div className="absolute inset-0" style={{backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
                                
                                {/* Stock */}
                                <div className="relative bg-white border-2 border-slate-400 shadow-xl" style={{width: '60%', aspectRatio: `${stock.width}/${stock.length}`}}>
                                    {/* Center Crosshair */}
                                    <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2">
                                        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-red-500"></div>
                                        <div className="absolute left-1/2 top-0 h-full w-[2px] bg-red-500"></div>
                                    </div>
                                    <div className="absolute top-1/2 left-1/2 translate-x-2 translate-y-2 text-[10px] font-bold text-red-600 bg-white/80 px-1 rounded">G54</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Tool List */}
                    <div className="mt-8">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">刀具清单</h3>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="p-3 rounded-l-lg">Tool #</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Diameter</th>
                                    <th className="p-3 text-right rounded-r-lg">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {operations.map((op, idx) => (
                                    <tr key={idx}>
                                        <td className="p-3 font-mono font-bold text-slate-700">T{idx+1}</td>
                                        <td className="p-3 text-slate-600">{op.tool_type}</td>
                                        <td className="p-3 font-mono text-slate-600">D{op.tool_diameter}mm</td>
                                        <td className="p-3 text-right text-slate-400">Feed: {op.feed_rate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 print:hidden">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">关闭</button>
                    <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center gap-2">
                        <i className="fa-solid fa-print"></i> 打印 / 存为 PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SetupSheet;
