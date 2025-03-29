let originalDescription = '';
let originalHTML = '';
let originalElement = null;

function findDescriptionElement() {
  const expanded = document.querySelector(
    '#description-inline-expander yt-attributed-string.ytd-text-inline-expander.style-scope ' +
    '> .yt-core-attributed-string--white-space-pre-wrap.yt-core-attributed-string'
  );
  if (expanded) return expanded;

  const collapsed = document.querySelector(
    '#attributed-snippet-text > .yt-core-attributed-string--white-space-pre-wrap.yt-core-attributed-string'
  );
  if (collapsed) return collapsed;

  return document.querySelector("#description-inline-expander") || 
         document.querySelector("#description.ytd-video-secondary-info-renderer") ||
         document.querySelector("yt-formatted-string#content");
}

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
    element.innerHTML = originalHTML;
    revertButton.remove(); // Удаляем кнопку после восстановления
  });

  element.parentElement.insertBefore(revertButton, element.nextSibling);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.debug) console.log("[DEBUG] Message received:", request.action);

  if (request.action === "rewriteDescription") {
    const element = findDescriptionElement();
    if (element) {
      originalElement = element;
      originalHTML = element.innerHTML;
      originalDescription = element.innerText;
      sendResponse({ text: originalDescription, html: originalHTML });
    } else {
      sendResponse({ error: "Element not found" });
    }
  } 
  else if (request.action === "updateDescription") {
    const element = originalElement || findDescriptionElement();
    if (element) {
      element.innerHTML = request.newText.replace(/\n/g, '<br>');
      addRestoreButton(element);
      sendResponse({ success: true });
    }
  }
});