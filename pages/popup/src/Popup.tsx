import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import '@src/Popup.css';
import { t } from '@extension/i18n';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';

const Popup = () => {
  const [status, setStatus] = useState<string>('Ready to autofill.');
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');

  useEffect(() => {
    // Load profiles and selected profile from storage on component mount
    chrome.storage.local.get(['profiles', 'selectedProfileName'], result => {
      const loadedProfiles = result.profiles || {};
      setProfiles(loadedProfiles);

      let initialSelectedProfileName = result.selectedProfileName || '';

      // If no selected profile, but profiles exist, select the first one
      if (!initialSelectedProfileName && Object.keys(loadedProfiles).length > 0) {
        initialSelectedProfileName = Object.keys(loadedProfiles)[0];
        chrome.storage.local.set({ selectedProfileName: initialSelectedProfileName }); // Persist selection
      }
      setSelectedProfileName(initialSelectedProfileName);
    });

    // Listen for status updates from the background script
    const messageListener = (message: any) => {
      if (message.type === 'UPDATE_POPUP_STATUS') {
        setStatus(message.payload);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleSelectProfile = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedProfileName(name);
    await chrome.storage.local.set({ selectedProfileName: name });
    setStatus(`Profile "${name}" selected.`);
  }, []);

  const handleAutofillNow = useCallback(async () => {
    setStatus('Initiating autofill...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      setStatus('Error: No active tab found.');
      return;
    }

    // Retrieve latest profile data and API key directly from storage
    const storageResult = await chrome.storage.local.get(['profiles', 'selectedProfileName', 'geminiApiKey']);
    const currentProfiles = storageResult.profiles || {};
    const currentSelectedProfileName = storageResult.selectedProfileName || '';
    const currentGeminiApiKey = storageResult.geminiApiKey || '';
    const currentProfileText = currentProfiles[currentSelectedProfileName] || '';

    if (!currentGeminiApiKey) {
      setStatus('Error: Please enter your Gemini API Key in the Options page.');
      return;
    }

    if (!currentProfileText) {
      setStatus('Error: No profile data available for autofill. Please select or create a profile in the Options page.');
      return;
    }

    // Send message to background script to start autofill
    chrome.runtime.sendMessage({
      type: 'AUTOFILL_REQUEST',
      payload: {
        tabId: tab.id,
        profile: currentProfileText, // Send plaintext profile
        apiKey: currentGeminiApiKey,
      },
    });
  }, []);

  const handleOpenOptions = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  return (
    <div className="App min-w-[300px] bg-slate-50 p-4 text-gray-900 overflow-y-auto">
      <header className="App-header flex flex-col items-center">
        <h1 className="mb-4 text-xl font-bold">AI Autofill Pro</h1>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Select Profile</h2>
          <div className="mb-2 flex items-center gap-2">
            <select
              value={selectedProfileName}
              onChange={handleSelectProfile}
              className="flex-grow rounded border p-1"
            >
              <option value="" disabled>
                Select a profile
              </option>
              {Object.keys(profiles).length === 0 && (
                <option value="" disabled>
                  No profiles found. Go to Options.
                </option>
              )}
              {Object.keys(profiles).map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleAutofillNow}
          className="w-full rounded-lg bg-green-500 py-2 text-lg font-bold text-white shadow transition-colors duration-200 hover:bg-green-600"
          disabled={!selectedProfileName || Object.keys(profiles).length === 0}
        >
          {t('autofillNowButton', 'Autofill Now')}
        </button>

        <p className="mt-4 text-sm text-gray-700">Status: {status}</p>

        <button
          onClick={handleOpenOptions}
          className="mt-4 w-full rounded bg-gray-200 py-1 text-sm text-gray-800 hover:bg-gray-300"
        >
          Manage Profiles & API Key (Options)
        </button>

        <p className="mt-4 text-center text-xs text-gray-500">
          Disclaimer: By using Autofill, your form data and parts of the webpage DOM will be sent to Google's Gemini API
          for processing. Please review Google's{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
