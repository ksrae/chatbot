import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import http2 from "http2";
import fs from "fs";

export function createServer(config, modelHandler) {
  const app = express();
  app.use(cors());
  app.use(express.static('public'));
  app.use(express.json());

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const upload = multer({ dest: 'uploads/' });

  const serverOptions = {
    key: fs.readFileSync(config.files.key),
    cert: fs.readFileSync(config.files.crt)
  };

  const activeModel = config.activeModel;
  const server = http2.createSecureServer(serverOptions);
  let responseMessage = '';

  server.listen(config.port, () => {
    console.log(`HTTP/2 Server is running at https://localhost:${config.port}`);
  });

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

          // console.log('request:', { message, images });
          const processResult = await modelHandler.processRequest(responseMessage, message, images);

          res.setHeader('Content-Type', 'text/plain');
          
          await processResult.processChunks(
            (chunk) => res.write(chunk),
            (fullResponse) => {
              responseMessage = fullResponse;
              // Clean up uploaded files
              if (images && images.length > 0) {
                images.forEach(img => fs.unlink(img.path, (err) => {
                  if (err) console.error('Error deleting file:', err);
                }));
              }
              res.end();
            }
          );

        } catch (error) {
          console.error('Processing error:', error);
          res.status(500).json({ error: 'An error occurred while processing your request.' });
        }
      });
    } else if (req.method === 'GET' && req.url === '/') {
      const indexPath = path.join(__dirname, '../public', config.ai[activeModel].template);
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

  return server;
}

// export default createServer;