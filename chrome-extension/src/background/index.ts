import 'webextension-polyfill';
import { GoogleGenAI, Type } from '@google/genai';

// Temporary storage for autofill requests, as service workers are stateless
const autofillRequests: Record<number, { profile: any; apiKey: string }> = {}; // Change type to 'any' for structured profile

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Mark sendResponse as asynchronous to allow handlers to use it later
  (async () => {
    if (message.type === 'AUTOFILL_REQUEST') {
      await handleAutofillRequest(message.payload, sendResponse);
    } else if (message.type === 'FORM_DATA_EXTRACTED') {
      await handleFormDataExtracted(message.payload, sender.tab?.id, sendResponse);
    } else if (message.type === 'FILL_COMPLETE') {
      await handleFillComplete(sender.tab?.id, sendResponse);
    }
  })();
  return true; // Indicates that sendResponse will be called asynchronously
});

async function handleAutofillRequest(payload: { tabId: number; profile: any; apiKey: string }, sendResponse: (response?: any) => void) {
  const { tabId, profile, apiKey } = payload;
  if (!tabId) {
    console.error('No tabId provided for autofill request.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No tabId provided.' });
    sendResponse({ success: false, error: 'No tabId provided' }); // Send immediate error response
    return;
  }

  // Store the payload temporarily
  autofillRequests[tabId] = { profile, apiKey };

  try {
    // Send message to content script to extract form data
    await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FORM_DATA' });
    // Optionally, send a status update to the popup
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Analyzing form...' });
    sendResponse({ success: true }); // Indicate successful initiation
  } catch (error) {
    console.error('Failed to communicate with content script:', error);
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: `Error: ${error instanceof Error ? error.message : String(error)}` });
    delete autofillRequests[tabId]; // Clean up
    sendResponse({ success: false, error: `Failed to communicate with content script: ${error instanceof Error ? error.message : String(error)}` }); // Send error response
  }
}

