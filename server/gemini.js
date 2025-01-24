import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import http2 from "http2";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getConfig = () => {
  const filePath = path.join(__dirname, '../', 'config.json');
  const jsonData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(jsonData);
};

const config = getConfig();

const PORT = 3000;

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'gemini.html'));
});

// HTTP/2 서버 옵션
const serverOptions = {
  key: fs.readFileSync(config.files.key),
  cert: fs.readFileSync(config.files.crt)
};

const server = http2.createSecureServer(serverOptions);

server.listen(PORT, () => {
  console.log(`HTTP/2 Server is running at https://localhost:${PORT}`);
});





const genAI = new GoogleGenerativeAI(config.ai.gemini.key);
const model = genAI.getGenerativeModel({ 
  model: config.ai.gemini.model,
  systemInstruction: "You are a helpful assistant that maintains conversation context."
});

// 사용자별 대화 히스토리를 저장
const userChatHistory = [];
let chat = model.startChat({
  history: userChatHistory,
  generationConfig: {
    maxOutputTokens: 1000,
    temperature: 0.7,
  }
});



server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/stream') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);

        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: "Message is required." }));
          return;
        }

        // Initialize chat session with the passed history reference
        const chatSession = model.startChat({
          history: userChatHistory, // Sharing the global history (not duplicated)
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          }
        });

        // Server-sent events (SSE) headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Stream response
        const result = await chatSession.sendMessageStream(message);
        let fullResponse = '';

        // Structuring responses to avoid duplication
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullResponse += chunkText;

            // Send the chunk to the client
            res.write(`data: ${chunkText}\n\n`);
          }
        }

        // Save the completed message (only after full stream)
        userChatHistory.push(
          { role: config.ai.gemini.userRole, parts: [{ text: message }] },
          { role: config.ai.gemini.assistRole, parts: [{ text: fullResponse }] },
        );

        // Signal end of stream (SSE format)
        res.write('data: [END]\n\n');
        res.end();
      } catch (error) {
        console.error("Streaming error:", error);
        res.write(`data: Error: ${error.message}\n\n`);
        res.end();
      }
    });
  } else if (req.method === 'GET' && req.url === '/') {
    const indexPath = path.join(__dirname, '../public', 'gemini.html');
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading gemini.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      }
    });
  }
});
