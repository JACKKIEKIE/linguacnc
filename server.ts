import express from 'express';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 3000;

// Helper to clean environment variables (remove quotes and trim)
const cleanEnv = (val: string | undefined, defaultVal: string) => {
    if (!val) return defaultVal;
    const cleaned = val.replace(/^["']|["']$/g, '').trim();
    // If it's the literal docker-compose variable string, use default
    if (cleaned.startsWith('${') && cleaned.endsWith('}')) return defaultVal;
    return cleaned || defaultVal;
};

// Securely store the API key on the backend
// It will read from the .env file or environment variables
const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY, "");
const GEMINI_BASE_URL = cleanEnv(process.env.GEMINI_BASE_URL, "https://generativelanguage.googleapis.com");
const GEMINI_LIVE_WS_URL = cleanEnv(process.env.GEMINI_LIVE_WS_URL, "wss://generativelanguage.googleapis.com");

// Increase payload limit for images
app.use(express.json({ limit: '50mb' }));

// Proxy endpoint for standard Gemini text/image generation
app.post('/api/gemini/generate', async (req, res) => {
    try {
        const { model, contents, system_instruction, generation_config } = req.body;
        
        // Ensure GEMINI_BASE_URL is a valid URL string
        let baseUrl = GEMINI_BASE_URL;
        try {
            new URL(baseUrl);
        } catch (e) {
            console.warn(`Invalid GEMINI_BASE_URL: '${baseUrl}', falling back to default.`);
            baseUrl = "https://generativelanguage.googleapis.com";
        }

        // Construct the real URL with the secure API key
        const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            },
            body: JSON.stringify({ contents, system_instruction, generation_config })
        });
        
        if (!response.ok) {
            const err = await response.text();
            return res.status(response.status).send(err);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error: any) {
        console.error("Generate Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const server = http.createServer(app);

// WebSocket Proxy for Gemini Live API
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/api/gemini/live')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Extract the target path from the local proxy URL
            // e.g., /api/gemini/live/ws/google.ai.generativelanguage...
            let targetPath = request.url!.replace('/api/gemini/live', '');
            if (!targetPath.startsWith('/')) {
                targetPath = '/' + targetPath;
            }
            
            try {
                // Ensure GEMINI_LIVE_WS_URL is a valid URL string
                let baseUrl = GEMINI_LIVE_WS_URL;
                try {
                    new URL(baseUrl);
                } catch (e) {
                    console.warn(`Invalid GEMINI_LIVE_WS_URL: '${baseUrl}', falling back to default.`);
                    baseUrl = "wss://generativelanguage.googleapis.com";
                }

                // Construct the real WebSocket URL
                const realUrl = new URL(targetPath, baseUrl);
                
                // Replace the dummy key from the client with the real secure key
                realUrl.searchParams.set('key', GEMINI_API_KEY);
                
                console.log("Proxying WebSocket connection to:", realUrl.origin + realUrl.pathname);
                
                const targetWs = new WebSocket(realUrl.toString());
                const messageBuffer: any[] = [];
            
            targetWs.on('open', () => {
                while (messageBuffer.length > 0) {
                    targetWs.send(messageBuffer.shift());
                }
            });
            
            // Forward messages from Client -> Gemini
            ws.on('message', (msg) => {
                if (targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(msg);
                } else if (targetWs.readyState === WebSocket.CONNECTING) {
                    messageBuffer.push(msg);
                }
            });
            
            // Forward messages from Gemini -> Client
            targetWs.on('message', (msg) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(msg);
                }
            });
            
            targetWs.on('close', () => {
                if (ws.readyState === WebSocket.OPEN) ws.close();
            });
            
            ws.on('close', () => {
                if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
                    targetWs.close();
                }
            });
            
            targetWs.on('error', (err: any) => {
                if (err.message !== 'WebSocket was closed before the connection was established') {
                    console.error('Target WS Error:', err);
                }
                if (ws.readyState === WebSocket.OPEN) ws.close();
            });
            
            ws.on('error', (err) => {
                console.error('Client WS Error:', err);
                if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
                    targetWs.close();
                }
            });
            } catch (error) {
                const fs = require('fs');
                fs.appendFileSync('ws-error.log', `Failed to construct WebSocket URL: ${error}\ntargetPath: ${targetPath}\nbase: '${GEMINI_LIVE_WS_URL}'\n\n`);
                console.error("Failed to construct WebSocket URL:", error, "targetPath:", targetPath, "base:", GEMINI_LIVE_WS_URL);
                ws.close(1011, "Internal Server Error: Invalid URL");
            }
        });
    }
});

async function startServer() {
    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa'
        });
        app.use(vite.middlewares);
    } else {
        // In production, serve static files from dist
        app.use(express.static('dist'));
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
