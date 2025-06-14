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

async function handleFormDataExtracted(formData: any[], tabId: number | undefined, sendResponse: (response?: any) => void) {
  if (!tabId || !autofillRequests[tabId]) {
    console.error('No active autofill request found for this tab.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No active autofill request.' });
    sendResponse({ success: false, error: 'No active autofill request.' }); // Send error response
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

  chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Sending data to Gemini...' });

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const model = ai.models;

  const prompt = `You are an AI assistant specialized in intelligently filling web forms.
Here is the current state of the web page's form elements (including their unique selectors for interaction):
${JSON.stringify(formData, null, 2)}

Here is the user's personal information, provided as a JSON object. Use these structured details to fill the form:
${JSON.stringify(profile, null, 2)}

Your goal is to fill out this form accurately using the provided user information.
You have the following tools available:
function fill_text_input(selector: string, value: string, field_type: string)
function select_dropdown_option(selector: string, value: string)
function check_radio_or_checkbox(selector: string, checked: boolean)

Based on the form elements and user data, suggest the next action(s) to take using the available tools. Output your action(s) as a JSON array of tool calls.
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
      sendResponse({ success: true, actionsSent: true }); // Indicate success and actions sent
    } else {
      chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'No fields to fill or Gemini returned no actions.' });
      sendResponse({ success: true, actionsSent: false }); // Indicate success, but no actions
    }

  } catch (error) {
    console.error('Gemini API call failed:', error);
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: `Error from Gemini: ${error instanceof Error ? error.message : String(error)}` });
    sendResponse({ success: false, error: `Gemini API call failed: ${error instanceof Error ? error.message : String(error)}` }); // Send error response
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
