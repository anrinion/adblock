function processSimpleMode(text) {
    // Берем первый абзац (до двойного переноса строки)
    const firstParagraph = text.split('\n\n')[0];
    return firstParagraph.trim();
  }
  
  async function rewriteWithGemini(text, apiKey, debug) {
    const prompt = `Remove all sponsors, links and non-essential info from this YouTube description, keeping only core content. Return cleaned text only:\n\n${text}`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{ parts: [{text: prompt}] }]
      })
    });
  
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
  
  async function rewriteWithChatGPT(text, apiKey, debug) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user", 
          content: `Clean this YouTube description (remove sponsors/links):\n\n${text}`
        }],
        temperature: 0.3
      })
    });
  
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processWithAI") {
      const { text, apiBackend, apiKey, debug } = request;
      
      try {
        let result;
        switch (apiBackend) {
          case 'simple':
            result = processSimpleMode(text);
            break;
          case 'gemini':
            result = rewriteWithGemini(text, apiKey, debug);
            break;
          case 'chatgpt':
            result = rewriteWithChatGPT(text, apiKey, debug);
            break;
          default:
            throw new Error('Invalid processing mode');
        }
  
        Promise.resolve(result).then(rewrittenText => {
          sendResponse({ rewrittenText });
        });
      } catch (error) {
        sendResponse({ error: error.message });
      }
  
      return true; // Для асинхронного ответа
    }
  });