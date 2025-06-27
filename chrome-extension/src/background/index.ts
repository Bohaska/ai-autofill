import 'webextension-polyfill';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';

// Temporary storage for autofill requests, as service workers are stateless
const autofillRequests: Record<
  number,
  {
    profile: any;
    geminiApiKey: string;
    selectedGeminiModel: string;
    openAiApiKey: string;
    selectedOpenAiModel: string;
    anthropicApiKey: string;
    selectedAnthropicModel: string;
    selectedProvider: 'gemini' | 'openai' | 'anthropic';
  }
> = {}; // Change type to 'any' for structured profile

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

async function handleAutofillRequest(
  payload: { tabId: number; profile: any; apiKey: string },
  sendResponse: (response?: any) => void,
) {
  const { tabId, profile, apiKey } = payload;
  if (!tabId) {
    console.error('No tabId provided for autofill request.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No tabId provided.' });
    sendResponse({ success: false, error: 'No tabId provided' }); // Send immediate error response
    return;
  }

  const { model: selectedGeminiModel } = await chrome.storage.local.get('ai-model-storage-key');
  const { apiKey: openAiApiKey, model: selectedOpenAiModel } = await chrome.storage.local.get('openai-storage-key');
  const { apiKey: anthropicApiKey, model: selectedAnthropicModel } =
    await chrome.storage.local.get('anthropic-storage-key');
  const { provider: selectedProvider } = await chrome.storage.local.get('provider-storage-key');

  // Store the payload temporarily
  autofillRequests[tabId] = {
    profile,
    geminiApiKey: apiKey,
    selectedGeminiModel: selectedGeminiModel || 'gemini-2.5-flash-lite-preview-06-17',
    openAiApiKey: openAiApiKey || '',
    selectedOpenAiModel: selectedOpenAiModel || 'gpt-4.1-mini',
    anthropicApiKey: anthropicApiKey || '',
    selectedAnthropicModel: selectedAnthropicModel || 'claude-3-5-haiku-latest',
    selectedProvider: selectedProvider || 'gemini',
  };

  try {
    // Send message to content script to extract form data
    await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FORM_DATA' });
    // Optionally, send a status update to the popup
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Analyzing form...' });
    sendResponse({ success: true }); // Indicate successful initiation
  } catch (error) {
    console.error('Failed to communicate with content script:', error);
    chrome.runtime.sendMessage({
      type: 'UPDATE_POPUP_STATUS',
      payload: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    delete autofillRequests[tabId]; // Clean up
    sendResponse({
      success: false,
      error: `Failed to communicate with content script: ${error instanceof Error ? error.message : String(error)}`,
    }); // Send error response
  }
}

async function handleFormDataExtracted(
  pageContextItems: any[],
  tabId: number | undefined,
  sendResponse: (response?: any) => void,
) {
  if (!tabId || !autofillRequests[tabId]) {
    console.error('No active autofill request found for this tab.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No active autofill request.' });
    sendResponse({ success: false, error: 'No active autofill request.' }); // Send immediate error response
    return;
  }

  const {
    profile,
    geminiApiKey,
    selectedGeminiModel,
    openAiApiKey,
    selectedOpenAiModel,
    anthropicApiKey,
    selectedAnthropicModel,
    selectedProvider,
  } = autofillRequests[tabId];

  let aiModel: any;
  let modelName: string;

  if (selectedProvider === 'gemini') {
    if (!geminiApiKey) {
      console.error('Gemini API Key is missing.');
      chrome.runtime.sendMessage({
        type: 'UPDATE_POPUP_STATUS',
        payload: 'Error: Gemini API Key is missing. Please set it in the popup.',
      });
      delete autofillRequests[tabId];
      sendResponse({ success: false, error: 'Gemini API Key is missing.' });
      return;
    }
    aiModel = new GoogleGenAI({ apiKey: geminiApiKey });
    modelName = selectedGeminiModel;
  } else if (selectedProvider === 'openai') {
    if (!openAiApiKey) {
      console.error('OpenAI API Key is missing.');
      chrome.runtime.sendMessage({
        type: 'UPDATE_POPUP_STATUS',
        payload: 'Error: OpenAI API Key is missing. Please set it in the popup.',
      });
      delete autofillRequests[tabId];
      sendResponse({ success: false, error: 'OpenAI API Key is missing.' });
      return;
    }
    aiModel = new OpenAI({ apiKey: openAiApiKey });
    modelName = selectedOpenAiModel;
  } else if (selectedProvider === 'anthropic') {
    if (!anthropicApiKey) {
      console.error('Anthropic API Key is missing.');
      chrome.runtime.sendMessage({
        type: 'UPDATE_POPUP_STATUS',
        payload: 'Error: Anthropic API Key is missing. Please set it in the popup.',
      });
      delete autofillRequests[tabId];
      sendResponse({ success: false, error: 'Anthropic API Key is missing.' });
      return;
    }
    aiModel = new Anthropic({ apiKey: anthropicApiKey });
    modelName = selectedAnthropicModel;
  } else {
    console.error('No AI provider selected.');
    chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Error: No AI provider selected.' });
    delete autofillRequests[tabId];
    sendResponse({ success: false, error: 'No AI provider selected.' });
    return;
  }

  // Acknowledge receipt to the content script immediately.
  // The actual result of the AI call will be communicated via chrome.tabs.sendMessage later.
  sendResponse({ success: true, message: `Form data received, processing with ${selectedProvider}...` });
  chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: `Sending data to ${selectedProvider}...` });

  // Sort page context items by their DOM order
  pageContextItems.sort((a, b) => a.domOrder - b.domOrder);

  let pageStructureDescription = '';
  const formElementsForPrompt: any[] = [];

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
      if (formData.type === 'radio' || formData.type === 'checkbox')
        fieldDescription += `, Checked: ${formData.checked}`;
      fieldDescription += `)\n`;
      fieldDescription += `  Selector: ${formData.selector}\n`;
      pageStructureDescription += fieldDescription;
      pageStructureDescription += `\n`; // Add a newline for readability
    }
  });

  const prompt = `You are an AI assistant specialized in intelligently filling web forms.\nHere is a description of the web page's structure, including text content and form elements, ordered by their appearance in the DOM:\n${pageStructureDescription}\n\nHere is a more structured list of the form elements found on the page, including their unique selectors for interaction:\n${JSON.stringify(formElementsForPrompt, null, 2)}\n\nHere is the user's personal information. Use these details to fill the form:\n${profile}\n\nYour goal is to fill out this form accurately and completely in a single set of actions using the provided user information.\nYou have the following tools available:\nfunction fill_text_input(selector: string, value: string, field_type: string)\nfunction select_dropdown_option(selector: string, value: string)\nfunction check_radio_or_checkbox(selector: string, checked: boolean)\n\nBased on the form elements, the surrounding text context, and user data, suggest the next action(s) to take using the available tools. Output your action(s) as a JSON array of tool calls.\n`;

  try {
    let toolCalls;
    const commonTools = [
      {
        name: 'fill_text_input',
        description: 'Fills a text input field or textarea with the given value.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'The XPath selector of the input field.' },
            value: { type: 'string', description: 'The value to fill into the input field.' },
            field_type: {
              type: 'string',
              description: 'The type of the field (e.g., text, email, password, tel, textarea).',
            },
          },
          required: ['selector', 'value', 'field_type'],
        },
      },
      {
        name: 'select_dropdown_option',
        description: 'Selects an option in a dropdown (select) element.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'The XPath selector of the select element.' },
            value: { type: 'string', description: 'The value of the option to select.' },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'check_radio_or_checkbox',
        description: 'Checks or unchecks a radio button or checkbox.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'The XPath selector of the radio or checkbox input.' },
            checked: { type: 'boolean', description: 'True to check, false to uncheck.' },
          },
          required: ['selector', 'checked'],
        },
      },
    ];

    if (selectedProvider === 'gemini') {
      const geminiTools = commonTools.map(tool => ({
        functionDeclarations: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as any, // Type assertion for Gemini's Type.OBJECT
        },
      }));

      const geminiResult = await aiModel.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: geminiTools,
      });
      toolCalls =
        geminiResult.functionCalls?.map(call => ({
          tool_name: call.name,
          args: call.args,
        })) || [];
      console.log(`${selectedProvider} LLM Raw Response Text:`, geminiResult.text);
    } else if (selectedProvider === 'openai') {
      const openaiTools = commonTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      const chatCompletion = await aiModel.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        tools: openaiTools,
        tool_choice: 'auto',
      });

      // Process OpenAI tool calls
      toolCalls =
        chatCompletion.choices[0].message.tool_calls?.map(call => ({
          tool_name: call.function.name,
          args: JSON.parse(call.function.arguments), // Parse the JSON string arguments
        })) || [];
      console.log(`${selectedProvider} LLM Raw Response Text:`, chatCompletion.choices[0].message.content);
    } else if (selectedProvider === 'anthropic') {
      const anthropicTools = commonTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));

      const anthropicResponse = await aiModel.messages.create({
        model: modelName,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        tools: anthropicTools,
      });

      // Process Anthropic tool calls
      toolCalls =
        anthropicResponse.content
          .filter(block => block.type === 'tool_use')
          .map(block => ({
            tool_name: block.name,
            args: block.input,
          })) || [];
      console.log(`${selectedProvider} LLM Raw Response Text:`, anthropicResponse.content);
    }

    console.log(`${selectedProvider} LLM Function Calls:`, toolCalls);

    if (toolCalls && toolCalls.length > 0) {
      chrome.runtime.sendMessage({ type: 'UPDATE_POPUP_STATUS', payload: 'Filling fields...' });
      await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTIONS', payload: toolCalls });
      // No sendResponse here for the original message, it was already sent.
      // The content script will receive EXECUTE_ACTIONS directly.
    } else {
      chrome.runtime.sendMessage({
        type: 'UPDATE_POPUP_STATUS',
        payload: `No fields to fill or ${selectedProvider} returned no actions.`,
      });
      // No sendResponse here.
    }
  } catch (error: any) {
    // Explicitly type error as 'any' to access properties
    console.error(`${selectedProvider} API call failed:`, error);
    let userFriendlyMessage = `Error from ${selectedProvider}: ${error instanceof Error ? error.message : String(error)}`;

    // Check for 429 Quota Exceeded error (Gemini specific)
    if (selectedProvider === 'gemini' && error.response && error.response.status === 429) {
      try {
        const errorBody = JSON.parse(await error.response.text());
        const quotaMetric = errorBody.error?.details?.[0]?.violations?.[0]?.quotaMetric;
        const retryDelay = errorBody.error?.details?.find(
          (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
        )?.retryDelay;

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
    } else if (selectedProvider === 'openai' && error.response && error.response.status === 429) {
      // OpenAI specific 429 handling (if different)
      userFriendlyMessage = `OpenAI API Rate Limit Exceeded. Please try again later.`;
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
