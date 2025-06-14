import 'webextension-polyfill';

// Helper to check if an element is visible
function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

// Function to get a robust XPath for an element
function getElementXPath(element: Element): string {
  if (element.id !== '') {
    return `//*[@id='${element.id}']`;
  }
  if (element === document.body) {
    return '/html/body';
  }

  let ix = 0;
  const siblings = element.parentNode?.children || [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return `${getElementXPath(element.parentNode!)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
  return ''; // Fallback if no parent or unique path found
}

// Helper functions for specific actions
function fillTextInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectDropdownOption(element: HTMLSelectElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function checkRadioOrCheckbox(element: HTMLInputElement, checked: boolean) {
  element.checked = checked;
  element.dispatchEvent(new Event('click', { bubbles: true })); // Click often triggers more reliably for checkboxes/radios
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Function to extract all relevant page content (form elements and surrounding text)
function extractPageContext() {
  const pageContextItems: any[] = [];
  let domOrderCounter = 0;

  const traverse = (node: Node) => {
    if (!node) return;

    // Skip script, style, noscript, and comment nodes entirely
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toUpperCase();
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName)) {
        return; // Skip this node and its children
      }
    } else if (node.nodeType === Node.COMMENT_NODE) {
      return; // Skip comment nodes
    }

    const currentDomOrder = domOrderCounter++;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (isElementVisible(el)) {
        // Check if it's a form element
        if (el.matches('input, textarea, select')) {
          const data: any = {
            tagName: el.tagName.toLowerCase(),
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            id: el.id,
            name: el.name,
            placeholder: (el as HTMLInputElement).placeholder,
            value: (el as HTMLInputElement).value,
            selector: getElementXPath(el),
            domOrder: currentDomOrder,
          };

          // Get associated label text
          let labelText = '';
          if ((el as HTMLInputElement).labels && (el as HTMLInputElement).labels.length > 0) {
            labelText = (el as HTMLInputElement).labels[0].textContent || '';
          } else {
            let current = el.previousElementSibling;
            while (current) {
              if (current.tagName.toLowerCase() === 'label') {
                labelText = current.textContent || '';
                break;
              }
              current = current.previousElementSibling;
            }
            if (!labelText && el.parentElement?.tagName.toLowerCase() === 'label') {
              labelText = el.parentElement.textContent || '';
            }
          }
          data.labelText = labelText.trim();

          // Get aria-label or aria-labelledby
          data.ariaLabel = el.getAttribute('aria-label');
          data.ariaLabelledBy = el.getAttribute('aria-labelledby');

          if (el.tagName.toLowerCase() === 'select') {
            data.options = Array.from((el as HTMLSelectElement).options).map(opt => ({
              text: opt.textContent,
              value: opt.value,
            }));
          } else if (el.type === 'radio' || el.type === 'checkbox') {
            data.checked = (el as HTMLInputElement).checked;
          }
          pageContextItems.push({ type: 'formField', domOrder: currentDomOrder, selector: data.selector, formData: data });
        } else {
          // Extract text content from non-form elements if visible and has meaningful text
          const text = el.textContent?.trim();
          // Heuristic to avoid capturing text already covered by form field labels or redundant text
          const isFormRelated = el.closest('label, input, textarea, select');
          // Add a minimum length check for general text content
          if (text && text.length > 10 && !isFormRelated) {
            pageContextItems.push({
              type: 'text',
              domOrder: currentDomOrder,
              selector: getElementXPath(el),
              text: text,
            });
          }
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      const parentElement = node.parentElement;
      // Ensure parent is visible and not a script/style/label/form element, and text is meaningful
      if (text && text.length > 10 && parentElement && isElementVisible(parentElement)) {
        const parentTagName = parentElement.tagName.toUpperCase();
        if (!['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parentTagName) &&
            !parentElement.matches('input, textarea, select, label')) {
          pageContextItems.push({
            type: 'text',
            domOrder: currentDomOrder,
            selector: getElementXPath(parentElement),
            text: text,
          });
        }
      }
    }

    // Recursively traverse children
    node.childNodes.forEach(traverse);
  };

  traverse(document.body); // Start traversal from the body

  return pageContextItems;
}


// Function to execute actions received from the background script
async function executeActions(actions: any[]) {
  const actionHandlers: { [key: string]: (element: HTMLElement, args: any) => void } = {
    fill_text_input: (element, args) => fillTextInput(element as HTMLInputElement | HTMLTextAreaElement, args.value),
    select_dropdown_option: (element, args) => selectDropdownOption(element as HTMLSelectElement, args.value),
    check_radio_or_checkbox: (element, args) => checkRadioOrCheckbox(element as HTMLInputElement, args.checked),
  };

  for (const action of actions) {
    const { name: tool_name, args } = action; // Gemini returns 'name' for the tool name
    const selector = args.selector;

    let element: HTMLElement | null = null;
    try {
      // Use XPath to find the element
      const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      element = result.singleNodeValue as HTMLElement | null;
    } catch (e) {
      console.warn(`Error evaluating XPath '${selector}':`, e);
    }

    if (!element) {
      console.warn(`Element not found for selector: ${selector}`);
      continue;
    }

    try {
      const handler = actionHandlers[tool_name];
      if (handler) {
        handler(element, args);
      } else {
        console.warn(`Unknown tool_name: ${tool_name}`);
        continue;
      }

      // Add temporary visual feedback
      element.style.outline = '2px solid #4CAF50'; // Green outline
      element.style.transition = 'outline 0.3s ease-out';
      setTimeout(() => {
        element.style.outline = 'none';
      }, 1500); // Remove highlight after 1.5 seconds

    } catch (e) {
      console.error(`Error executing action '${tool_name}' on element with selector '${selector}':`, e);
    }
  }
  chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_FORM_DATA') {
    const pageContext = extractPageContext(); // Call the new function
    chrome.runtime.sendMessage({ type: 'FORM_DATA_EXTRACTED', payload: pageContext });
    return true; // Indicates async response
  } else if (message.type === 'EXECUTE_ACTIONS') {
    executeActions(message.payload);
    return true; // Indicates async response
  }
});

console.log('AI Autofill Pro Content Script loaded.');
