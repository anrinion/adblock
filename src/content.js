const globalState = {
  originalDescription: '',
  originalHTML: '',
  originalElement: null,
  debugMode: true
};

// Debug logger function
function debugLog(...args) {
  if (globalState.debugMode) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

// Load user settings from Chrome's synchronized storage
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      autoClean: false,
      debugMode: false
    }, (result) => {
      globalState.debugMode = result.debugMode || false;
      globalState.autoClean = result.autoClean || false;
      resolve();
    });
  });
}

// Updates the description element with a "Loading..." message during the rewrite process
function setLoadingState(element) {
  element.dataset.beingRewritten = "true"; // Add metadata to the DOM element
  element.innerHTML = `<span style="color: gray; font-style: italic;">Loading...</span>`;
}

// Finds the description element on the page
function findDescriptionElement() {
  debugLog('Attempting to find description element...');

  const moreButton = document.querySelector('tp-yt-paper-button#expand');
  const isShortened = moreButton && !moreButton.hasAttribute('hidden');

  let element = document.querySelector(
    '#description-inline-expander yt-attributed-string.ytd-text-inline-expander.style-scope ' +
    '> .yt-core-attributed-string--white-space-pre-wrap.yt-core-attributed-string'
  );

  if (element) {
    debugLog('Found expanded description element:', element);
    return { element, isShortened };
  }

  const fallback = document.querySelector("#description-inline-expander") ||
    document.querySelector("#description.ytd-video-secondary-info-renderer") ||
    document.querySelector("yt-formatted-string#content");
  if (fallback) {
    debugLog('Found fallback description element:', fallback);
  } else {
    debugLog('No description element found.');
  }

  return { element, isShortened };
}

// Adds a "Restore original" button next to the modified description element
function addRestoreButton(element) {
  const oldButton = element.parentElement.querySelector('.restore-button');
  if (oldButton) oldButton.remove();

  const revertButton = document.createElement('div');
  revertButton.className = 'restore-button';
  revertButton.style.marginTop = '8px';
  revertButton.innerHTML = `
    <span style="color: #065fd4; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center;">
      <svg style="width:14px;height:14px;margin-right:4px;" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12.5,8C9.85,8 7.45,9 5.6,10.6L3,8V16H11L8.4,13.4C9.55,12.45 11,12 12.5,12C16.04,12 19,14.96 19,18.5C19,19.38 18.75,20.21 18.31,20.9L21.39,23.97C23.06,22.24 24,19.78 24,17C24,11.48 19.52,7 14,7H12.5V8M3.61,10.03C1.94,11.76 1,14.22 1,17C1,22.52 5.48,27 11,27H12.5V26C15.15,26 17.55,25 19.4,23.4L22,26V18H14L16.6,20.6C15.45,21.55 14,22 12.5,22C8.96,22 6,19.04 6,15.5C6,14.62 6.25,13.79 6.69,13.1L3.61,10.03Z"/>
      </svg>
      Restore original
    </span>
  `;

  revertButton.querySelector('span').addEventListener('click', () => {
    element.innerHTML = globalState.originalHTML;
    revertButton.remove();
    delete element.dataset.rewritten;
  });

  element.parentElement.insertBefore(revertButton, element.nextSibling);
}

// Retrieves the description element and saves its original content for potential restoration
function getDescriptionForRewrite(sendResponse) {
  const { element, isShortened } = findDescriptionElement();
  if (!element) {
    sendResponse({ error: "Desciption element not found (getDescriptionForRewrite)" });
    return;
  }
  if (element.dataset.rewritten === "true") {
    sendResponse({ error: "Description already rewritten" });
    return;
  }
  if (element.dataset.beingRewritten === "true") {
    sendResponse({ error: "Description is currently being rewritten" });
    return;
  }
  globalState.originalElement = element;
  globalState.originalHTML = element.innerHTML;
  globalState.originalDescription = element.innerText;
  setLoadingState(element);
  sendResponse({ text: globalState.originalDescription, html: globalState.originalHTML, isShortened });
}

// Updates the description element with new content and adds a restore button for reverting changes
function changeDescriptionToRewritten(request, sendResponse) {
  if (!globalState.originalElement) {
    debugLog('Desciption element not found (changeDescriptionToRewritten)');
    return;
  }
  globalState.originalElement.dataset.beingRewritten = "false"; 
  globalState.originalElement.dataset.rewritten = "true";
  globalState.originalElement.innerHTML = request.newHtml;
  addRestoreButton(globalState.originalElement);
  sendResponse({ success: true });
}

// Listens for messages from the extension's background script or popup
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.debug !== undefined) {
    globalState.debugMode = request.debug; // Update debugMode based on the request
  }

  debugLog("[DEBUG] Message received:", request.action, request);

  if (request.action === "getDescriptionForRewrite") {
    getDescriptionForRewrite(sendResponse);
  } else if (request.action === "changeDescriptionToRewritten") {
    changeDescriptionToRewritten(request, sendResponse);
  } else if (request.action === "processPageReload") {
    await onNewVideo();
    sendResponse({ success: true });
  } else {
    debugLog('Unknown action:', request.action);
  }
});

async function onNewVideo() {
  async function handleMoreButtonClick() {
    debugLog('"...more" button clicked or simulated. Cleaning extended description...');
    setTimeout(() => {
      // Trigger cleaning after the extended description is loaded
      (async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            action: "doRewrite",
          });
          if (response.error) {
            debugLog('Error cleaning extended description:', response.error);
          } else {
            debugLog('Background script processed the rewrite successfully.');
          }
        } catch (error) {
          debugLog('Error communicating with background script:', error);
        }
      })();
    }, 10); // Delay to allow the extended description to load
  }

  async function clickMoreButtonIfNeeded() {
    if (!globalState.autoClean) {
      debugLog('Auto-clean is disabled. Skipping auto-click of "...more" button.');
      return;
    }

    const maxAttempts = 5;
    const delayBetweenAttempts = 300; // ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const moreButton = document.querySelector('tp-yt-paper-button#expand');
      if (moreButton) {
        debugLog('Found new "...more" button. Clicking it...');

        // Add the click handler first (in case our click triggers it)
        if (!moreButton.dataset.listenerAdded) {
          moreButton.addEventListener('click', handleMoreButtonClick);
          moreButton.dataset.listenerAdded = "true";
        }

        moreButton.click();
        return true;
      }

      if (attempt < maxAttempts) {
        debugLog(`"...more" button not found (attempt ${attempt}/${maxAttempts}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }

    debugLog('"...more" button not found after maximum attempts.');
    return false;
  }

  // Observe and intercept clicks on the "...more" button
  function interceptMoreButton() {
    if (!globalState.autoClean) {
      debugLog('Auto-clean is disabled. Skipping the "...more" button interception.');
      return;
    }

    const observer = new MutationObserver(() => {
      const moreButton = document.querySelector('tp-yt-paper-button#expand');
      if (moreButton && !moreButton.dataset.listenerAdded) {
        moreButton.addEventListener('click', handleMoreButtonClick);
        moreButton.dataset.listenerAdded = "true";
        debugLog('Added click listener to "...more" button');
      }
    });

    debugLog('The "...more" button interception started.');
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialization
  try {
      // Try to auto-click first
      const clicked = await clickMoreButtonIfNeeded();
      if (!clicked) {
        // Set up observer as fallback in case button appears later
        interceptMoreButton();
      }
  } catch (error) {
    debugLog('An error occurred during script initialization:', error);
  }
}

// Initialize the script when the page loads
 try {
  loadSettings().then(onNewVideo);
} catch (error) {
  debugLog('An error occurred during script initialization:', error);
}