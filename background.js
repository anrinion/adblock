const AI_REQUEST = 'Remove sponsors and irrelevant links (like contacts and references), but keep the core content and timestamps links:\n\n';

// Configuration object to store user settings
let settings = {
  autoClean: false,
  apiBackend: 'simple',
  apiKeys: {}, // Map of backend names to API keys
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
      apiKeys: {}, // Default to an empty object
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
    await doRewrite(tab);
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
  return {'status: ': 'success'};
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
      case 'chatgpt':
        if (!key) throw new Error('Missing ChatGPT API key');
        result = await rewriteWithChatGPT(html, key, debug);
        break;
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }

    // Cache the result
    cacheRequestData(tabId, url, isShortened, text, result);

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
  // First remove all forbidden elements (script, style, etc.)
  html = html.replace(/<\/?(script|style|iframe|frameset|frame|object|embed|applet)[^>]*>/gi, '');

  // Allow only these tags (others will be stripped, keeping content)
  const allowedTags = [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'strong', 'b', 'em', 'i', 'u', 's', 'code',
    'a'
  ];

  // 1. Remove all forbidden tags (but keep their content)
  allowedTags.forEach(tag => {
    const regex = new RegExp(`<\/?(?!${tag})[^>]+>`, 'gi');
    html = html.replace(regex, '');
  });

  // 2. For allowed tags, remove all attributes except:
  //    - Keep ALL attributes for <a> tags
  //    - Remove ALL attributes for other tags
  html = html.replace(/<(?!\/?a\b)([a-z][a-z0-9]*)([^>]*)>/gi, function(match, tagName, attrs) {
    return allowedTags.includes(tagName.toLowerCase()) ? `<${tagName}>` : '';
  });

  // Special handling for <a> tags - preserve all attributes
  html = html.replace(/<a\s([^>]*)>/gi, function(match, attrs) {
    // Basic XSS protection for href attributes
    const cleanAttrs = attrs.replace(/\bhref\s*=\s*["']?javascript:[^"'\s>]*/gi, '');
    return `<a ${cleanAttrs.trim()}>`;
  });

  // Remove empty tags (except <br> and <hr>)
  html = html.replace(/<(?!br|hr|img)\w[^>]*>\s*<\/\w+>/g, '');

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

// Rewrite text using the ChatGPT API
async function rewriteWithChatGPT(html, apiKey, debug) {
  try {
    debugLog('ChatGPT API key:', apiKey);

    const prompt = `${AI_REQUEST}${sanitizeHtml(html)}`;
    debugLog('ChatGPT API prompt:', prompt);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that rewrites YouTube descriptions.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from ChatGPT');
    }

    return data.choices[0].message.content;
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
