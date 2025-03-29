document.addEventListener('DOMContentLoaded', async () => {
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
  
    // Скрываем поле API ключа в простом режиме
    document.getElementById('apiBackend').addEventListener('change', function() {
      document.getElementById('apiKeyGroup').style.display = 
        this.value === 'simple' ? 'none' : 'block';
    });
    document.getElementById('apiKeyGroup').style.display = 
      document.getElementById('apiBackend').value === 'simple' ? 'none' : 'block';
  });
  
  const saveSettings = async () => {
    await chrome.storage.sync.set({
      apiBackend: document.getElementById('apiBackend').value,
      apiKey: document.getElementById('apiKey').value,
      debugMode: document.getElementById('debugToggle').checked,
      autoClean: document.getElementById('autoClean').checked
    });
  };
  
  document.getElementById('apiBackend').addEventListener('change', saveSettings);
  document.getElementById('apiKey').addEventListener('input', saveSettings);
  document.getElementById('debugToggle').addEventListener('change', saveSettings);
  document.getElementById('autoClean').addEventListener('change', saveSettings);
  
  document.getElementById('rewriteBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
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
      if (apiBackend !== 'simple' && !apiKey) {
        throw new Error('API key required for AI modes');
      }
  
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "rewriteDescription",
        debug: debugMode
      });
  
      const aiResponse = await chrome.runtime.sendMessage({
        action: "processWithAI",
        text: response.text,
        apiBackend,
        apiKey,
        debug: debugMode
      });
  
      if (aiResponse.error) throw new Error(aiResponse.error);
  
      await chrome.tabs.sendMessage(tab.id, {
        action: "updateDescription",
        newText: aiResponse.rewrittenText,
        debug: debugMode
      });
  
      statusEl.textContent = 'Description cleaned!';
      statusEl.style.color = 'green';
    } catch (error) {
      console.error('Error:', error);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.style.color = 'red';
    }
  });