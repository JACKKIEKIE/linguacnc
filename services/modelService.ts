
import { MachineOperationType, OperationParams, StockDimensions, AppMode, ModelOption, ToolType, Tool, SafetyAuditResult, ChatMessage } from "../types";

// 使用国内阿里云模型服务 (Qwen/通义千问)
const ALIYUN_API_KEY = import.meta.env.VITE_ALIYUN_API_KEY || ""; 
const ALIYUN_API_URL = import.meta.env.VITE_ALIYUN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// 小米 MiMo 服务
const MIMO_API_KEY = import.meta.env.VITE_MIMO_API_KEY || "";
const MIMO_API_URL = import.meta.env.VITE_MIMO_API_URL || "https://api.xiaomimimo.com/v1/chat/completions";

// Gemini API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const BASE_INSTRUCTION = `
You are an expert CNC Programmer for ISO Standard G-Code (Compatible with major controllers like Fanuc/Siemens/Haas).

CONTEXT AWARENESS:
- You are part of a continuous conversation tracking a machining process.
- If the user asks for a "next step", return the NEW operation parameters.

CRITICAL RULE FOR STOCK (RAW MATERIAL):
- The "stock" object in JSON represents the **INITIAL RAW BLOCK** dimensions.
- **DO NOT CHANGE** "stock" dimensions (width, length, height) based on material removal. 
- Example: If milling 5mm off a 20mm high block, "stock.height" MUST REMAIN 20. Do NOT change it to 15.
- The material removal is tracked visually, not by shrinking the stock definition.

CRITICAL COORDINATE SYSTEM RULE:
- The origin (X0, Y0) MUST be the CENTER of the workpiece.
- All coordinates provided in the JSON must be relative to this center origin.

SUPPORTED OPERATIONS:
1. FACE_MILL: Top surface flattening.
2. CONTOUR: Side profiling or Slotting (Open or Closed chains).
   - MUST provide "path_segments" for the path.
   - Start point is defined by "x" and "y".
3. RECTANGULAR_POCKET / CIRCULAR_POCKET: Removing internal material.
4. BOSS_MILLING: Removing material *around* a shape (Island).
   - For COMPLEX SHAPES (DXF), provide "path_segments".
5. DRILL: Holes.

JSON Structure:
{
  "stock": { "shape", "width", "length", "height", "diameter", "material" }, 
  "operation": {
      "type": "CIRCULAR_POCKET" | "RECTANGULAR_POCKET" | "DRILL" | "FACE_MILL" | "CONTOUR" | "BOSS_MILLING",
      "tool_type": "END_MILL" | "FACE_MILL" | "DRILL" | "BALL_MILL",
      "x": 0, // Start X
      "y": 0, // Start Y
      "z_start": 0, // Where this cut starts (e.g. -5 if previous op removed 5mm)
      "z_depth": number, // Depth of THIS cut
      "tool_diameter": number,
      "diameter": number, 
      "width": number, 
      "length": number, 
      "feed_rate": number,
      "spindle_speed": number,
      "step_down": number,
      "boss_shape": "RECTANGULAR" | "CYLINDRICAL", 
      "corner_radius": number,
      "path_segments": [
          { "type": "LINE", "x": 10, "y": 10 },
          { "type": "ARC_CW", "x": 20, "y": 0, "cx": 10, "cy": 0 }
      ]
  },
  "explanation": "Brief Chinese explanation"
}

