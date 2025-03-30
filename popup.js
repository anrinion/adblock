document.addEventListener('DOMContentLoaded', async () => {
  // Load user settings from Chrome's synchronized storage
  const settings = await chrome.storage.sync.get(['apiBackend', 'apiKeys', 'debugMode', 'autoClean', 'ollamaUrl', 'ollamaModel']);

  const apiKeys = new Map(Object.entries(settings.apiKeys || {}));
  const apiBackendSelect = document.getElementById('apiBackend');
  const apiKeyInput = document.getElementById('apiKey');
  const ollamaSettings = document.getElementById('ollamaSettings');
  const ollamaUrlInput = document.getElementById('url');
  const ollamaModelInput = document.getElementById('model');

  apiBackendSelect.value = settings.apiBackend || 'simple';
  apiKeyInput.value = apiKeys.get(apiBackendSelect.value) || '';
  document.getElementById('debugToggle').checked = settings.debugMode || false;
  document.getElementById('autoClean').checked = settings.autoClean || false;
  ollamaUrlInput.value = settings.ollamaUrl || 'http://localhost:11434';
  ollamaModelInput.value = settings.ollamaModel || 'tinyllama';

  // Toggle visibility of API key input and Ollama settings based on the selected backend
  const toggleSettingsVisibility = () => {
    const selectedBackend = apiBackendSelect.value;
    document.getElementById('apiKeyGroup').style.display =
      selectedBackend === 'simple' || selectedBackend === 'ollama' ? 'none' : 'block';
    ollamaSettings.style.display = selectedBackend === 'ollama' ? 'block' : 'none';
  };

  toggleSettingsVisibility();

  apiBackendSelect.addEventListener('change', function () {
    const selectedBackend = this.value;
    apiKeyInput.value = apiKeys.get(selectedBackend) || '';
    toggleSettingsVisibility();
    saveSettings();
  });

  apiKeyInput.addEventListener('input', function () {
    const selectedBackend = apiBackendSelect.value;
    apiKeys.set(selectedBackend, this.value); // Update the Map when the API key input changes
  });

  ollamaUrlInput.addEventListener('input', saveSettings);
  ollamaModelInput.addEventListener('input', saveSettings);

  document.getElementById('apiKeyGroup').style.display =
    apiBackendSelect.value === 'simple' || apiBackendSelect.value === 'ollama' ? 'none' : 'block';
});

const saveSettings = async () => {
  const apiBackend = document.getElementById('apiBackend').value;
  const apiKey = document.getElementById('apiKey').value;
  const ollamaUrl = document.getElementById('url').value;
  const ollamaModel = document.getElementById('model').value;

  // Load existing API keys from storage and update the Map
  const settings = await chrome.storage.sync.get(['apiKeys']);
  const apiKeys = new Map(Object.entries(settings.apiKeys || {}));
  apiKeys.set(apiBackend, apiKey);

  // Save the updated settings to Chrome's synchronized storage
  await chrome.storage.sync.set({
    apiBackend,
    apiKeys: Object.fromEntries(apiKeys),
    debugMode: document.getElementById('debugToggle').checked,
    autoClean: document.getElementById('autoClean').checked,
    ollamaUrl,
    ollamaModel,
  });
};

// Attach event listeners to save settings whenever the user modifies any of the input fields
// DO NOT save settings on apiBackend until apiKey is loaded, the must go in pair
document.getElementById('apiKey').addEventListener('input', saveSettings);
document.getElementById('debugToggle').addEventListener('change', saveSettings);
document.getElementById('autoClean').addEventListener('change', saveSettings);

document.getElementById('rewriteBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Processing...';
  statusEl.style.color = '#666';

  try {
    // Handle the "Rewrite" button click to process the current tab's content using AI or other logic.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send the retrieved text to the background script for processing.
    const backgroundResponse = await chrome.runtime.sendMessage({
      action: "doRewrite",
      tabId: tab.id,
      tab: tab,
    });
    // Handle the response from the background script
    statusEl.textContent = 'Done!';
    statusEl.style.color = 'green';
  } catch (error) {
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.style.color = 'red';
  }
});