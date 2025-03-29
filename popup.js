document.addEventListener('DOMContentLoaded', async () => {
  // Load user settings from Chrome's synchronized storage and populate the UI fields with the retrieved values.
  const settings = await chrome.storage.sync.get([
    'apiBackend',
    'apiKey',
    'debugMode',
    'autoClean'
  ]);

  document.getElementById('apiBackend').value = settings.apiBackend || 'simple';
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('debugToggle').checked = settings.debugMode || false;
  document.getElementById('autoClean').checked = settings.autoClean || false;

  // Dynamically toggle the visibility of the API key input field based on the selected API backend mode.
  document.getElementById('apiBackend').addEventListener('change', function () {
    document.getElementById('apiKeyGroup').style.display =
      this.value === 'simple' ? 'none' : 'block';
  });
  document.getElementById('apiKeyGroup').style.display =
    document.getElementById('apiBackend').value === 'simple' ? 'none' : 'block';
});

const saveSettings = async () => {
  // Save the current state of the settings to Chrome's synchronized storage.
  await chrome.storage.sync.set({
    apiBackend: document.getElementById('apiBackend').value,
    apiKey: document.getElementById('apiKey').value,
    debugMode: document.getElementById('debugToggle').checked,
    autoClean: document.getElementById('autoClean').checked
  });
};

// Attach event listeners to save settings whenever the user modifies any of the input fields.
document.getElementById('apiBackend').addEventListener('change', saveSettings);
document.getElementById('apiKey').addEventListener('input', saveSettings);
document.getElementById('debugToggle').addEventListener('change', saveSettings);
document.getElementById('autoClean').addEventListener('change', saveSettings);

document.getElementById('rewriteBtn').addEventListener('click', async () => {
  // Handle the "Rewrite" button click to process the current tab's content using AI or other logic.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { apiBackend, apiKey, debugMode } = await chrome.storage.sync.get([
    'apiBackend',
    'apiKey',
    'debugMode',
    'autoClean'
  ]);

  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Processing...';
  statusEl.style.color = '#666';

  try {
    // Ensure the API key is provided when using advanced AI modes.
    if (apiBackend !== 'simple' && !apiKey) {
      throw new Error('API key required for AI modes');
    }

    // Request the current description text from the content script in the active tab.
    const contentResponse = await chrome.tabs.sendMessage(tab.id, {
      action: "getDescriptionForRewrite",
      debug: debugMode
    });

    if (debugMode) {
      statusEl.textContent += '\nFetched description from content script.';
    }

    // Send the retrieved text to the background script for processing.
    const backgroundResponse = await chrome.runtime.sendMessage({
      action: "rewriteDescription",
      text: contentResponse.text,
      apiBackend,
      apiKey,
      debug: debugMode,
      tabId: tab.id,
      url: tab.url,
      isShortened: contentResponse.isShortened
    });

    if (debugMode) {
      statusEl.textContent += '\nSent text to background script for rewriting.';
    }

    // Handle errors returned from the background processing.
    if (backgroundResponse.error) throw new Error(backgroundResponse.error);

    // Update the description in the active tab with the rewritten text.
    await chrome.tabs.sendMessage(tab.id, {
      action: "changeDescriptionToRewritten",
      newText: backgroundResponse.rewrittenText,
      debug: debugMode
    });

    if (debugMode) {
      statusEl.textContent += '\nUpdated description in the active tab.';
    }

    statusEl.textContent += '\nDescription cleaned!';
    statusEl.style.color = 'green';
  } catch (error) {
    // Display error messages to the user in case of failure.
    console.error('Error:', error);
    statusEl.textContent += `\nError: ${error.message}`;
    statusEl.style.color = 'red';
  }
});