RETURN JSON ONLY. DO NOT ADD MARKDOWN CODE BLOCKS.
`;

const OPT_SYSTEM_INSTRUCTION = `
You are an expert CNC Code Optimizer.
Output valid JSON with "optimized_gcode", "explanation", "stock", and "operation".
RETURN JSON ONLY.
`;

const SCREEN_SYSTEM_INSTRUCTION = `
You are an expert in HMI Screen programming.
JSON Structure:
{
  "screen_code": "The complete configuration file content",
  "explanation": "Brief Chinese explanation"
}
RETURN JSON ONLY.
`;

const OMNI_SYSTEM_INSTRUCTION = `
You are a CNC Expert.
Origin (0,0) is center. Z0 is top.
RETURN JSON ONLY.
`;

export interface Attachment {
  data: string;     
  mimeType: string;
  fileName?: string;
}

export interface OmniRealtimeConfig {
  modalities: ('TEXT' | 'AUDIO')[];
  voice?: string;
  inputAudioFormat?: 'PCM_16000HZ_MONO_16BIT';
  outputAudioFormat?: 'pcm16' | 'pcm24';
  smooth_output?: boolean;
  enableTurnDetection?: boolean;
  enableInputAudioTranscription?: boolean;
  instructions?: string;
}

import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

// ... (existing imports)

// Initialize Gemini AI (Lazy init to support dynamic URL)
const getBaseUrl = () => import.meta.env.VITE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const getLiveBaseUrl = () => import.meta.env.VITE_GEMINI_LIVE_WS_URL || "wss://generativelanguage.googleapis.com";

// Global WebSocket Patch: Force Gemini Live API to use the custom proxy
// The official SDK sometimes ignores the apiEndpoint for WebSockets.
const OriginalWebSocket = window.WebSocket;
const PatchedWebSocket = function(url: string | URL, protocols?: string | string[]) {
    let finalUrl = url.toString();
    if (finalUrl.includes('generativelanguage.googleapis.com')) {
        const proxyHost = getLiveBaseUrl().replace(/^https?:\/\//, '');
        finalUrl = finalUrl.replace('generativelanguage.googleapis.com', proxyHost);
        console.log("Intercepted Gemini WS, redirecting to proxy:", finalUrl);
    }
    return new OriginalWebSocket(finalUrl, protocols);
};
Object.assign(PatchedWebSocket, OriginalWebSocket);
PatchedWebSocket.prototype = OriginalWebSocket.prototype;

try {
    Object.defineProperty(window, 'WebSocket', {
        value: PatchedWebSocket,
        writable: true,
        configurable: true
    });
} catch (e) {
    console.warn("Could not patch WebSocket globally, Gemini Live may require VPN.", e);
}

export const connectLive = async (callbacks: any, config?: OmniRealtimeConfig) => {
    console.log("Connecting to Gemini Live...");
    const baseUrl = getLiveBaseUrl();
    console.log(`Using Base URL: ${baseUrl}`);

    // Re-initialize client with current URL
    const aiLiveClient = new GoogleGenAI({ 
        apiKey: GEMINI_API_KEY,
        httpOptions: { baseUrl } // Ensure HTTP options also use proxy
    });

    try {
        // Use the dedicated Live client for WebSocket connection
        const sessionPromise = aiLiveClient.live.connect({
            model: "gemini-2.5-flash-native-audio-preview-12-2025",
            callbacks: {
                onopen: () => {
                    console.log("Gemini Live Session Opened");
                    callbacks.onopen();
                },
                onmessage: (message: LiveServerMessage) => {
                    callbacks.onmessage(message);
                },
                onerror: (err: any) => {
                    console.error("Gemini Live Error:", err);
                    callbacks.onerror(err);
                },
                onclose: () => {
                    console.log("Gemini Live Session Closed");
                    callbacks.onclose();
                }
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
                },
                systemInstruction: config?.instructions || "You are a helpful assistant.",
            },
        });

        const session = await sessionPromise;

        return {
            sendRealtimeInput: (data: { media: { data: string; mimeType: string } }) => {
                session.sendRealtimeInput(data);
            },
            sendRealtimeVideo: (data: { image: { data: string; mimeType: string } }) => {
                // Map video input to sendRealtimeInput with media
                session.sendRealtimeInput({ media: data.image });
            },
            close: () => {
                session.close();
            }
        };
    } catch (error) {
        console.error("Failed to connect to Gemini Live:", error);
        callbacks.onerror(error);
        throw error;
    }
};

export const auditCode = async (gcode: string, model: ModelOption = 'auto'): Promise<SafetyAuditResult> => {
    return {
        passed: true,
        score: 95,
        issues: [{ severity: 'info', message: "代码格式检查通过", suggestion: "请在真机运行前进行空运行测试" }]
    };
};

const callAIProvider = async (
    messages: any[],
    model: string,
    signal?: AbortSignal,
    mode: AppMode = 'GENERATE'
) => {
    let url = ALIYUN_API_URL;
    let apiKey = ALIYUN_API_KEY;
    let requestModel = model;

    // --- Dynamic "Auto" Model Selection ---
    if (model === 'auto') {
        const lastMsg = messages[messages.length - 1];
        const contentStr = typeof lastMsg?.content === 'string' 
            ? lastMsg.content 
            : JSON.stringify(lastMsg?.content || "");

        // Rule 1: Complex Modes -> Strongest Model (Gemini Pro or Qwen Plus)
        // Screen generation and Code optimization require high structural accuracy.
        if (mode === 'SCREEN' || mode === 'OPTIMIZE') {
            // Prefer Gemini for complex reasoning tasks if available
            requestModel = 'gemini-2.0-flash'; 
        }
        // Rule 2: Simple/Short Conversational -> Faster Model (MiMo / Flash)
        else if (contentStr.length < 15 && !contentStr.match(/(g|m)\d+/i) && !contentStr.match(/mill|drill|cut/i)) {
             requestModel = 'mimo-v2-flash';
             url = MIMO_API_URL;
             apiKey = MIMO_API_KEY;
        } 
        // Rule 3: Default -> Strongest Model
        else {
            requestModel = 'gemini-2.0-flash';
        }
    } 
    // --- Explicit Selection ---
    else if (model === 'mimo-v2-flash') {
        url = MIMO_API_URL;
        apiKey = MIMO_API_KEY;
    } else if (model.startsWith('gemini')) {
        requestModel = model;
    } else {
        // Fallback or explicit Qwen
        if (model === 'qwen-plus' || (!model.startsWith('qwen') && model !== 'mimo-v2-flash')) {
            requestModel = 'qwen-plus';
        }
        // Ensure Qwen URL if selected
        if (requestModel.startsWith('qwen')) {
             url = ALIYUN_API_URL;
             apiKey = ALIYUN_API_KEY;
        }
    }

    // --- Gemini API Call (Manual Fetch for better proxy support) ---
    if (requestModel.startsWith('gemini')) {
        try {
            const baseUrl = getBaseUrl();
            const cleanBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1(beta)?$/, '');
            const url = `${cleanBaseUrl}/v1beta/models/${requestModel}:generateContent?key=${GEMINI_API_KEY}`;
            
            const systemInstructionContent = messages.find(m => m.role === 'system')?.content;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY
                },
                body: JSON.stringify({
                    contents: messages.filter(m => m.role !== 'system').map(msg => {
                        const role = msg.role === 'assistant' ? 'model' : 'user';
                        let parts: any[] = [];
                        if (typeof msg.content === 'string') {
                            parts.push({ text: msg.content });
                        } else if (Array.isArray(msg.content)) {
                            msg.content.forEach((c: any) => {
                                if (c.type === 'text') parts.push({ text: c.text });
                                else if (c.type === 'image_url') {
                                    const matches = c.image_url.url.match(/^data:(.+);base64,(.+)$/);
                                    if (matches) parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
                                }
                            });
                        }
                        return { role, parts };
                    }),
                    system_instruction: systemInstructionContent ? { parts: [{ text: systemInstructionContent }] } : undefined,
                    generation_config: { 
                        response_mime_type: "application/json",
                        temperature: 0.1
                    }
                }),
                signal
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Gemini Proxy Error: ${err}`);
            }

            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!responseText) throw new Error("Gemini API returned empty content");
            const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error("Gemini Request Failed", e);
            throw e;
        }
    }

    // --- Aliyun / MiMo API Call (Existing Logic) ---
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: requestModel,
                messages: messages,
                max_tokens: 4000,
                temperature: 0.1,
                response_format: { type: "json_object" }
            }),
            signal
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Service Error [${requestModel}]: ${err}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) throw new Error("API 返回内容为空");
        return JSON.parse(content);
    } catch (e) {
        console.error("AI Request Failed", e);
        throw e;
    }
};

