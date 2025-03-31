const AI_REQUEST = "Rewrite the valid HTML input by removing sponsors, promotions, hashtags, and irrelevant links " +
  "(e.g., contacts, references). Keep core content and ensure timestamp links remain intact. " +
  "Output only the rewritten content without any introductory text or enclosing backticks:\n\n";

// Configuration object to store user settings
let settings = {
  autoClean: false,
  apiBackend: 'simple',
  apiKeys: {}, // Map of backend names to API keys
  debugMode: false,
  ollamaUrl: 'http://localhost:11434', // Default Ollama URL
  ollamaModel: 'tinyllama' // Default Ollama model
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
      apiKeys: {}, // Default to an empty object
      debugMode: false,
      ollamaUrl: 'http://localhost:11434', // Default Ollama URL
      ollamaModel: 'tinyllama' // Default Ollama model
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
    if (key === 'apiKeys') {
      settings.apiKeys = { ...settings.apiKeys, ...changes[key].newValue }; // Merge updated keys
    } else {
      settings[key] = changes[key].newValue;
    }
    debugLog(`Updated setting: ${key} =`, changes[key].newValue);
  }
});

// Cache to store processed requests per tabId
const requestCache = new Map();

// Check and update the cache with a boolean key indicating shortened or expanded state
function isRequestCached(tabId, url, isShortened) {
  if (!requestCache.has(tabId)) {
    requestCache.set(tabId, new Map());
  }
  const tabCache = requestCache.get(tabId);
  if (!tabCache.has(url)) {
    tabCache.set(url, { shortened: false, expanded: false });
  }
  const urlCache = tabCache.get(url);
  const key = isShortened ? 'shortened' : 'expanded';
  if (urlCache[key]) {
    debugLog('Request already cached for tab:', tabId, 'URL:', url, 'Key:', key);
    return true;
  }
  return false;
}

// Store original and rewritten text in the cache with a key for shortened or expanded state
function cacheRequestData(tabId, url, isShortened, newHtml) {
  if (requestCache.has(tabId)) {
    const tabCache = requestCache.get(tabId);
    if (tabCache.has(url)) {
      const urlCache = tabCache.get(url);
      const key = isShortened ? 'shortened' : 'expanded';
      urlCache[key] = newHtml;
      debugLog('Adding to cache data for tab:', tabId, 'URL:', url, 'Key:', key);
    }
  }
}

// Retrieve cached data for a specific tab, URL, and key indicating shortened or expanded state
function getCachedRequestData(tabId, url, isShortened) {
  if (requestCache.has(tabId)) {
    const tabCache = requestCache.get(tabId);
    if (tabCache.has(url)) {
      const urlCache = tabCache.get(url);
      const key = isShortened ? 'shortened' : 'expanded';
      return urlCache[key];
    }
  }
  return undefined;
}

// Clear cache when a tab is removed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (requestCache.has(tabId)) {
    requestCache.delete(tabId);
    debugLog('Cache cleared for tab:', tabId);
  }
});

// Trigger auto-clean process on tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await loadSettings();
  if (!settings.autoClean) {
    debugLog('Skipping auto-clean for tab:', tabId, '- Reason: Auto-clean is disabled in settings');
    return;
  }

  if (tab.status !== 'complete') {
    debugLog('Skipping auto-clean for tab:', tabId, '- Reason: Tab is not fully loaded');
    return;
  }
  if (!tab.url.includes('youtube.com/watch')) {
    debugLog('Skipping auto-clean for tab:', tabId, '- Reason: URL is not a YouTube watch page');
    return;
  }

  // Add a 1s delay if the URL has changed
  if (changeInfo.url) {
    debugLog('URL change detected for tab:', tabId, '- Adding 1s delay before processing');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  debugLog('Starting auto-clean process for tab:', tabId);

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: "processPageReload",
      debug: settings.debugMode
    });
  } catch (error) {
    debugLog('Auto-clean failed:', error.message);
    return;
  }
  debugLog('Auto-clean completed successfully');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('New message received:', request.action, 'from:', sender.url, 'tab: ', (request.tab || sender.tab)?.id);

  if (request.action === "doRewrite") {
    doRewrite(request.tab || sender.tab)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true;
  }
});

