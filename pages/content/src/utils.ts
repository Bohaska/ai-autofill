import 'webextension-polyfill';

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
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function selectDropdownOption(element: HTMLSelectElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function checkRadioOrCheckbox(element: HTMLInputElement, checked: boolean) {
  element.checked = checked;
  element.dispatchEvent(new Event('click', { bubbles: true })); // Click often triggers more reliably for checkboxes/radios
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
