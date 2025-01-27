import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

export class GoogleModelHandler {
  constructor(config, prompt) {
    this.modelConfig = config;
    this.userChatHistory = this.initializeChatHistory();
    this.genAI = new GoogleGenerativeAI(config.key);
    this.model = this.genAI.getGenerativeModel({
      model: config.model,
      systemInstruction: prompt
    });
  }

  initializeChatHistory() {
    return [];
  }

  fileToGenerativePart(path, mimeType) {
    return {
      inlineData: {
        data: Buffer.from(fs.readFileSync(path)).toString("base64"),
        mimeType,
      },
    };
  }

  async processRequest(content, message, images) {
    const parts = [];
    const inputs = [];

    if(content) {
      this.userChatHistory.push({
        role: this.modelConfig.assistRole,
        parts: [{ text: content }]
      });
    }

    if (message) {
      inputs.push(message);
      parts.push({ text: message });
    }

    if (images && images.length > 0) {
      for (const img of images) {
        const mimeType = img.mimetype;
        const imagePart = this.fileToGenerativePart(img.path, mimeType);
        inputs.push(imagePart);
        parts.push(imagePart);
      }
    }

    this.userChatHistory.push({ 
      role: this.modelConfig.userRole, 
      parts: parts 
    });

    const chatSession = this.model.startChat({
      history: this.userChatHistory,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await chatSession.sendMessageStream(inputs);
    let fullResponse = '';

    return {
      stream: result.stream,
      async processChunks(writeCallback, endCallback) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          // console.log({chunkText});
          if (chunkText) {
            fullResponse += chunkText;
            writeCallback(chunkText);
          }
        }
        writeCallback("[END]");
        endCallback(fullResponse);
      }
    };
  }
}
