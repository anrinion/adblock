// Configuration object to store user settings
let settings = {
  autoClean: false,
  apiBackend: 'simple',
  apiKey: '',
  debugMode: false
};

// Debug logger function
function debugLog(...args) {
  if (settings.debugMode) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

// Load user settings from Chrome's synchronized storage
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

// Monitor changes to user settings
chrome.storage.onChanged.addListener((changes) => {
  debugLog('Storage changes detected:', JSON.stringify(changes, null, 2));
  for (let key in changes) {
    settings[key] = changes[key].newValue;
    debugLog(`Updated setting: ${key} =`, changes[key].newValue);
  }
});

// Trigger auto-clean process on tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await loadSettings();

  if (!settings.autoClean || !changeInfo.url || tab.status !== 'complete' || !changeInfo.url.includes('youtube.com/watch')) {
    debugLog('Skipping auto-clean for tab:', tabId);
    return;
  }

  debugLog('Starting auto-clean process for tab:', tabId);

  setTimeout(async () => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { 
        action: "rewriteDescription",
        debug: settings.debugMode
      });

      if (response.error) throw new Error(`Content script error: ${response.error}`);

      const aiResponse = await processWithAI({
        text: response.text,
        apiBackend: settings.apiBackend,
        apiKey: settings.apiKey,
        debug: settings.debugMode
      });

      if (aiResponse.error) throw new Error(`AI processing error: ${aiResponse.error}`);

      await chrome.tabs.sendMessage(tabId, {
        action: "updateDescription",
        newText: aiResponse.rewrittenText,
        debug: settings.debugMode
      });

      debugLog('Auto-clean completed successfully');
    } catch (error) {
      debugLog('Auto-clean failed:', error.message);
    }
  }, 1500);
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('New message received:', request.action, 'from:', sender.url);

  if (request.action === "processWithAI") {
    processWithAI(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true;
  }
});

// Unified function for AI-based text processing
async function processWithAI({ text, apiBackend, apiKey, debug }) {
  await loadSettings();

  const backend = apiBackend || settings.apiBackend;
  const key = apiKey || settings.apiKey;

  debugLog(`Processing with ${backend} backend`);

  try {
    let result;
    switch (backend) {
      case 'simple':
        result = simpleRewrite(text, debug);
        break;
      case 'gemini':
        if (!key) throw new Error('Missing Gemini API key');
        result = await rewriteWithGemini(text, key, debug);
        break;
      case 'chatgpt':
        if (!key) throw new Error('Missing ChatGPT API key');
        result = await rewriteWithChatGPT(text, key, debug);
        break;
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }

    return { rewrittenText: await result };
  } catch (error) {
    return { error: error.message };
  }
}

// Simple text rewriting function
function simpleRewrite(text, debug) {
  text = text.split('\n')[0];
  if (debug) text = '[DEBUG] ' + text;
  return text.trim();
}

// Rewrite text using the Gemini API
async function rewriteWithGemini(text, apiKey, debug) {
  try {
    const prompt = `Remove sponsors/links from YouTube description, keep core content:\n\n${text}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response structure from Gemini');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw error;
  }
}

// Initialize background script
debugLog('Background script loading...');
loadSettings().then(() => {
  debugLog('Background script initialized');
  debugLog('Current settings:', JSON.stringify(settings, null, 2));
});
