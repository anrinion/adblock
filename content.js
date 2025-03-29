let originalDescription = '';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.debug) {
      console.log("[DEBUG] Content script received:", request);
    }
  
    if (request.action === "rewriteDescription") {
      if (request.debug) console.log("[DEBUG] Searching for description element");
      
      // Основной селектор от uBlock Origin
      const descriptionElement = document.querySelector("#description-inline-expander");
      
      // Альтернативные селекторы на случай изменений
      const fallbackElements = [
        "#description-inline-expander yt-formatted-string",
        "#description.ytd-video-secondary-info-renderer",
        "yt-formatted-string#content",
        "[id*='description'] yt-formatted-string"
      ];
      
      let element = descriptionElement;
      let usedSelector = "#description-inline-expander";
      
      // Если основной селектор не сработал, пробуем альтернативы
      if (!element) {
        for (const selector of fallbackElements) {
          element = document.querySelector(selector);
          if (element) {
            usedSelector = selector;
            break;
          }
        }
      }
      
      if (element) {
        // Получаем текст с учетом возможного раскрытого/скрытого состояния
        const text = element.innerText || 
                    element.textContent || 
                    (element.shadowRoot ? element.shadowRoot.textContent : '');
        
        // Сохраняем оригинальное описание
        originalDescription = text.trim();
        
        if (request.debug) {
          console.log(`[DEBUG] Found description using selector: ${usedSelector}`);
          console.log(`[DEBUG] Element type: ${element.tagName}`);
          console.log("[DEBUG] Original text sample:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
        }
        
        sendResponse({text: originalDescription, selector: usedSelector});
      } else {
        if (request.debug) {
          console.error("[DEBUG] Description element not found. Trying fallback method...");
          console.log("[DEBUG] Document body sample:", document.body.innerHTML.substring(0, 500));
        }
        sendResponse({error: "Element not found", htmlSample: document.body.innerHTML.substring(0, 500)});
      }
    } else if (request.action === "updateDescription") {
      if (request.debug) console.log("[DEBUG] Updating description");
      
      // Используем селектор из первоначального ответа, если есть
      const selector = request.selector || "#description-inline-expander";
      const element = document.querySelector(selector);
      
      if (element) {
        // Добавляем кнопку восстановления
        const revertButton = `<div style="margin-top: 8px;">
          <span style="color: #065fd4; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center;"
                onclick="this.closest('[id*=\"description\"]').innerText = window.originalDescription">
            <svg style="width:14px;height:14px;margin-right:4px;" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12.5,8C9.85,8 7.45,9 5.6,10.6L3,8V16H11L8.4,13.4C9.55,12.45 11,12 12.5,12C16.04,12 19,14.96 19,18.5C19,19.38 18.75,20.21 18.31,20.9L21.39,23.97C23.06,22.24 24,19.78 24,17C24,11.48 19.52,7 14,7H12.5V8M3.61,10.03C1.94,11.76 1,14.22 1,17C1,22.52 5.48,27 11,27H12.5V26C15.15,26 17.55,25 19.4,23.4L22,26V18H14L16.6,20.6C15.45,21.55 14,22 12.5,22C8.96,22 6,19.04 6,15.5C6,14.62 6.25,13.79 6.69,13.1L3.61,10.03Z"/>
            </svg>
            Restore original
          </span>
        </div>`;
        
        // Сохраняем оригинал в глобальной переменной
        window.originalDescription = originalDescription;
        
        // Обновляем контент с сохранением HTML (если был)
        if (element.shadowRoot) {
          const container = element.shadowRoot.querySelector("div") || document.createElement("div");
          container.innerHTML = request.newText + revertButton;
          element.shadowRoot.appendChild(container);
        } else {
          // Для обычных элементов
          const htmlSupport = element.tagName === 'DIV' || element.tagName === 'SPAN';
          if (htmlSupport) {
            element.innerHTML = request.newText + revertButton;
          } else {
            element.textContent = request.newText;
            element.insertAdjacentHTML('afterend', revertButton);
          }
        }
        
        if (request.debug) console.log("[DEBUG] Description updated with revert button");
      } else if (request.debug) {
        console.error("[DEBUG] Failed to find description element for update");
      }
    }
});