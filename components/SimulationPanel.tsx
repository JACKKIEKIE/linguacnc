
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { CNCOutput, MachineOperationType, ToolType, SimulationMode } from '../types';
import { requestCloudSimulation } from '../services/cloudSimulationService';
// @ts-ignore
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';

interface SimulationPanelProps {
  data: CNCOutput | null;
  customPath?: THREE.CurvePath<THREE.Vector3> | null;
}

// --- Internal Component: HMI Simulator ---
const HMISimulator: React.FC<{ data: CNCOutput | null }> = ({ data }) => {
    const screenData = useMemo(() => {
        const defaultHMI = {
            header: "JOG Mode",
            variables: [] as any[],
            hs: ["Machine", "Param", "Prog", "ProgMgr", "Diagnos", "Startup", "", ""],
            vs: ["", "", "", "", "", "", "", ""]
        };

        if (!data) return defaultHMI;

        // 1. Run MyScreen Parsing (Screen Mode)
        if (data.isScreen && data.gcode) {
            const code = data.gcode;
            const headerMatch = code.match(/HD\s*=\s*"([^"]+)"/) || code.match(/\/\/M\s*\{.*,HD="([^"]+)"/);
            const header = headerMatch ? headerMatch[1] : "Run MyScreen";
            
            const variables: any[] = [];
            const varRegex = /DEF\s+(\w+)\s*=\s*\{([^}]+)\}/g;
            let match;
            while ((match = varRegex.exec(code)) !== null) {
                const propsStr = match[2];
                const getProp = (key: string) => {
                    const pMatch = propsStr.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
                    if (pMatch) return pMatch[1];
                    const pMatchNum = propsStr.match(new RegExp(`${key}\\s*=\\s*([\\d\\.]+)`, 'i'));
                    return pMatchNum ? pMatchNum[1] : "";
                };
                
                variables.push({
                    name: match[1],
                    label: getProp("LT") || match[1],
                    unit: getProp("ST"),
                    val: getProp("VAL"),
                    type: getProp("TYP")
                });
            }

            const getSoftkey = (prefix: string) => {
                const keys = Array(8).fill("");
                for(let i=1; i<=8; i++) {
                    const regex = new RegExp(`${prefix}${i}\\s*=\\s*[\\(\\{](?:.*st=|)?"([^"]+)"`, 'i');
                    const m = code.match(regex);
                    if(m) keys[i-1] = m[1];
                }
                return keys;
            };

            return {
                header,
                variables,
                hs: getSoftkey("HS"),
                vs: getSoftkey("VS")
            };
        } 
        
        // 2. Machining Status Simulation (Generate Mode)
        if (data.operations.length > 0) {
            const op = data.operations[data.operations.length - 1]; // Show last op
            return {
                header: "AUTO - " + (op.type || "Program"),
                variables: [
                    { label: "T", val: `"${op.tool_type.split('_')[0]}"`, unit: `D${op.tool_diameter}` },
                    { label: "F", val: op.feed_rate, unit: "mm/min" },
                    { label: "S", val: op.spindle_speed, unit: "rpm" },
                    { label: "X", val: op.x.toFixed(3), unit: "mm" },
                    { label: "Y", val: op.y.toFixed(3), unit: "mm" },
                    { label: "Z", val: op.z_start.toFixed(3), unit: "mm" },
                    { label: "Part Count", val: data.operations.length.toString(), unit: "pcs" },
                    { label: "Cycle Time", val: "00:05:30", unit: "" },
                ],
                hs: ["Prog. Control", "Block Search", "", "", "Simul.", "Correct.", "", ""],
                vs: ["", "Stop", "Reset", "", "", "", "", "Exit"]
            };
        }

        return defaultHMI;
    }, [data]);

    return (
        <div className="w-full h-full flex flex-col bg-[#cfd4da] select-none font-sans overflow-hidden relative border-[12px] border-[#333] rounded-lg shadow-inner">
            {/* Operator Panel Header */}
            <div className="h-8 bg-gradient-to-r from-orange-400 to-orange-500 flex items-center px-4 justify-between shadow-sm shrink-0 z-10 border-b border-orange-600">
                <span className="text-white font-bold text-xs tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-cogs opacity-80"></i> MACHINE
                </span>
                <span className="text-white font-bold text-sm tracking-wide text-shadow">{screenData.header}</span>
                <span className="text-white/80 text-[10px] bg-black/20 px-1.5 rounded">CH1</span>
            </div>

            <div className="flex-1 flex min-h-0 relative">
                 {/* Main Content Area */}
                <div className="flex-1 bg-[#f0f2f5] p-1 flex flex-col relative overflow-hidden border-r border-[#9ca3af]">
                    {/* Status Bar */}
                    <div className="h-6 bg-[#e5e7eb] border-b border-white flex items-center px-2 mb-1 gap-4 text-[10px] text-slate-600 font-mono">
                         <span className="flex items-center gap-1"><i className="fa-solid fa-check-circle text-green-600"></i> ROV</span>
                         <span className="flex-1"></span>
                         <span>WCS</span>
                         <span>M01</span>
                    </div>
                    
                    {/* Variables Form */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-[2px] custom-scrollbar">
                        {screenData.variables.map((v, idx) => (
                            <div key={idx} className="flex items-center gap-1 h-7">
                                <div className="w-[35%] text-right text-[11px] text-slate-700 font-medium truncate pr-2" title={v.label}>{v.label}</div>
                                <div className="flex-1 bg-white border border-slate-400 inset-shadow h-full flex items-center px-2 text-sm text-slate-900 font-mono focus-within:ring-2 ring-orange-400 focus-within:border-orange-500 transition-all">
                                    {v.val || "0"}
                                </div>
                                <div className="w-8 text-[10px] text-slate-500 pl-1">{v.unit}</div>
                            </div>
                        ))}
                        {screenData.variables.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
                                <i className="fa-regular fa-window-maximize text-4xl"></i>
                                <span className="text-xs">无变量定义</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Vertical Softkeys */}
                <div className="w-[72px] bg-[#cfd4da] flex flex-col py-0.5 gap-[1px] shrink-0">
                     {screenData.vs.map((label, i) => (
                         <div key={i} className="flex-1 mx-0.5 bg-gradient-to-b from-[#f0f2f5] to-[#dcdfe4] border border-[#9ca3af] rounded-[1px] shadow-sm flex items-center justify-center text-center p-0.5 relative active:translate-y-[1px] active:bg-[#e2e5e9] group cursor-pointer">
                             <span className="text-[9px] font-bold text-slate-700 leading-tight break-words w-full">{label}</span>
                             {label && <div className="absolute right-0.5 top-0.5 w-1 h-1 bg-green-500 rounded-full shadow-[0_0_2px_#22c55e]"></div>}
                         </div>
                     ))}
                </div>
            </div>

            {/* Horizontal Softkeys */}
            <div className="h-[52px] bg-[#cfd4da] border-t border-[#9ca3af] flex px-0.5 gap-[1px] shrink-0 pb-0.5">
                 {screenData.hs.map((label, i) => (
                     <div key={i} className="flex-1 mt-0.5 bg-gradient-to-b from-[#f0f2f5] to-[#dcdfe4] border border-[#9ca3af] rounded-[1px] shadow-sm flex flex-col items-center justify-center text-center p-0.5 relative active:translate-y-[1px] active:bg-[#e2e5e9] cursor-pointer">
                         <span className="text-[9px] font-bold text-slate-700 leading-tight line-clamp-2 w-full">{label}</span>
                     </div>
                 ))}
                 <div className="w-[70px] flex flex-col gap-[1px] ml-0.5 mt-0.5">
                      <div className="flex-1 bg-[#b0b8c1] border border-[#8a929b] rounded-[1px] flex items-center justify-center cursor-pointer active:bg-[#a0a8b1]">
                          <i className="fa-solid fa-caret-up text-slate-600 text-[10px]"></i>
                      </div>
                      <div className="flex-1 bg-[#b0b8c1] border border-[#8a929b] rounded-[1px] flex items-center justify-center cursor-pointer active:bg-[#a0a8b1]">
                          <i className="fa-solid fa-chevron-right text-slate-600 text-[10px]"></i>
                      </div>
                 </div>
            </div>
        </div>
    );
};


