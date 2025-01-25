import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import http2 from "http2";
import fs from "fs";
import OpenAI from 'openai';



const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer 설정 (이미지 업로드를 위한 미들웨어)
const upload = multer({ dest: "uploads/" });

const getConfig = () => {
  const filePath = path.join(__dirname, "../", "config.json");
  const jsonData = fs.readFileSync(filePath, "utf8");
  return JSON.parse(jsonData);
};

const config = getConfig();

const client = new OpenAI({
  apiKey: config.ai.gpt.key,
});

const PORT = config.port;

// Serve index.html for root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", config.ai.gpt.template));
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

// 사용자별 대화 히스토리를 저장
const userChatHistory = [
  {
    role: config.ai.gpt.systemRole,
    content: config.prompt,
  },
];

server.on("request", (req, res) => {
  if (req.method === "POST" && req.url === "/process") {
    upload.array("images")(req, res, async (err) => {
      if (err) {
        return res.status(500).json({ error: "File upload failed." });
      }

      try {
        const { message } = req.body;
        const images = req.files;

        if (!message && (!images || images.length === 0)) {
          return res.status(400).json({ error: "Message or images are required." });
        }

        // Add user message
        if (message) {
          userChatHistory.push({
            role: config.ai.gpt.userRole,
            content: message,
          });
        }

        // GPT 요청 생성
        const stream = await client.chat.completions.create({
          model: config.ai.gpt.model35turbo,
          messages: [{ role: config.ai.gpt.userRole, content: userChatHistory }],
          stream: true,
        });

        res.setHeader("Content-Type", "text/plain");

        for await (const chunk of stream) {
          const chunkText = chunk.choices[0]?.delta?.content || '';
          
          console.log({chunkText});
          if (chunkText) {
            fullResponse += chunkText;

            // Send the chunk to the client
            res.write(`${chunkText}\n\n`);
          }
        }

        // const reader = response.data.pipeThrough(new TextDecoderStream()).getReader();
        // let fullResponse = "";

        // while (true) {
        //   const { value, done } = await reader.read();
        //   if (done) break;

        //   const parsed = JSON.parse(value);
        //   if (parsed.choices && parsed.choices.length > 0) {
        //     const content = parsed.choices[0].delta.content;
        //     if (content) {
        //       fullResponse += content;
        //       res.write(content);
        //     }
        //   }
        // }

        userChatHistory.push({
          role: config.ai.gpt.assistRole,
          content: fullResponse,
        });

        // Clean up uploaded files
        if (images && images.length > 0) {
          images.forEach((img) =>
            fs.unlink(img.path, (err) => {
              if (err) console.error("Error deleting file:", err);
            })
          );
        }

        res.end();
      } catch (error) {
        console.error("Processing error:", error);
        res.status(500).json({ error: "An error occurred while processing your request." });
      }
    });
  } else if (req.method === "GET" && req.url === "/") {
    const indexPath = path.join(__dirname, "../public", config.ai.gpt.template);
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end("Error loading template");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      }
    });
  }
});
