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
  urlCache[key] = true;
  return false;
}

// Store original and rewritten text in the cache with a key for shortened or expanded state
function cacheRequestData(tabId, url, isShortened, originalText, rewrittenText) {
  if (requestCache.has(tabId)) {
    const tabCache = requestCache.get(tabId);
    if (tabCache.has(url)) {
      const urlCache = tabCache.get(url);
      const key = isShortened ? 'shortened' : 'expanded';
      urlCache[key] = { originalText, rewrittenText };
      debugLog('Cached data for tab:', tabId, 'URL:', url, 'Key:', key);
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
      if (urlCache[key]) {
        return urlCache[key];
      }
    }
  }
  return null;
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
  debugLog('Starting auto-clean process for tab:', tabId);

  try {
    const contentResponse = await chrome.tabs.sendMessage(tabId, {
      action: "getDescriptionForRewrite",
      debug: settings.debugMode
    });

    if (contentResponse.error) throw new Error(`Content script error: ${contentResponse.error}`);

    const rewriteResponse = await rewriteDescription({
      text: contentResponse.text,
      apiBackend: settings.apiBackend,
      apiKey: settings.apiKey,
      debug: settings.debugMode,
      tabId: tabId,
      url: tab.url,
      isShortened: contentResponse.isShortened
    });

    if (rewriteResponse.error) throw new Error(`Processing error: ${rewriteResponse.error}`);

    await chrome.tabs.sendMessage(tabId, {
      action: "changeDescriptionToRewritten",
      newText: rewriteResponse.rewrittenText,
      debug: settings.debugMode
    });

    debugLog('Auto-clean completed successfully');
  } catch (error) {
    debugLog('Auto-clean failed:', error.message);
  }
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('New message received:', request.action, 'from:', sender.url);

  if (request.action === "rewriteDescription") {
    rewriteDescription(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true;
  }
});

// Unified function for text processing. Checks cache and uses the selected backend for rewriting.
async function rewriteDescription({ text, apiBackend, apiKey, debug, tabId, url, isShortened }) {
  await loadSettings();

  const backend = apiBackend || settings.apiBackend;
  const key = apiKey || settings.apiKey;

  debugLog(`Processing with ${backend} backend for tab: ${tabId}, URL: ${url}, isShortened: ${isShortened}`);

  // Check if the request is already cached
  if (isRequestCached(tabId, url, isShortened)) {
    const cachedData = getCachedRequestData(tabId, url, isShortened);
    if (cachedData && cachedData.rewrittenText) {
      debugLog('Returning cached result for tab:', tabId, 'URL:', url, 'isShortened:', isShortened);
      return { rewrittenText: cachedData.rewrittenText };
    }
  }

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

    // Cache the result
    cacheRequestData(tabId, url, isShortened, text, result);

    return { rewrittenText: result };
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
