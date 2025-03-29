document.addEventListener('DOMContentLoaded', async () => {
  // Load user settings from Chrome's synchronized storage
  const settings = await chrome.storage.sync.get(['apiBackend', 'apiKeys', 'debugMode', 'autoClean']);

  const apiKeys = new Map(Object.entries(settings.apiKeys || {}));
  const apiBackendSelect = document.getElementById('apiBackend');
  const apiKeyInput = document.getElementById('apiKey');

  apiBackendSelect.value = settings.apiBackend || 'simple';
  apiKeyInput.value = apiKeys.get(apiBackendSelect.value) || '';
  document.getElementById('debugToggle').checked = settings.debugMode || false;
  document.getElementById('autoClean').checked = settings.autoClean || false;

  // Toggle API key input visibility based on the selected backend
  apiBackendSelect.addEventListener('change', function () {
    const selectedBackend = this.value;
    apiKeyInput.value = apiKeys.get(selectedBackend) || '';
    document.getElementById('apiKeyGroup').style.display =
      selectedBackend === 'simple' ? 'none' : 'block';
      saveSettings();
  });
  apiKeyInput.addEventListener('input', function (event) {
    const selectedBackend = apiBackendSelect.value;
    apiKeys.set(selectedBackend, this.value); // Update the Map when the API key input changes
  });
  document.getElementById('apiKeyGroup').style.display =
    apiBackendSelect.value === 'simple' ? 'none' : 'block';
});

const saveSettings = async () => {
  const apiBackend = document.getElementById('apiBackend').value;
  const apiKey = document.getElementById('apiKey').value;

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

    // Handle errors returned from the background processing.
    if (backgroundResponse.error) throw new Error(backgroundResponse.error);

    statusEl.textContent += '\nDescription cleaned!';
    statusEl.style.color = 'green';
  } catch (error) {
    // Display error messages to the user in case of failure.
    statusEl.textContent += `\nError: ${error.message}`;
    statusEl.style.color = 'red';
  }
});