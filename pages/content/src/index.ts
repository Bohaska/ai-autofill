import 'webextension-polyfill';

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

// Function to extract form data from the current page
function extractFormData() {
  const formElements: any[] = [];
  document.querySelectorAll('input, textarea, select').forEach(element => {
    const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const data: any = {
      tagName: el.tagName.toLowerCase(),
      type: el.type || el.tagName.toLowerCase(), // 'input' type can be missing
      id: el.id,
      name: el.name,
      placeholder: el.placeholder,
      value: el.value,
      selector: getElementXPath(el), // Use XPath for robust selection
    };

    // Get associated label text
    let labelText = '';
    if (el.labels && el.labels.length > 0) {
      labelText = el.labels[0].textContent || '';
    } else {
      // Look for sibling or parent labels
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

    formElements.push(data);
  });
  return formElements;
}

// Function to execute actions received from the background script
async function executeActions(actions: any[]) {
  for (const action of actions) {
    const { tool_name, args } = action;
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
      if (tool_name === 'fill_text_input') {
        (element as HTMLInputElement | HTMLTextAreaElement).value = args.value;
        // Dispatch input and change events to ensure React/other frameworks pick up the change
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (tool_name === 'select_dropdown_option') {
        (element as HTMLSelectElement).value = args.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (tool_name === 'check_radio_or_checkbox') {
        (element as HTMLInputElement).checked = args.checked;
        element.dispatchEvent(new Event('click', { bubbles: true })); // Click often triggers more reliably for checkboxes/radios
        element.dispatchEvent(new Event('change', { bubbles: true }));
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
    const formData = extractFormData();
    chrome.runtime.sendMessage({ type: 'FORM_DATA_EXTRACTED', payload: formData });
    return true; // Indicates async response
  } else if (message.type === 'EXECUTE_ACTIONS') {
    executeActions(message.payload);
    return true; // Indicates async response
  }
});

console.log('AI Autofill Pro Content Script loaded.');
