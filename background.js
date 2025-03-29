// Конфигурация
let settings = {
    autoClean: false,
    apiBackend: 'simple',
    apiKey: '',
    debugMode: false
  };
  
  // Логгер с проверкой debugMode
  function debugLog(...args) {
    if (settings.debugMode) {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
  
  // Загрузка всех настроек
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({
        autoClean: false,
        apiBackend: 'simple',
        apiKey: '',
        debugMode: false
      }, (result) => {
        settings = result;
        debugLog('Settings loaded:', JSON.stringify(settings, null, 2));
        resolve();
      });
    });
  }
  
  // Обработчик изменений настроек
  chrome.storage.onChanged.addListener((changes) => {
    debugLog('Storage changes detected:', JSON.stringify(changes, null, 2));
    for (let key in changes) {
      settings[key] = changes[key].newValue;
      debugLog(`Updated setting: ${key} =`, changes[key].newValue);
    }
  });
  
  // Автоматическая очистка
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    await loadSettings();
    
    if (!settings.autoClean) {
      debugLog('Auto-clean disabled, skipping');
      return;
    }
  
    if (!changeInfo.url || !tab.status === 'complete') {
      debugLog('URL not changed or page not loaded, skipping');
      return;
    }
  
    if (!changeInfo.url.includes('youtube.com/watch')) {
      debugLog('Not a YouTube video page, skipping. URL:', changeInfo.url);
      return;
    }
  
    debugLog('Detected YouTube video page, starting auto-clean process...');
    
    setTimeout(async () => {
      try {
        debugLog('Sending rewriteDescription message to tab:', tabId);
        
        const response = await chrome.tabs.sendMessage(tabId, { 
          action: "rewriteDescription",
          debug: settings.debugMode
        });
        
        debugLog('Received response from content script:', response);
        
        if (response.error) {
          throw new Error(`Content script error: ${response.error}`);
        }
  
        debugLog(`Processing with ${settings.apiBackend} backend...`);
        
        const aiResponse = await processWithAI({
          text: response.text,
          apiBackend: settings.apiBackend,
          apiKey: settings.apiKey,
          debug: settings.debugMode
        });
        
        debugLog('AI processing result:', aiResponse);
        
        if (aiResponse.error) {
          throw new Error(`AI processing error: ${aiResponse.error}`);
        }
  
        debugLog('Sending updateDescription message to tab');
        
        await chrome.tabs.sendMessage(tabId, {
          action: "updateDescription",
          newText: aiResponse.rewrittenText,
          debug: settings.debugMode
        });
        
        debugLog('Auto-clean completed successfully');
        
      } catch (error) {
        debugLog('Auto-clean failed:', error.message);
        debugLog('Full error:', error);
      }
    }, 1500);
  });
  
  // Обработчик сообщений
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog('New message received:', request.action, 'from:', sender.url);
    
    if (request.action === "processWithAI") {
      debugLog('AI processing request:', JSON.stringify({
        text: request.text.substring(0, 50) + '...',
        apiBackend: request.apiBackend,
        debug: request.debug
      }, null, 2));
  
      processWithAI(request)
        .then(result => {
          debugLog('AI processing completed:', JSON.stringify({
            textLength: result.rewrittenText?.length,
            error: result.error
          }, null, 2));
          sendResponse(result);
        })
        .catch(error => {
          debugLog('AI processing failed:', error);
          sendResponse({ error: error.message });
        });
      
      return true;
    }
  });
  
  // Единая функция обработки AI
  async function processWithAI({ text, apiBackend, apiKey, debug }) {
    await loadSettings();
    
    const backend = apiBackend || settings.apiBackend;
    const key = apiKey || settings.apiKey;
    
    debugLog(`Starting AI processing with ${backend} backend`);
    debugLog('Text sample:', text.substring(0, 100) + '...');
  
    try {
      let result;
      switch (backend) {
        case 'simple':
          debugLog('Using simple mode processing');
          result = simpleRewrite(text, debug);
          break;
          
        case 'gemini':
          if (!key) throw new Error('Missing Gemini API key');
          debugLog('Calling Gemini API...');
          result = await rewriteWithGemini(text, key, debug);
          break;
          
        case 'chatgpt':
          if (!key) throw new Error('Missing ChatGPT API key');
          debugLog('Calling ChatGPT API...');
          result = await rewriteWithChatGPT(text, key, debug);
          break;
          
        default:
          throw new Error(`Unknown backend: ${backend}`);
      }
      
      const finalText = await result;
      debugLog('Processing completed. Result sample:', finalText.substring(0, 100) + '...');
      
      return { rewrittenText: finalText };
    } catch (error) {
      debugLog('Processing failed:', error);
      return { error: error.message };
    }
  }
  
  function simpleRewrite(text, debug) {
    // Берем первый абзац
    text = text.split('\n')[0];
    if (debug) text = '[DEBUG] ' + text;
    return text.trim();
  }

  // Функции обработчики с логгированием
  async function rewriteWithGemini(text, apiKey, debug) {
    try {
      const prompt = `Remove sponsors/links from YouTube description, keep core content:\n\n${text}`;
      debugLog('Gemini request payload sample:', prompt.substring(0, 150) + '...');
      
      const startTime = Date.now();
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      
      debugLog(`Gemini API response (${Date.now() - startTime}ms) status:`, response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        debugLog('Gemini API error details:', errorData);
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      debugLog('Gemini API response data:', JSON.stringify(data, null, 2));
      
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response structure from Gemini');
      }
      
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      debugLog('Gemini processing error:', error);
      throw error;
    }
  }
  
  // Инициализация
  debugLog('Background script loading...');
  loadSettings().then(() => {
    debugLog('Background script initialized');
    debugLog('Current settings:', JSON.stringify(settings, null, 2));
  });