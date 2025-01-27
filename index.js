import fs from 'fs';
import { createServer } from './server/server.js';
import { GoogleModelHandler } from './ai-models/gemini.js';
import { OpenAIModelHandler } from './ai-models/gpt.js';
import { OllamaModelHandler } from './ai-models/llama.js';
import { DeepseekModelHandler } from './ai-models/deepseek.js';

// Read configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Select appropriate model handler based on configuration
let modelHandler;
switch(config.activeModel) {
  case 'gemini':
    modelHandler = new GoogleModelHandler(config.ai.gemini, config.prompt);
    break;
  case 'gpt':
    modelHandler = new OpenAIModelHandler(config.ai.gpt, config.prompt);
    break;
  case 'llama':
    modelHandler = new OllamaModelHandler(config.ai.llama, config.prompt);
    break;
  case 'deepseek':
    modelHandler = new DeepseekModelHandler(config.ai.deepseek, config.prompt);
    break;
  default:
    throw new Error(`Unsupported model: ${config.activeModel}`);
}


// Create and start the server
createServer(config, modelHandler);