async function handleFormDataExtracted(pageContextItems: any[], tabId: number | undefined, sendResponse: (response?: any) => void) {
  if (!tabId || !autofillRequests[tabId]) {
    console.error('No active autofill request found for this tab.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No active autofill request.' });
    sendResponse({ success: false, error: 'No active autofill request.' }); // Send immediate error response
    return;
  }

  const { profile, apiKey } = autofillRequests[tabId];

  if (!apiKey) {
    console.error('Gemini API Key is missing.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: Gemini API Key is missing. Please set it in the popup.' });
    delete autofillRequests[tabId];
    sendResponse({ success: false, error: 'Gemini API Key is missing.' }); // Send error response
    return;
  }

  // Acknowledge receipt to the content script immediately.
  // The actual result of the Gemini call will be communicated via chrome.tabs.sendMessage later.
  sendResponse({ success: true, message: 'Form data received, processing with Gemini...' });
  chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Sending data to Gemini...' });

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const model = ai.models;

  // Sort page context items by their DOM order
  pageContextItems.sort((a, b) => a.domOrder - b.domOrder);

  let pageStructureDescription = '';
  let formElementsForPrompt: any[] = [];

  pageContextItems.forEach(item => {
    if (item.type === 'text') {
      pageStructureDescription += `Text: "${item.text}"\n`;
    } else if (item.type === 'formField') {
      const formData = item.formData;
      formElementsForPrompt.push(formData); // Collect form elements separately for the structured part

      let fieldDescription = `Form Field (Type: ${formData.type}`;
      if (formData.id) fieldDescription += `, ID: "${formData.id}"`;
      if (formData.name) fieldDescription += `, Name: "${formData.name}"`;
      if (formData.labelText) fieldDescription += `, Label: "${formData.labelText}"`;
      else if (formData.ariaLabel) fieldDescription += `, Aria-Label: "${formData.ariaLabel}"`;
      else if (formData.ariaLabelledBy) fieldDescription += `, Aria-LabelledBy: "${formData.ariaLabelledBy}"`;
      if (formData.placeholder) fieldDescription += `, Placeholder: "${formData.placeholder}"`;
      if (formData.value) fieldDescription += `, Current Value: "${formData.value}"`;
      if (formData.type === 'radio' || formData.type === 'checkbox') fieldDescription += `, Checked: ${formData.checked}`;
      fieldDescription += `)\n`;
      fieldDescription += `  Selector: ${formData.selector}\n`;
      pageStructureDescription += fieldDescription;
      pageStructureDescription += `\n`; // Add a newline for readability
    }
  });

  const prompt = `You are an AI assistant specialized in intelligently filling web forms.
Here is a description of the web page's structure, including text content and form elements, ordered by their appearance in the DOM:
${pageStructureDescription}

Here is a more structured list of the form elements found on the page, including their unique selectors for interaction:
${JSON.stringify(formElementsForPrompt, null, 2)}

Here is the user's personal information. Use these details to fill the form:
${profile}

Your goal is to fill out this form accurately using the provided user information.
You have the following tools available:
function fill_text_input(selector: string, value: string, field_type: string)
function select_dropdown_option(selector: string, value: string)
function check_radio_or_checkbox(selector: string, checked: boolean)

Based on the form elements, the surrounding text context, and user data, suggest the next action(s) to take using the available tools. Output your action(s) as a JSON array of tool calls.
`;

  try {
    const result = await model.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'fill_text_input',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    selector: { type: Type.STRING },
                    value: { type: Type.STRING },
                    field_type: { type: Type.STRING },
                  },
                  required: ['selector', 'value', 'field_type'],
                },
              },
              {
                name: 'select_dropdown_option',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    selector: { type: Type.STRING },
                    value: { type: Type.STRING },
                  },
                  required: ['selector', 'value'],
                },
              },
              {
                name: 'check_radio_or_checkbox',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    selector: { type: Type.STRING },
                    checked: { type: Type.BOOLEAN },
                  },
                  required: ['selector', 'checked'],
                },
              },
            ],
          },
        ],
      },
    });

    // Log the LLM response
    const responseText = result.text;
    console.log('Gemini LLM Raw Response Text:', responseText);
    const toolCalls = result.functionCalls;
    console.log('Gemini LLM Function Calls:', toolCalls);

    if (toolCalls && toolCalls.length > 0) {
      chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Filling fields...' });
      await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTIONS', payload: toolCalls });
      // No sendResponse here for the original message, it was already sent.
      // The content script will receive EXECUTE_ACTIONS directly.
    } else {
      chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'No fields to fill or Gemini returned no actions.' });
      // No sendResponse here.
    }

  } catch (error: any) { // Explicitly type error as 'any' to access properties
    console.error('Gemini API call failed:', error);
    let userFriendlyMessage = `Error from Gemini: ${error instanceof Error ? error.message : String(error)}`;

    // Check for 429 Quota Exceeded error
    if (error.response && error.response.status === 429) {
      try {
        const errorBody = JSON.parse(await error.response.text());
        const quotaMetric = errorBody.error?.details?.[0]?.violations?.[0]?.quotaMetric;
        const retryDelay = errorBody.error?.details?.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')?.retryDelay;

        if (quotaMetric) {
          userFriendlyMessage = `Gemini API Quota Exceeded. Please try again later or check your Google Cloud project's billing and quota limits.`;
          if (retryDelay) {
            userFriendlyMessage += ` Recommended wait time: ${retryDelay}.`;
          }
        } else {
          userFriendlyMessage = `Gemini API Quota Exceeded (429).`;
          if (retryDelay) {
            userFriendlyMessage += ` Recommended wait time: ${retryDelay}.`;
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse Gemini 429 error response:', parseError);
        userFriendlyMessage = `Gemini API Quota Exceeded (429). Could not determine retry time.`;
      }
    }

    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: userFriendlyMessage });
    // No sendResponse here.
  } finally {
    delete autofillRequests[tabId]; // Clean up
  }
}

function handleFillComplete(tabId: number | undefined, sendResponse: (response?: any) => void) {
  chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Autofill Complete! Please review.' });
  if (tabId) {
    delete autofillRequests[tabId]; // Ensure cleanup
  }
  sendResponse({ success: true }); // Acknowledge completion
}

console.log('AI Autofill Pro Background Service Worker loaded.');
