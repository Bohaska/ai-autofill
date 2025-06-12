import React, { useState, useEffect } from 'react';
import '@src/Popup.css';
import { t } from '@extension/i18n';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui'; // Keep if still needed for suspense/error boundary

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const Popup = () => {
  const [profile, setProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready to autofill.');

  useEffect(() => {
    // Load profile and API key from storage on component mount
    chrome.storage.local.get(['userProfile', 'geminiApiKey'], result => {
      if (result.userProfile) {
        setProfile(result.userProfile);
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

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    await chrome.storage.local.set({ userProfile: profile, geminiApiKey: geminiApiKey });
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
        profile: profile,
        apiKey: geminiApiKey,
      },
    });
  };

  return (
    <div className="App min-w-[300px] p-4 bg-slate-50 text-gray-900">
      <header className="App-header flex flex-col items-center justify-center">
        <img src={chrome.runtime.getURL('icon-128.png')} className="App-logo w-24 h-24 mb-4" alt="AI Autofill Pro Logo" />
        <h1 className="text-xl font-bold mb-4">AI Autofill Pro</h1>

        <div className="w-full mb-4">
          <h2 className="text-lg font-semibold mb-2">Your Profile</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input type="text" name="firstName" placeholder="First Name" value={profile.firstName} onChange={handleProfileChange} className="p-1 border rounded" />
            <input type="text" name="lastName" placeholder="Last Name" value={profile.lastName} onChange={handleProfileChange} className="p-1 border rounded" />
            <input type="email" name="email" placeholder="Email" value={profile.email} onChange={handleProfileChange} className="p-1 border rounded col-span-2" />
            <input type="tel" name="phone" placeholder="Phone" value={profile.phone} onChange={handleProfileChange} className="p-1 border rounded col-span-2" />
            <input type="text" name="addressLine1" placeholder="Address Line 1" value={profile.addressLine1} onChange={handleProfileChange} className="p-1 border rounded col-span-2" />
            <input type="text" name="city" placeholder="City" value={profile.city} onChange={handleProfileChange} className="p-1 border rounded" />
            <input type="text" name="state" placeholder="State" value={profile.state} onChange={handleProfileChange} className="p-1 border rounded" />
            <input type="text" name="zip" placeholder="Zip Code" value={profile.zip} onChange={handleProfileChange} className="p-1 border rounded" />
            <input type="text" name="country" placeholder="Country" value={profile.country} onChange={handleProfileChange} className="p-1 border rounded" />
          </div>
          <button onClick={handleSaveProfile} className="mt-2 w-full bg-blue-500 text-white py-1 rounded hover:bg-blue-600">
            {t('saveProfileButton', 'Save Profile')}
          </button>
        </div>

        <div className="w-full mb-4">
          <h2 className="text-lg font-semibold mb-2">Gemini API Key</h2>
          <input
            type="password"
            placeholder="Enter your Gemini API Key"
            value={geminiApiKey}
            onChange={e => setGeminiApiKey(e.target.value)}
            className="w-full p-1 border rounded"
          />
          <p className="text-xs text-gray-600 mt-1">
            Your API key is stored locally in your browser. Get one from{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              Google AI Studio
            </a>
            .
          </p>
        </div>

        <button
          onClick={handleAutofillNow}
          className="w-full bg-green-500 text-white py-2 rounded-lg text-lg font-bold shadow hover:bg-green-600 transition-colors duration-200"
        >
          {t('autofillNowButton', 'Autofill Now')}
        </button>

        <p className="mt-4 text-sm text-gray-700">Status: {status}</p>

        <p className="mt-4 text-xs text-gray-500 text-center">
          Disclaimer: By using Autofill, your form data and parts of the webpage DOM will be sent to Google's Gemini API for processing.
          Please review Google's{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
