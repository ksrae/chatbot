# Chatbot
supporting llama, deepseek-r1, gemini.

# Model
- llama3.2-vision
- deepseek-r1:32b
- gemini-1.5-flash

# How to install
To use llama and deepseek, install Ollama and run deepseek and llama model.
To install ollama, read [ollama site](https://ollama.com/)

To use gemini, gemini API key is required. It is free.
To get gemini API, visit [gemini](https://ai.google.dev/gemini-api/docs/quickstart)

# Setting config
Add api to ai / gemini / key.
If you change model, this may not work because of different response form from default supporting models.
Therefore, I suggest not to change model.

# npm install
```
npm i @google/generative-ai cors express highlight.js multer ollama 
```

# How to run

## llama
```
npm run llama
```

## deepseek
```
npm run deepseek
```

## gemini
```
npm run gemini
```