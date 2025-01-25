import express from "express";
import cors from "cors";
import multer from "multer";
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

// Multer 설정 (이미지 업로드를 위한 미들웨어)
const upload = multer({ dest: 'uploads/' });

const getConfig = () => {
  const filePath = path.join(__dirname, '../', 'config.json');
  const jsonData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(jsonData);
};

const config = getConfig();

const PORT = config.port;

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', config.ai.gemini.template));
});

// HTTP/2 서버 옵션
const serverOptions = {
  key: fs.readFileSync(config.files.key),
  cert: fs.readFileSync(config.files.crt),
};

const server = http2.createSecureServer(serverOptions);

server.listen(PORT, () => {
  console.log(`HTTP/2 Server is running at https://localhost:${PORT}`);
});

// Google Generative AI 초기화
const genAI = new GoogleGenerativeAI(config.ai.gemini.key);
const model = genAI.getGenerativeModel({
  model: config.ai.gemini.model,
  systemInstruction: config.prompt,
});

// 사용자별 대화 히스토리를 저장
const userChatHistory = [];

// 이미지 파일을 Google Gemini API가 지원하는 형식으로 변환
const fileToGenerativePart = (path, mimeType) => ({
  inlineData: {
    data: Buffer.from(fs.readFileSync(path)).toString("base64"),
    mimeType,
  },
});

server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/stream') {
    upload.array('images')(req, res, async (err) => {
      if (err) {
        return res.status(500).json({ error: "File upload failed." });
      }

      try {
        const { message } = req.body;
        const images = req.files;
        const parts = [];

        if (!message && (!images || images.length === 0)) {
          res.status(400).json({ error: "Message or images are required." });
          return;
        }

        // 멀티모달 입력 생성
        const inputs = [];
        if (message) {
          inputs.push(message);
          parts.push({text: message});
        }
        if (images && images.length > 0) {
          for (const img of images) {
            const mimeType = img.mimetype;
            const imagePart = fileToGenerativePart(img.path, mimeType);
            inputs.push(imagePart);
            parts.push(imagePart);
          }
        }

        // 대화 히스토리에 사용자 입력 추가
        userChatHistory.push({ role: config.ai.gemini.userRole, parts: parts });

        // Google Gemini API와 대화 세션 시작
        const chatSession = model.startChat({
          history: userChatHistory,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          },
        });

        // SSE 헤더 설정
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // 메시지 스트리밍
        const result = await chatSession.sendMessageStream(inputs);
        let fullResponse = '';

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullResponse += chunkText;
            res.write(`data: ${chunkText}\n\n`);
          }
        }

        // 대화 히스토리에 응답 추가
        userChatHistory.push({
          role: config.ai.gemini.assistRole,
          parts: [{ text: fullResponse }],
        });

        // 업로드된 파일 삭제
        if (images && images.length > 0) {
          images.forEach((img) => {
            fs.unlink(img.path, (err) => {
              if (err) console.error('Error deleting file:', err);
            });
          });
        }

        res.write('data: [END]\n\n');
        res.end();
      } catch (error) {
        console.error('Error during request processing:', error);
        res.status(500).json({ error: 'An error occurred during processing.' });
      }
    });
  } else if (req.method === 'GET' && req.url === '/') {
    const indexPath = path.join(__dirname, '../public', config.ai.gemini.template);
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading template');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      }
    });
  }
});