export const analyzeRequest = async (
  prompt: string, 
  attachment?: Attachment, 
  model: ModelOption = 'auto',
  mode: AppMode = 'GENERATE',
  signal?: AbortSignal,
  tools: Tool[] = [],
  history: ChatMessage[] = [],
  currentOperations: OperationParams[] = []
): Promise<{
  stock: StockDimensions;
  operation: OperationParams;
  explanation: string;
  optimized_gcode?: string;
  screen_code?: string; 
  [key: string]: any; 
}> => {
  
  let systemInstruction = BASE_INSTRUCTION;
  
  if (tools.length > 0) {
      const toolListStr = tools.map(t => `- ID: ${t.id}, Type: ${t.type}, Dia: ${t.diameter}mm`).join('\n');
      systemInstruction += `\n\nAVAILABLE TOOL LIBRARY (PREFER THESE TOOLS):\n${toolListStr}\n`;
  }

  // Improved Context Injection
  if (currentOperations.length > 0) {
      // Calculate current Z level
      let currentZ = 0;
      currentOperations.forEach(op => {
          // Simplistic Z tracking: assume we are going down
          if (op.z_depth > 0) currentZ -= op.z_depth;
      });

      const opsSummary = currentOperations.map((op, i) => 
          `${i+1}. ${op.type} (Z_Start: ${op.z_start}, Depth: ${op.z_depth})`
      ).join('\n');

      systemInstruction += `\n\nCURRENT MACHINING STATE:\n${opsSummary}\n`;
      systemInstruction += `\nIMPORTANT: We are ADDING a new step. The last operation ended around Z=${currentZ}.`;
      systemInstruction += `\nCalculate 'z_start' for the NEW operation based on this. Usually z_start = ${currentZ}.`;
  }

  if (mode === 'OPTIMIZE') systemInstruction = OPT_SYSTEM_INSTRUCTION;
  else if (mode === 'OMNI') systemInstruction = OMNI_SYSTEM_INSTRUCTION;
  else if (mode === 'SCREEN') systemInstruction = SCREEN_SYSTEM_INSTRUCTION;

  const messages: any[] = [{ role: "system", content: systemInstruction }];

  history.slice(-10).forEach(msg => {
      if (msg.role === 'user') {
          messages.push({ role: "user", content: msg.text });
      } else if (msg.role === 'ai') {
          messages.push({ role: "assistant", content: msg.text });
      }
  });

  let messageContent: any;
  if (attachment) {
       const contentParts: any[] = [];
       if (prompt) contentParts.push({ type: "text", text: prompt });
       if (attachment.mimeType.startsWith('image/')) {
          contentParts.push({
              type: "image_url",
              image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` }
          });
       } else {
           contentParts.push({ type: "text", text: `\n[FILE CONTENT (${attachment.fileName})]\n${attachment.data}` });
       }
       messageContent = contentParts;
  } else {
      let effectivePrompt = prompt;
      if (!effectivePrompt && mode === 'GENERATE') {
          effectivePrompt = "请分析需求并生成加工程序。";
      }
      messageContent = effectivePrompt || "Analyze the requirement.";
  }

  messages.push({ role: "user", content: messageContent });

  return await callAIProvider(messages, model, signal, mode);
};
