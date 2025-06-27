import 'webextension-polyfill';

// Helper to check if an element is visible
export function isElementVisible(el: Element): boolean {
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

// Helper to check if an element contains only text nodes as children
export function hasOnlyTextNodeChildren(element: HTMLElement): boolean {
  if (!element.hasChildNodes()) {
    return true; // No children, so effectively only text nodes (or none)
  }
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType !== Node.TEXT_NODE) {
      return false; // Found a non-text node child
    }
  }
  return true; // All children are text nodes
}

// Function to get a robust XPath for an element
export function getElementXPath(element: Element): string {
  if (element.id !== '') {
    return `//*[@id='${element.id}']`;
  }
  if (element === document.body) {
    return '/html/body';
  }

  const parent = element.parentNode;
  if (!parent || !(parent instanceof HTMLElement)) {
    return ''; // Should not happen for elements within a document
  }

  let ix = 0;
  const siblings = parent.children;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return `${getElementXPath(parent)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
  return ''; // Fallback if no unique path found
}

// Function to extract form data from the current page
export function extractFormData() {
  const formElements: any[] = [];
  document.querySelectorAll('input, textarea, select').forEach(element => {
    const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const data: any = {
      tagName: el.tagName.toLowerCase(),
      type: el.type || el.tagName.toLowerCase(), // 'input' type can be missing
      id: el.id,
      name: el.name,
      placeholder: ('placeholder' in el) ? el.placeholder : undefined,
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

// Helper functions for specific actions
export function fillTextInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  console.log(`Filling text input with selector: ${getElementXPath(element)} with value: ${value}`);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function selectDropdownOption(element: HTMLSelectElement, value: string) {
  console.log(`Selecting dropdown option with selector: ${getElementXPath(element)} with value: ${value}`);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function checkRadioOrCheckbox(element: HTMLInputElement, checked: boolean) {
  console.log(`Checking radio/checkbox with selector: ${getElementXPath(element)} with checked: ${checked}`);
  element.checked = checked;
  element.dispatchEvent(new Event('click', { bubbles: true })); // Click often triggers more reliably for checkboxes/radios
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Function to extract all relevant page content (form elements and surrounding text)
export function extractPageContext() {
  const pageContextItems: any[] = [];
  let domOrderCounter = 0;

  // Whitelist of tags from which to extract general text content
  const TEXT_EXTRACTION_TAGS_WHITELIST = new Set([
    'LABEL', 'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'LI', 'TD', 'TH', 'A', 'BUTTON'
  ]);

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

      if (isElementVisible(el)) { // Keep visibility check
        // Check if it's a form element
        if (el.matches('input, textarea, select')) {
          const data: any = {
            tagName: el.tagName.toLowerCase(),
            type: (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).type || el.tagName.toLowerCase(),
            id: el.id,
            name: (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name,
            placeholder: ('placeholder' in el) ? (el as HTMLInputElement | HTMLTextAreaElement).placeholder : undefined,
            value: (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
            selector: getElementXPath(el),
            domOrder: currentDomOrder,
          };

          // Get associated label text
          let labelText = '';
          const inputEl = el as HTMLInputElement;
          if (inputEl.labels && inputEl.labels.length > 0) {
            const firstLabel = inputEl.labels[0];
            if (firstLabel) {
              labelText = firstLabel.textContent || '';
            }
          } else {
            let current = el.previousElementSibling;
            while (current) {
              if (current.tagName.toLowerCase() === 'label') {
                labelText = current.textContent || '';
                break;
              }
              current = current.previousElementSibling;
            }
            const parent = el.parentElement;
            if (!labelText && parent?.tagName.toLowerCase() === 'label') {
              labelText = parent.textContent || '';
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
          // Extract text content from non-form elements if visible and in whitelist
          const text = el.textContent?.trim();
          const tagName = el.tagName.toUpperCase();
          // Heuristic to avoid capturing text already covered by form field labels or redundant text
          const isFormRelated = el.closest('label, input, textarea, select');
          // Check if tag is in whitelist, text is meaningful, not form-related, and element only contains text nodes
          if (text && text.length > 1 && TEXT_EXTRACTION_TAGS_WHITELIST.has(tagName) && !isFormRelated && hasOnlyTextNodeChildren(el)) {
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
      // Ensure parent is visible, its tag is in whitelist, text is meaningful, not form-related, and parent only contains text nodes
      if (text && text.length > 1 && parentElement && isElementVisible(parentElement)) {
        const parentTagName = parentElement.tagName.toUpperCase();
        if (TEXT_EXTRACTION_TAGS_WHITELIST.has(parentTagName) &&
            !parentElement.matches('input, textarea, select, label, option') && // Avoid text within form elements/labels, and option elements
            hasOnlyTextNodeChildren(parentElement)) { // Add this condition
          pageContextItems.push({
            type: 'text',
            domOrder: currentDomOrder,
            selector: getElementXPath(parentElement), // Use parent's XPath for context
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
