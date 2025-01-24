import express from "express";
import cors from "cors";
import multer from "multer";
import ollama from 'ollama';
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

const PORT = 3001;

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'llama.html'));
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

// 사용자별 대화 히스토리를 저장
const userChatHistory = [
  { 
    role: "system", 
    content: `
    You're a professional and friendly assistant. Always speak in a polite and respectful tone. 
    If you're responding specially in Korean, be sure to consistently use honorifics like '입니다', '입니까', '계십니다', '하십시오' and maintain a respectful language. Provide helpful information using professional, clear language
    `
  }
];

server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/process') {
    upload.array('images')(req, res, async (err) => {
      if (err) {
        return res.status(500).json({ error: "File upload failed." });
      }

      try {
        const { message } = req.body;
        const images = req.files;

        if (!message && (!images || images.length === 0)) {
          return res.status(400).json({ error: "Message or images are required." });
        }

        // Add images to the messages if present
        if (images && images.length > 0) {
          const imageBase64Contents = await Promise.all(images.map(async (img) => {
            // Read image file and convert to base64
            return fs.promises.readFile(img.path, { encoding: 'base64' });
          }));

          // Add image analysis request
          userChatHistory.push({
            role: config.ai.llama.userRole,
            content: message || 'Describe the contents of the image(s)',
            images: imageBase64Contents
          });
        } else {
          // If no images, just send the text message
          userChatHistory.push({
            role: config.ai.llama.userRole,
            content: message
          });
        }

        // Stream response from Ollama
        const response = await ollama.chat({
          model: 'llama3.2-vision:latest',
          messages: userChatHistory,
          stream: true
        });

        res.setHeader('Content-Type', 'text/plain');
        let fullResponse = '';

        for await (const part of response) {
          const returnValue = JSON.stringify({ 
            content: part.message.content, 
            done: part.done 
          });
          
          if (part.message.content) {
            fullResponse += part.message.content;
          }

          userChatHistory.push({
            role: config.ai.llama.assistantRole,
            content: fullResponse
          });

          res.write(returnValue);
        }

        // Clean up uploaded files
        if (images && images.length > 0) {
          images.forEach(img => fs.unlink(img.path, (err) => {
            if (err) console.error('Error deleting file:', err);
          }));
        }

        res.end();

      } catch (error) {
        console.error('Processing error:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
      }
    });
  } else if (req.method === 'GET' && req.url === '/') {
    const indexPath = path.join(__dirname, '../public', 'llama.html');
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading llama.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      }
    });
  }
});
