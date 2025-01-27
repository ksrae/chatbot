import OpenAI from 'openai';
import fs from "fs";

export class OpenAIModelHandler {
  constructor(config) {
    this.config = config;
    this.userChatHistory = this.initializeChatHistory();
    this.client = new OpenAI({ apiKey: config.key });
  }

  initializeChatHistory() {
    return [{ 
      role: this.config.systemRole, 
      content: this.config.prompt 
    }];
  }

  async processRequest(content, message, images) {
    const messages = [...this.userChatHistory];
    
    if(content) {
      this.userChatHistory.push({
        role: this.modelConfig.assistRole,
        content
      });
    }


    if (images && images.length > 0) {
      const imageContents = await Promise.all(
        images.map(img => fs.promises.readFile(img.path, { encoding: 'base64' }))
      );
      
      messages.push({
        role: this.config.userRole,
        content: [
          { type: 'text', text: message || 'Describe the image' },
          ...imageContents.map(base64 => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` }
          }))
        ]
      });
    } else {
      messages.push({
        role: this.config.userRole,
        content: message
      });
    }

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: messages,
      stream: true
    });

    return {
      stream,
      async processChunks(writeCallback, endCallback) {
        let fullResponse = '';
        for await (const chunk of stream) {
          const chunkText = chunk.choices[0]?.delta?.content || '';
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
