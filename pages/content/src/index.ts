console.log('AI Autofill Pro Content Script: Initializing...');
import 'webextension-polyfill';
import { checkRadioOrCheckbox, extractPageContext, fillTextInput, selectDropdownOption } from './utils';

// Function to execute actions received from the background script
async function executeActions(actions: any[]) {
  console.log('Executing actions:', actions);
  const actionHandlers: { [key: string]: (element: HTMLElement, args: any) => void } = {
    fill_text_input: (element, args) => fillTextInput(element as HTMLInputElement | HTMLTextAreaElement, args.value),
    select_dropdown_option: (element, args) => selectDropdownOption(element as HTMLSelectElement, args.value),
    check_radio_or_checkbox: (element, args) => checkRadioOrCheckbox(element as HTMLInputElement, args.checked),
  };

  for (const action of actions) {
    const { tool_name, args } = action;
    const selector = args.selector;
    console.log(`Processing action: ${tool_name} for selector: ${selector} with args:`, args);

    let element: HTMLElement | null = null;
    try {
      // Use XPath to find the element
      const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      element = result.singleNodeValue as HTMLElement | null;
      console.log(`Element found for selector ${selector}:`, element);
    } catch (e) {
      console.warn(`Error evaluating XPath '${selector}':`, e);
      continue;
    }

    if (!element) {
      console.warn(`Element not found for selector: ${selector}`);
      continue;
    }

    try {
      const handler = actionHandlers[tool_name];
      if (handler) {
        console.log(`Calling handler for ${tool_name} on element:`, element);
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
      continue;
    }
  }
  chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_FORM_DATA') {
    const pageContext = extractPageContext();
    chrome.runtime.sendMessage({ type: 'FORM_DATA_EXTRACTED', payload: pageContext });
    return true; // Indicates async response
  } else if (message.type === 'EXECUTE_ACTIONS') {
    console.log('Content Script: Received EXECUTE_ACTIONS message.');
    executeActions(message.payload);
    return true; // Indicates async response
  }
});

console.log('AI Autofill Pro Content Script loaded.');