const SimulationPanel: React.FC<SimulationPanelProps> = ({ data, customPath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const toolRef = useRef<THREE.Group | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const animationRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const brushRef = useRef<any>(null); 
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | 'hmi'>('3d');
  
  // Cloud vs Local State
  const [simMode, setSimMode] = useState<SimulationMode>('LOCAL');
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string>('');
  
  const animationState = useRef<{
      curve: THREE.CurvePath<THREE.Vector3> | null;
      progress: number;
      speed: number;
      playing: boolean;
  }>({ curve: null, progress: 0, speed: 0.005, playing: true });

  useEffect(() => {
      if (data?.isScreen) {
          setViewMode('hmi');
      } else {
          setViewMode('3d');
      }
  }, [data]);

  // Handle path updates
  useEffect(() => {
      if (!sceneRef.current || !customPath) return;
      
      if (pathLineRef.current) {
          sceneRef.current.remove(pathLineRef.current);
      }
      
      const points = customPath.getPoints(200);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xffff00 }); 
      const line = new THREE.Line(geometry, material);
      line.userData.isDynamic = true;
      sceneRef.current.add(line);
      pathLineRef.current = line;

      animationState.current.curve = customPath;
      animationState.current.progress = 0;
      animationState.current.playing = true;
      setIsPlaying(true);
      setIsFinished(false);

  }, [customPath]);

  // Init Scene
  useEffect(() => {
    if (!containerRef.current || viewMode !== '3d') return;
    
    const container = containerRef.current;
    let w = container.clientWidth || 1; 
    let h = container.clientHeight || 1;
    
    if (!rendererRef.current) {
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0xf8fafc); 
        
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
        camera.position.set(60, -60, 60); 
        camera.up.set(0, 0, 1);
        cameraRef.current = camera;
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(50, -50, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        scene.add(dirLight);
    }

    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0 && cameraRef.current && rendererRef.current) {
                cameraRef.current.aspect = width / height;
                cameraRef.current.updateProjectionMatrix();
                rendererRef.current.setSize(width, height);
                if (sceneRef.current) {
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                }
            }
        }
    });
    resizeObserver.observe(container);

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      
      const state = animationState.current;
      if (toolRef.current && state.curve && state.playing && !isCloudLoading) {
          state.progress += state.speed;
          
          if (state.progress >= 1) {
              state.progress = 1;
              state.playing = false;
              setIsPlaying(false);
              setIsFinished(true);
          }
          
          const point = state.curve.getPoint(state.progress);
          if (point) {
              toolRef.current.position.copy(point);
              if (state.progress < 0.99) {
                  toolRef.current.rotation.z += 0.4;
              }
          }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [viewMode, isCloudLoading]); 

  // --- CSG / Geometry Generation ---
  useEffect(() => {
    if (!sceneRef.current || viewMode !== '3d') return;
    const scene = sceneRef.current;
    
    // Cleanup previous meshes
    const cleanupScene = () => {
        const toRemove: THREE.Object3D[] = [];
        scene.traverse((c) => { if (c.userData.isDynamic) toRemove.push(c); });
        toRemove.forEach(c => {
            if (c instanceof THREE.Mesh) {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                    if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                    else c.material.dispose();
                }
            }
            scene.remove(c);
        });
        
        animationState.current = { curve: null, progress: 0, speed: 0.006, playing: false };
        setIsPlaying(false);
        setIsFinished(false);
        toolRef.current = null;
        brushRef.current = null;
        pathLineRef.current = null;
    };

    if (!data || data.isScreen) {
        cleanupScene();
        return; 
    }

    if (data.operations.some(op => op.type === MachineOperationType.GENERAL_CHAT)) {
        cleanupScene();
        return;
    }

    // --- Core CSG Generation Function ---
    const generateGeometry = () => {
        const { stock } = data;
        const stockW = stock.width || 100;
        const stockL = stock.length || 100;
        const stockH = stock.height || 20;
        const stockD = stock.diameter || 100;
        const maxStockDim = Math.max(stockW, stockL, stockH, stockD);

        // Adjust Camera
        if (cameraRef.current && controlsRef.current) {
            const camDist = Math.max(maxStockDim * 2.5, 40);
            cameraRef.current.position.set(camDist, -camDist, camDist);
            controlsRef.current.target.set(0, 0, -stockH/2);
            cameraRef.current.updateProjectionMatrix();
        }

        try {
            const stockMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x9ca3af, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide
            });
            const machinedMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xd1d5db, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide
            });

            let stockGeo: THREE.BufferGeometry;
            if (stock.shape === 'CYLINDRICAL') {
                const r = stockD / 2;
                stockGeo = new THREE.CylinderGeometry(r, r, stockH, 64);
                stockGeo.rotateX(Math.PI / 2);
                stockGeo.translate(0, 0, -stockH / 2);
            } else {
                stockGeo = new THREE.BoxGeometry(stockW, stockL, stockH);
                stockGeo.translate(0, 0, -stockH / 2);
            }

            // Only run CSG if we are not previewing a custom path live
            if (!customPath) {
                const evaluator = new Evaluator();
                evaluator.attributes = ['position', 'normal', 'uv']; 

                let resultBrush = new Brush(stockGeo, stockMaterial);

                data.operations.forEach(op => {
                    let cutterGeo: THREE.BufferGeometry | null = null;
                    const radius = (op.diameter || op.tool_diameter || 10) / 2;
                    const depth = Math.abs(op.z_depth) || 1;
                    const cutterHeight = depth + 1.0; 
                    const zCenter = op.z_start - (depth / 2) + 0.5;
                    
                    if (op.type === MachineOperationType.BOSS_MILLING) {
                        const areaGeo = new THREE.BoxGeometry(stockW + 5, stockL + 5, cutterHeight); 
                        areaGeo.translate(0, 0, zCenter);
                        
                        let bossGeo: THREE.BufferGeometry;

                        if (op.path_segments && op.path_segments.length > 0) {
                            const shape = new THREE.Shape();
                            // Use path_segments[0] if exists
                            if(op.path_segments.length > 0) {
                                shape.moveTo(op.path_segments[0].x, op.path_segments[0].y);
                                op.path_segments.slice(1).forEach(seg => shape.lineTo(seg.x, seg.y));
                                shape.lineTo(op.path_segments[0].x, op.path_segments[0].y);
                            }
                            const extrudeSettings = { steps: 1, depth: cutterHeight, bevelEnabled: false };
                            bossGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                            bossGeo.translate(0, 0, op.z_start - depth);
                            
                        } else if (op.boss_shape === 'CYLINDRICAL' || (op.diameter && !op.width)) {
                            const bR = (op.diameter || 20) / 2;
                            bossGeo = new THREE.CylinderGeometry(bR, bR, cutterHeight, 32);
                            bossGeo.rotateX(Math.PI / 2);
                            bossGeo.translate(op.x, op.y, zCenter);
                        } else {
                            const bW = op.width || 20;
                            const bL = op.length || 20;
                            bossGeo = new THREE.BoxGeometry(bW, bL, cutterHeight);
                            bossGeo.translate(op.x, op.y, zCenter);
                        }

                        const areaBrush = new Brush(areaGeo, machinedMaterial);
                        const bossBrush = new Brush(bossGeo, machinedMaterial);
                        areaBrush.updateMatrixWorld();
                        bossBrush.updateMatrixWorld();
                        
                        const frameBrush = evaluator.evaluate(areaBrush, bossBrush, SUBTRACTION);
                        frameBrush.material = machinedMaterial;
                        frameBrush.updateMatrixWorld();
                        
                        resultBrush.updateMatrixWorld();
                        const result = evaluator.evaluate(resultBrush, frameBrush, SUBTRACTION);
                        resultBrush = new Brush(result.geometry, machinedMaterial);

                    } else if (op.type === MachineOperationType.CONTOUR) {
                        if (op.path_segments && op.path_segments.length > 0) {
                            let prevX = op.x;
                            let prevY = op.y;
                            op.path_segments.forEach(seg => {
                                const pts: {x:number, y:number}[] = [];
                                pts.push({x: seg.x, y: seg.y});

                                pts.forEach(pt => {
                                    const len = Math.sqrt(Math.pow(pt.x - prevX, 2) + Math.pow(pt.y - prevY, 2));
                                    if (len > 0.1) {
                                        const angle = Math.atan2(pt.y - prevY, pt.x - prevX);
                                        const segmentGeo = new THREE.BoxGeometry(len, radius * 2, cutterHeight);
                                        segmentGeo.rotateZ(angle);
                                        const midX = (prevX + pt.x) / 2;
                                        const midY = (prevY + pt.y) / 2;
                                        segmentGeo.translate(midX, midY, zCenter);
                                        
                                        const jointGeo = new THREE.CylinderGeometry(radius, radius, cutterHeight, 16);
                                        jointGeo.rotateX(Math.PI/2);
                                        jointGeo.translate(prevX, prevY, zCenter);
                                        
                                        const segBrush = new Brush(segmentGeo, machinedMaterial);
                                        const jointBrush = new Brush(jointGeo, machinedMaterial);
                                        segBrush.updateMatrixWorld();
                                        jointBrush.updateMatrixWorld();
                                        resultBrush.updateMatrixWorld();

                                        let res = evaluator.evaluate(resultBrush, segBrush, SUBTRACTION);
                                        resultBrush = new Brush(res.geometry, machinedMaterial);
                                        res = evaluator.evaluate(resultBrush, jointBrush, SUBTRACTION);
                                        resultBrush = new Brush(res.geometry, machinedMaterial);
                                    }
                                    prevX = pt.x;
                                    prevY = pt.y;
                                });
                            });
                            // End Cap
                            const endGeo = new THREE.CylinderGeometry(radius, radius, cutterHeight, 16);
                            endGeo.rotateX(Math.PI/2);
                            endGeo.translate(prevX, prevY, zCenter);
                            const endBrush = new Brush(endGeo, machinedMaterial);
                            endBrush.updateMatrixWorld();
                            resultBrush.updateMatrixWorld();
                            const res = evaluator.evaluate(resultBrush, endBrush, SUBTRACTION);
                            resultBrush = new Brush(res.geometry, machinedMaterial);

                        } else {
                            const w = op.tool_diameter || 10; 
                            const l = 20; 
                            const cGeo = new THREE.BoxGeometry(w, l, cutterHeight);
                            cGeo.translate(op.x, op.y, zCenter);
                            const cBrush = new Brush(cGeo, machinedMaterial);
                            cBrush.updateMatrixWorld();
                            resultBrush.updateMatrixWorld();
                            const r = evaluator.evaluate(resultBrush, cBrush, SUBTRACTION);
                            resultBrush = new Brush(r.geometry, machinedMaterial);
                        }
                    } else {
                        // Standard Pocket/Drill
                        if (op.type === MachineOperationType.DRILL || op.type === MachineOperationType.CIRCULAR_POCKET) {
                            cutterGeo = new THREE.CylinderGeometry(radius, radius, cutterHeight, 32);
                            cutterGeo.rotateX(Math.PI / 2);
                            cutterGeo.translate(op.x, op.y, zCenter);
                        } else if (op.type === MachineOperationType.RECTANGULAR_POCKET || op.type === MachineOperationType.FACE_MILL) {
                            const w = op.width || 10;
                            const l = op.length || 10;
                            cutterGeo = new THREE.BoxGeometry(w, l, cutterHeight);
                            cutterGeo.translate(op.x, op.y, zCenter);
                        } 

                        if (cutterGeo) {
                            const cutterBrush = new Brush(cutterGeo, machinedMaterial);
                            cutterBrush.updateMatrixWorld();
                            resultBrush.updateMatrixWorld();
                            
                            const result = evaluator.evaluate(resultBrush, cutterBrush, SUBTRACTION);
                            resultBrush = new Brush(result.geometry, machinedMaterial);
                        }
                    }
                });

                resultBrush.userData.isDynamic = true;
                resultBrush.castShadow = true;
                resultBrush.receiveShadow = true;
                scene.add(resultBrush);
                brushRef.current = resultBrush;
            } else {
                const mesh = new THREE.Mesh(stockGeo, stockMaterial);
                mesh.userData.isDynamic = true;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
                brushRef.current = mesh;
            }
        } catch (err) {
            console.error("CSG failed", err);
        }

        // --- Tool Visualization (Last Op) ---
        const lastOp = data.operations[data.operations.length - 1];
        const toolType = lastOp?.tool_type || ToolType.END_MILL;
        const toolRadius = (lastOp?.tool_diameter || 10) / 2;
        const holderScale = Math.min(1.0, Math.max(0.1, maxStockDim / 100));
        
        const toolGroup = new THREE.Group();
        toolGroup.userData.isDynamic = true;
        
        const holderMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const cutterMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.8, roughness: 0.2 });
        const cutterLen = 30 * holderScale;

        const h1 = new THREE.Mesh(new THREE.CylinderGeometry(8 * holderScale, 12 * holderScale, 15 * holderScale, 32), holderMat);
        h1.rotation.x = Math.PI / 2; 
        h1.position.z = cutterLen + (7.5 * holderScale); 
        toolGroup.add(h1);

        if (toolType === ToolType.BALL_MILL) {
            const straightLen = cutterLen - toolRadius;
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(toolRadius, toolRadius, straightLen, 32), cutterMat);
            cyl.rotation.x = Math.PI / 2;
            cyl.position.z = toolRadius + straightLen / 2;
            toolGroup.add(cyl);
            const ball = new THREE.Mesh(new THREE.SphereGeometry(toolRadius, 32, 16), cutterMat);
            ball.position.z = toolRadius;
            toolGroup.add(ball);
        } else if (toolType === ToolType.DRILL) {
            const tipHeight = toolRadius * 2; 
            const straightLen = cutterLen - tipHeight;
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(toolRadius, toolRadius, straightLen, 32), cutterMat);
            cyl.rotation.x = Math.PI / 2;
            cyl.position.z = tipHeight + straightLen / 2;
            toolGroup.add(cyl);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(toolRadius, tipHeight, 32), cutterMat);
            cone.rotation.x = -Math.PI / 2;
            cone.position.z = tipHeight / 2;
            toolGroup.add(cone);
        } else {
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(toolRadius, toolRadius, cutterLen, 32), cutterMat);
            cyl.rotation.x = Math.PI / 2;
            cyl.position.z = cutterLen / 2;
            toolGroup.add(cyl);
        }

        scene.add(toolGroup);
        toolRef.current = toolGroup;

        // --- Animation Path ---
        if (!customPath) {
            const globalPath = new THREE.CurvePath<THREE.Vector3>();
            const parkZ = maxStockDim > 50 ? 50 : 35;

            data.operations.forEach(op => {
                const zTop = op.z_start;
                const zBot = op.z_start - op.z_depth;
                
                if ((op.type === MachineOperationType.BOSS_MILLING || op.type === MachineOperationType.CONTOUR) && op.path_segments && op.path_segments.length > 0) {
                     let startX = op.x;
                     let startY = op.y;
                     if (op.type === MachineOperationType.BOSS_MILLING && op.path_segments.length > 0) {
                         startX = op.path_segments[0].x;
                         startY = op.path_segments[0].y;
                     }

                     const start = new THREE.Vector3(startX, startY, zTop + 5);
                     const cutStart = new THREE.Vector3(startX, startY, zTop);
                     globalPath.add(new THREE.LineCurve3(start, cutStart));

                     let prevX = startX;
                     let prevY = startY;
                     const segs = op.type === MachineOperationType.BOSS_MILLING ? op.path_segments.slice(1) : op.path_segments;

                     segs.forEach(seg => {
                         const p1 = new THREE.Vector3(prevX, prevY, zBot);
                         const p2 = new THREE.Vector3(seg.x, seg.y, zBot);
                         globalPath.add(new THREE.LineCurve3(p1, p2));
                         prevX = seg.x;
                         prevY = seg.y;
                     });
                     
                     if (op.type === MachineOperationType.BOSS_MILLING) {
                         const pEnd = new THREE.Vector3(prevX, prevY, zBot);
                         const pStart = new THREE.Vector3(op.path_segments[0].x, op.path_segments[0].y, zBot);
                         globalPath.add(new THREE.LineCurve3(pEnd, pStart));
                         prevX = op.path_segments[0].x;
                         prevY = op.path_segments[0].y;
                     }
                     const pRetract = new THREE.Vector3(prevX, prevY, zTop + 5);
                     globalPath.add(new THREE.LineCurve3(new THREE.Vector3(prevX, prevY, zBot), pRetract));

                } else {
                    const start = new THREE.Vector3(op.x, op.y, zTop + 5); 
                    const cutStart = new THREE.Vector3(op.x, op.y, zTop);
                    const cutEnd = new THREE.Vector3(op.x, op.y, zBot);
                    
                    globalPath.add(new THREE.LineCurve3(start, cutStart));
                    globalPath.add(new THREE.LineCurve3(cutStart, cutEnd));
                    globalPath.add(new THREE.LineCurve3(cutEnd, start));
                }
            });
            
            if (data.operations.length > 0 && globalPath.curves.length > 0) {
                const lastCurve = globalPath.curves[globalPath.curves.length - 1];
                const lastRetract = lastCurve.getPoint(1);
                const finalPark = new THREE.Vector3(lastRetract.x, lastRetract.y, parkZ);
                globalPath.add(new THREE.LineCurve3(lastRetract, finalPark));
            }

            animationState.current = { curve: globalPath, progress: 0, speed: 0.006, playing: true };
            setIsPlaying(true);
            setIsFinished(false);

            const points = globalPath.getPoints(200);
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({ color: 0x0088ff });
            const line = new THREE.Line(geo, mat);
            line.userData.isDynamic = true;
            scene.add(line);
        }
    };
    
    // --- Execution Logic based on Mode ---
    const runSimulationWorkflow = async () => {
        cleanupScene();
        
        if (simMode === 'CLOUD') {
            setIsCloudLoading(true);
            setCloudStatus('Connecting to GPU Cluster...');
            
            try {
                // 1. Upload
                await new Promise(r => setTimeout(r, 600));
                setCloudStatus('Uploading Geometry Data...');
                
                // 2. Call Service
                setCloudStatus('Connecting to Elastic GPU Service...'); // Generic loading state
                const result = await requestCloudSimulation(data);
                
                // Update specific provider status
                if (result.provider) {
                    setCloudStatus(`Calculating on ${result.provider}...`);
                    await new Promise(r => setTimeout(r, 800)); // Show the provider name for a bit
                }

                // 3. Download
                if (result.status === 'success') {
                    setCloudStatus('Downloading High-Res Mesh...');
                    // In a real app, we would load the glTF from result.meshUrl here.
                    // For this demo, we run the local generator to show the result, 
                    // but the user experience is "Cloud-like".
                    generateGeometry();
                } else {
                    console.error("Cloud Sim Failed");
                    // Fallback
                    generateGeometry(); 
                }
            } catch (e) {
                console.error(e);
                generateGeometry();
            } finally {
                setIsCloudLoading(false);
            }
        } else {
            // Local Mode - Immediate
            generateGeometry();
        }
    };

    runSimulationWorkflow();

  }, [data, viewMode, customPath, simMode]);

  const handleRestart = () => {
      if (!animationState.current.curve) return;
      animationState.current.progress = 0;
      animationState.current.playing = true;
      setIsPlaying(true);
      setIsFinished(false);
  };

  const handleTogglePlay = () => {
      if (!animationState.current.curve) return;
      const newState = !animationState.current.playing;
      animationState.current.playing = newState;
      setIsPlaying(newState);
  };

  const handleExportSTL = () => {
      if (!brushRef.current) return;
      const exporter = new STLExporter();
      const options = { binary: true };
      const result = exporter.parse(brushRef.current, options);
      const blob = new Blob([result as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'simulation-part.stl';
      link.click();
      URL.revokeObjectURL(url);
  };

  return (
    <div className={`glass-panel flex flex-col rounded-[2rem] overflow-hidden shadow-[0_8px_32px_-12px_rgba(0,0,0,0.1)] bg-white/40 backdrop-blur-3xl border border-white/50 relative group transition-all duration-300 h-full w-full`}>
      
      {/* Cloud Loading Overlay */}
      {isCloudLoading && (
          <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-2xl flex flex-col items-center justify-center text-slate-700 animate-fade-in border border-white/50 rounded-[2rem]">
              <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin shadow-sm"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fa-solid fa-cloud text-blue-500 text-2xl drop-shadow-sm"></i>
                  </div>
              </div>
              <h3 className="font-bold text-xl tracking-tight text-slate-800">{cloudStatus}</h3>
              <p className="text-sm font-medium text-slate-500 mt-2 bg-white/50 px-3 py-1 rounded-full border border-white/50 shadow-sm">Mobile Optimized Rendering</p>
          </div>
      )}

      {/* Simulation Controls Overlay (Top Left) */}
      {viewMode === '3d' && data && (
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-3 pointer-events-none">
            <div className="bg-white/60 px-4 py-2 rounded-2xl border border-white/50 backdrop-blur-2xl shadow-sm flex items-center gap-4 pointer-events-auto">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 tracking-tight">
                    <i className="fa-solid fa-cubes text-blue-500"></i>
                    仿真
                </h3>
                {customPath && <span className="text-[10px] font-bold bg-yellow-100/80 text-yellow-700 px-2 py-0.5 rounded-md border border-yellow-200/50 shadow-sm">LIVE EDIT</span>}
                <div className="w-px h-4 bg-slate-300/50"></div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleTogglePlay}
                        disabled={!data}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm border border-transparent ${!data ? 'opacity-20' : isPlaying ? 'text-orange-600 bg-orange-50/80 hover:bg-orange-100 hover:border-orange-200/50' : 'text-green-600 bg-green-50/80 hover:bg-green-100 hover:border-green-200/50'}`}
                        title={isPlaying ? "暂停" : "继续"}
                    >
                        <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} text-xs`}></i>
                    </button>
                    <button 
                        onClick={handleRestart}
                        disabled={!data}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-blue-600 bg-blue-50/80 hover:bg-blue-100 transition-all shadow-sm border border-transparent hover:border-blue-200/50 ${!data ? 'opacity-20' : ''}`}
                        title="重置"
                    >
                        <i className="fa-solid fa-rotate-left text-xs"></i>
                    </button>
                </div>
                <div className="w-px h-4 bg-slate-300/50"></div>
                <button
                    onClick={handleExportSTL}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 bg-slate-50/80 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-transparent hover:border-blue-200/50"
                    title="导出模型 (STL)"
                >
                    <i className="fa-solid fa-download text-xs"></i>
                </button>
            </div>
            
            {/* Simulation Mode Toggle (Local vs Cloud) */}
            <div className="bg-white/60 p-1.5 rounded-2xl border border-white/50 backdrop-blur-2xl shadow-sm pointer-events-auto flex gap-1">
                <button
                    onClick={() => setSimMode('LOCAL')}
                    className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${simMode === 'LOCAL' ? 'bg-white text-slate-800 shadow-sm border border-white/50' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'}`}
                >
                    <i className="fa-solid fa-laptop"></i> 本地
                </button>
                <button
                    onClick={() => setSimMode('CLOUD')}
                    className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${simMode === 'CLOUD' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 border border-blue-400/50' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'}`}
                >
                    <i className="fa-solid fa-cloud"></i> 云端
                    <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[9px] border border-white/10">PRO</span>
                </button>
            </div>
        </div>
      )}

      {/* Mode Toggle Switch (Top Right) */}
      {data && (
        <div className="absolute top-6 right-6 z-10 flex items-center gap-2 pointer-events-auto">
             <div className="flex items-center bg-white/60 rounded-2xl p-1.5 border border-white/50 shadow-sm backdrop-blur-2xl gap-1">
                <button 
                    onClick={() => setViewMode('3d')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${viewMode === '3d' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 border border-blue-400/50' : 'text-slate-600 hover:bg-white/60'}`}
                >
                    <i className="fa-solid fa-cube"></i> 3D
                </button>
                <button 
                    onClick={() => setViewMode('hmi')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'hmi' ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 border border-orange-400/50' : 'text-slate-600 hover:bg-white/60'}`}
                >
                    <i className="fa-solid fa-desktop"></i> HMI
                </button>
             </div>
        </div>
      )}

      <div className="flex-1 w-full h-full relative overflow-hidden bg-transparent">
           {/* 3D View Container */}
           <div 
             ref={containerRef} 
             className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${viewMode === '3d' ? 'opacity-100 z-1' : 'opacity-0 z-0 pointer-events-none'}`} 
           />
           
           {/* HMI View Container */}
           <div className={`w-full h-full absolute inset-0 transition-opacity duration-300 pt-16 pb-6 px-4 lg:px-12 flex items-center justify-center ${viewMode === 'hmi' ? 'opacity-100 z-1' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="w-full max-w-4xl h-full max-h-[600px] relative shadow-2xl rounded-xl">
                   {data && <HMISimulator data={data} />}
               </div>
           </div>

           {!data && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none bg-white/20 backdrop-blur-sm z-20">
                  <div className="w-24 h-24 bg-white/40 rounded-[2rem] border border-white/50 shadow-sm flex items-center justify-center mb-4 backdrop-blur-md">
                      <i className="fa-solid fa-cube text-5xl opacity-50 drop-shadow-sm"></i>
                  </div>
                  <span className="text-sm font-semibold tracking-wide text-slate-500 bg-white/40 px-4 py-1.5 rounded-full border border-white/50 shadow-sm backdrop-blur-md">等待生成加工数据</span>
              </div>
           )}
      </div>
    </div>
  );
};

export default SimulationPanel;
