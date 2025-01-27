import ollama from 'ollama';
import fs from "fs";

export class DeepseekModelHandler {
  constructor(config) {
    this.modelConfig = config;
    this.userChatHistory = this.initializeChatHistory();
  }

  initializeChatHistory() {
    return [{ 
      role: this.modelConfig.systemRole, 
      content: this.modelConfig.prompt 
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
      const imageBase64Contents = await Promise.all(
        images.map(img => fs.promises.readFile(img.path, { encoding: 'base64' }))
      );

      messages.push({
        role: this.modelConfig.userRole,
        content: message || 'Describe the contents of the image(s)',
        images: imageBase64Contents
      });
    } else {
      messages.push({
        role: this.modelConfig.userRole,
        content: message
      });
    }

    const response = await ollama.chat({
      model: this.modelConfig.model,
      messages: messages,
      stream: true
    });

    return {
      stream: response,
      async processChunks(writeCallback, endCallback) {
        let fullResponse = '';
        for await (const part of response) {
          
          if (!part.done) {
            // console.log(part.message.content);
            fullResponse += part.message.content;
            writeCallback(part.message.content);
          } else {
            writeCallback("[END]");
          }
        }
        endCallback(fullResponse);
      }
    };
  }
}