// Main logic (called from both the popup and auto-clean process).
// 1. Retrieves the description element;
// 2. Sends it to the backend for rewriting;
// 3. Updates the description element with the rewritten text.
async function doRewrite(tab) {
  debugLog('Starting doRewrite for tab:', tab.id, 'URL:', tab.url);
  let contentResponse = await chrome.tabs.sendMessage(tab.id, {
    action: "getDescriptionForRewrite",
    debug: settings.debugMode
  });

  if (contentResponse.error) throw new Error(`Content script error: ${contentResponse.error}`);

  const rewriteResponse = await rewriteDescription({
    text: contentResponse.text,
    html: contentResponse.html,
    apiBackend: settings.apiBackend,
    apiKey: settings.apiKeys[settings.apiBackend],
    debug: settings.debugMode,
    tabId: tab.id,
    url: tab.url,
    isShortened: contentResponse.isShortened
  });

  if (rewriteResponse.error) throw new Error(`Processing error: ${rewriteResponse.error}`);

  contentResponse = await chrome.tabs.sendMessage(tab.id, {
    action: "changeDescriptionToRewritten",
    newHtml: rewriteResponse.newHtml,
    debug: settings.debugMode
  });
  if (contentResponse.error) throw new Error(`Content script error: ${contentResponse.error}`);
  return { 'status: ': 'success' };
}

// Unified function for text processing. Checks cache and uses the selected backend for rewriting.
async function rewriteDescription({ text, html, apiBackend, apiKey, debug, tabId, url, isShortened }) {
  await loadSettings();

  const backend = apiBackend || settings.apiBackend;
  const key = apiKey || settings.apiKey;

  debugLog(`Processing with ${backend} backend for tab: ${tabId}, URL: ${url}, isShortened: ${isShortened}`);

  // Check if the request is already cached
  if (isRequestCached(tabId, url, isShortened)) {
    const cachedData = getCachedRequestData(tabId, url, isShortened);
    if (cachedData && cachedData.newHtml) {
      debugLog('Returning cached result for tab:', tabId, 'URL:', url, 'isShortened:', isShortened);
      return { newHtml: cachedData.newHtml };
    }
  }

  try {
    let result;
    switch (backend) {
      case 'simple':
        result = simpleRewrite(text, debug).replace(/(?:\r\n|\r|\n)/g, '<br>');
        break;
      case 'gemini':
        if (!key) throw new Error('Missing Gemini API key');
        result = await rewriteWithGemini(html, key, debug);
        break;
      case 'mistral':
        if (!key) throw new Error('Missing Mistral API key');
        result = await rewriteWithMistral(html, key, debug);
        break;
      case 'ollama':
        const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
        const ollamaModel = settings.ollamaModel || 'tinyllama';
        result = await rewriteWithOllama(html, ollamaUrl, ollamaModel, debug);
        break;
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }

    // Cache the result
    cacheRequestData(tabId, url, isShortened, result);

    return { newHtml: result };
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

// API is expensive... so we send to LLMs only the minumum required data. It's mostly useless anyway.
function sanitizeHtml(html) {
  // First extract and protect all <a> tags with placeholders
  const linkMap = new Map();
  let linkCounter = 0;

  // Protect all <a> tags (with all their attributes)
  html = html.replace(/<a\s([^>]*)>([^<]*)<\/a>/gi, (match, attrs, content) => {
    const placeholder = `~~~LINK_${linkCounter++}~~~`;
    linkMap.set(placeholder, `<a ${attrs}>${content}</a>`);
    return placeholder;
  });

  // Now remove all other HTML tags (keeping their content)
  html = html.replace(/<\/?([a-z][a-z0-9]*)(?:[^>]*)>/gi, (match, tag) => {
    // Keep only these basic tags (without attributes)
    const basicTags = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'code'];
    return basicTags.includes(tag.toLowerCase()) ? match.replace(/<([a-z]+)([^>]*)>/i, '<$1>') : '';
  });

  // Restore all protected links
  linkMap.forEach((link, placeholder) => {
    html = html.replace(placeholder, link);
  });

  // Clean up any empty tags
  html = html.replace(/<[^>]+>\s*<\/[^>]+>/g, '');

  return html;
}

// Rewrite text using the Gemini API
async function rewriteWithGemini(html, apiKey, debug) {
  try {
    debugLog('Gemini API key:', apiKey);
    const prompt = `${AI_REQUEST}${sanitizeHtml(html)}`;
    debugLog('Gemini API prompt:', prompt);
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

// Rewrite text using the Mistral AI API
async function rewriteWithMistral(html, apiKey, debug) {
  try {
    debugLog('Mistral API key:', apiKey);

    const prompt = `${AI_REQUEST}${sanitizeHtml(html)}`;
    debugLog('Mistral API prompt:', prompt);

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from Mistral');
    }

    return data.choices[0].message.content;
  } catch (error) {
    throw error;
  }
}

async function rewriteWithOllama(html, url, model, debug) {
  try {
    debugLog('Ollama URL:', url);
    debugLog('Ollama Model:', model);

    const prompt = `${AI_REQUEST}${sanitizeHtml(html)}`;
    debugLog('Ollama API prompt:', prompt);

    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      }),
    });

    debugLog('Ollama API responed: ', response);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Ollama API error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    debugLog('Final result: ', data);
    if (!data.response) {
      throw new Error('Invalid response structure from Ollama');
    }

    return data.response;
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
