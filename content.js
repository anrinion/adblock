const globalState = {
  originalDescription: '',
  originalHTML: '',
  originalElement: null,
  isRewritten: false,
  debugMode: false // Added debugMode to global state
};

// Debug logger function
function debugLog(...args) {
  if (globalState.debugMode) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

// Finds the description element on the page. It attempts to locate the expanded description first,
// then the collapsed version, and finally falls back to other potential description containers.
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

// Adds a "Restore original" button next to the modified description element. This button allows
// users to revert the description back to its original state. If a button already exists, it is removed first.
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

  // Adds a click event listener to restore the original description and remove the button afterward.
  revertButton.querySelector('span').addEventListener('click', () => {
    element.innerHTML = globalState.originalHTML;
    revertButton.remove();
    globalState.isRewritten = false;
  });

  element.parentElement.insertBefore(revertButton, element.nextSibling);
}

// Retrieves the description element and saves its original content for potential restoration.
function getDescriptionForRewrite(sendResponse) {
  const { element, isShortened } = findDescriptionElement();
  if (!element) {
    sendResponse({ error: "Desciption element not found (getDescriptionForRewrite)" });
    return;
  }
  if (globalState.isRewritten && globalState.originalElement === element) {
    sendResponse({ error: "Description already rewritten" });
    return;
  }
  globalState.originalElement = element;
  globalState.originalHTML = element.innerHTML;
  globalState.originalDescription = element.innerText;
  sendResponse({ text: globalState.originalDescription, html: globalState.originalHTML, isShortened });
}

// Updates the description element with new content and adds a restore button for reverting changes.
function changeDescriptionToRewritten(request, sendResponse) {
  if (!globalState.originalElement) {
    console.error('Desciption element not found (changeDescriptionToRewritten)');
    return;
  }
  globalState.isRewritten = true;
  globalState.originalElement.innerHTML = request.newText.replace(/\n/g, '<br>');
  addRestoreButton(globalState.originalElement);
  sendResponse({ success: true });
}

// Listens for messages from the extension's background script or popup. Handles actions to either
// retrieve the current description or update it with new content.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.debug !== undefined) {
    globalState.debugMode = request.debug; // Update debugMode based on the request
  }

  if (globalState.debugMode) {
    console.log("[DEBUG] Message received:", request.action, request);
  }

  if (request.action === "getDescriptionForRewrite") {
    getDescriptionForRewrite(sendResponse);
  } else if (request.action === "changeDescriptionToRewritten") {
    changeDescriptionToRewritten(request, sendResponse);
  } else {
    console.error('Unknown action:', request.action);
  }
});

// Observe and intercept clicks on the "...more" button
function interceptMoreButton() {
  const observer = new MutationObserver(() => {
    const moreButton = document.querySelector('tp-yt-paper-button#expand');
    if (moreButton) {
      if (!moreButton.dataset.listenerAdded) {
        moreButton.addEventListener('click', async () => {
          debugLog('"...more" button clicked. Cleaning extended description...');
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
          }, 500); // Delay to allow the extended description to load
        });
        moreButton.dataset.listenerAdded = "true"; // Mark the button to prevent duplicate listeners
      }
    }
  });

  // Observe changes in the DOM to detect when the "...more" button is added
  observer.observe(document.body, { childList: true, subtree: true });
}

// Initialize interception logic
interceptMoreButton();