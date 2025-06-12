import type React from 'react';
import { useState, useEffect } from 'react';
import '@src/Popup.css';
import { t } from '@extension/i18n';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui'; // Keep if still needed for suspense/error boundary

const Popup = () => {
  const [profileText, setProfileText] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready to autofill.');

  useEffect(() => {
    // Load profile and API key from storage on component mount
    chrome.storage.local.get(['profileText', 'geminiApiKey'], result => {
      if (result.profileText) {
        setProfileText(result.profileText);
      }
      if (result.geminiApiKey) {
        setGeminiApiKey(result.geminiApiKey);
      }
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

  const handleProfileTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProfileText(e.target.value);
  };

  const handleSaveProfile = async () => {
    await chrome.storage.local.set({ profileText: profileText, geminiApiKey: geminiApiKey });
    setStatus('Profile saved!');
  };

  const handleAutofillNow = async () => {
    setStatus('Initiating autofill...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      setStatus('Error: No active tab found.');
      return;
    }

    if (!geminiApiKey) {
      setStatus('Error: Please enter your Gemini API Key.');
      return;
    }

    // Send message to background script to start autofill
    chrome.runtime.sendMessage({
      type: 'AUTOFILL_REQUEST',
      payload: {
        tabId: tab.id,
        profile: profileText, // Send plaintext profile
        apiKey: geminiApiKey,
      },
    });
  };

  return (
    <div className="App min-w-[300px] bg-slate-50 p-4 text-gray-900">
      <header className="App-header flex flex-col items-center justify-center">
        <img
          src={chrome.runtime.getURL('icon-128.png')}
          className="App-logo mb-4 h-24 w-24"
          alt="AI Autofill Pro Logo"
        />
        <h1 className="mb-4 text-xl font-bold">AI Autofill Pro</h1>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Your Profile (Plaintext)</h2>
          <textarea
            name="profileText"
            placeholder="Enter your personal information here, e.g.,
Name: John Doe
Email: john.doe@example.com
Phone: 555-123-4567
Address: 123 Main St, Anytown, CA 90210, USA
Date of Birth: 1990-01-15
Gender: Male"
            value={profileText}
            onChange={handleProfileTextChange}
            className="h-40 w-full resize-y rounded border p-2 text-sm"
          />
          <button
            onClick={handleSaveProfile}
            className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600">
            {t('saveProfileButton', 'Save Profile')}
          </button>
        </div>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Gemini API Key</h2>
          <input
            type="password"
            placeholder="Enter your Gemini API Key"
            value={geminiApiKey}
            onChange={e => setGeminiApiKey(e.target.value)}
            className="w-full rounded border p-1"
          />
          <p className="mt-1 text-xs text-gray-600">
            Your API key is stored locally in your browser. Get one from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline">
              Google AI Studio
            </a>
            .
          </p>
        </div>

        <button
          onClick={handleAutofillNow}
          className="w-full rounded-lg bg-green-500 py-2 text-lg font-bold text-white shadow transition-colors duration-200 hover:bg-green-600">
          {t('autofillNowButton', 'Autofill Now')}
        </button>

        <p className="mt-4 text-sm text-gray-700">Status: {status}</p>

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
