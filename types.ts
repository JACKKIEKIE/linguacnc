
export enum MachineOperationType {
  CIRCULAR_POCKET = 'CIRCULAR_POCKET',
  RECTANGULAR_POCKET = 'RECTANGULAR_POCKET',
  BOSS_MILLING = 'BOSS_MILLING', // 新增：凸台/岛屿加工
  DRILL = 'DRILL',
  FACE_MILL = 'FACE_MILL',
  CONTOUR = 'CONTOUR',
  GENERAL_CHAT = 'GENERAL_CHAT',
  RUN_MYSCREEN = 'RUN_MYSCREEN',
  UNKNOWN = 'UNKNOWN'
}

export enum ToolType {
  END_MILL = 'END_MILL',
  BALL_MILL = 'BALL_MILL',
  DRILL = 'DRILL',
  FACE_MILL = 'FACE_MILL'
}

export interface Tool {
  id: string;
  name: string;
  type: ToolType;
  diameter: number;
  description?: string;
}

export interface StockDimensions {
  shape: 'RECTANGULAR' | 'CYLINDRICAL';
  width: number;
  length: number;
  height: number;
  diameter: number;
  material: string;
}

// New Segment Type for Arcs
export type SegmentType = 'LINE' | 'ARC_CW' | 'ARC_CCW';

export interface PathSegment {
  type: SegmentType;
  x: number;      // End point X
  y: number;      // End point Y
  cx?: number;    // Center X (for Arcs)
  cy?: number;    // Center Y (for Arcs)
  radius?: number;// Optional Radius fallback
}

export interface OperationParams {
  type: MachineOperationType;
  x: number; // Start X or Center X
  y: number; // Start Y or Center Y
  z_start: number;
  z_depth: number;
  diameter?: number; 
  width?: number; 
  length?: number; 
  
  // Replaced simple points with Segments
  path_segments?: PathSegment[]; 
  
  feed_rate: number;
  spindle_speed: number;
  tool_diameter: number;
  tool_type: ToolType;
  step_down: number;
  
  // For Boss Milling
  corner_radius?: number; 
  boss_shape?: 'RECTANGULAR' | 'CYLINDRICAL';
}

export interface SafetyAuditResult {
  passed: boolean;
  score: number; // 0-100
  issues: {
    severity: 'critical' | 'warning' | 'info';
    line?: number;
    message: string;
    suggestion?: string;
  }[];
}

export interface CNCOutput {
  gcode: string;
  explanation: string;
  operations: OperationParams[];
  stock: StockDimensions;
  isScreen?: boolean; // Flag to identify Run MyScreen code
  audit?: SafetyAuditResult; // Optional audit result
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  attachment?: string;
  cncResult?: CNCOutput;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  cncData: CNCOutput | null;
  operations: OperationParams[];
  stock: StockDimensions;
}

export type AppMode = 'GENERATE' | 'OPTIMIZE' | 'OMNI' | 'SCREEN';
export type ModelOption = 'auto' | 'qwen-max' | 'qwen-plus' | 'qwen-turbo' | 'mimo-v2-flash' | 'qwen-max-latest' | 'qwen-plus-latest' | 'qwen-turbo-latest' | 'qwen3.5-plus' | 'qwen3.5-flash' | 'gemini-2.5-flash' | 'gemini-2.0-flash';
export type SimulationMode = 'LOCAL' | 'CLOUD';
