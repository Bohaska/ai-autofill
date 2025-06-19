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
  const [profiles, setProfiles] = useState<Record<string, string>>({}); // New state for multiple profiles
  const [selectedProfileName, setSelectedProfileName] = useState<string>(''); // New state for selected profile
  const [newProfileName, setNewProfileName] = useState<string>(''); // New state for naming new profiles

  useEffect(() => {
    // Load profiles, selected profile, and API key from storage on component mount
    chrome.storage.local.get(['profiles', 'selectedProfileName', 'geminiApiKey'], result => {
      const loadedProfiles = result.profiles || {};
      setProfiles(loadedProfiles);

      const loadedSelectedProfileName = result.selectedProfileName || '';
      setSelectedProfileName(loadedSelectedProfileName);

      if (loadedSelectedProfileName && loadedProfiles[loadedSelectedProfileName]) {
        setProfileText(loadedProfiles[loadedSelectedProfileName]);
      } else if (Object.keys(loadedProfiles).length > 0) {
        // If no selected profile, but profiles exist, select the first one
        const firstProfileName = Object.keys(loadedProfiles)[0];
        setSelectedProfileName(firstProfileName);
        setProfileText(loadedProfiles[firstProfileName]);
        chrome.storage.local.set({ selectedProfileName: firstProfileName }); // Persist selection
      } else {
        // No profiles exist, clear profileText
        setProfileText('');
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
    if (!selectedProfileName) {
      setStatus('Please select or create a profile to save.');
      return;
    }
    const updatedProfiles = { ...profiles, [selectedProfileName]: profileText };
    setProfiles(updatedProfiles);
    await chrome.storage.local.set({ profiles: updatedProfiles });
    setStatus(`Profile "${selectedProfileName}" saved!`);
  };

  const handleCreateNewProfile = async () => {
    if (!newProfileName.trim()) {
      setStatus('Please enter a name for the new profile.');
      return;
    }
    if (profiles[newProfileName.trim()]) {
      setStatus(`Profile "${newProfileName.trim()}" already exists. Please choose a different name or select it to edit.`);
      return;
    }

    const newProfileContent = profileText || ''; // Use current text or empty string
    const updatedProfiles = { ...profiles, [newProfileName.trim()]: newProfileContent };
    setProfiles(updatedProfiles);
    setSelectedProfileName(newProfileName.trim());
    setProfileText(newProfileContent); // Set current text to new profile's content
    setNewProfileName(''); // Clear new profile name input
    await chrome.storage.local.set({ profiles: updatedProfiles, selectedProfileName: newProfileName.trim() });
    setStatus(`New profile "${newProfileName.trim()}" created and selected!`);
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileName) {
      setStatus('No profile selected to delete.');
      return;
    }
    if (Object.keys(profiles).length === 1) {
      setStatus('Cannot delete the last profile. Please create another one first.');
      return;
    }

    const { [selectedProfileName]: _, ...remainingProfiles } = profiles;
    setProfiles(remainingProfiles);

    const newSelectedName = Object.keys(remainingProfiles)[0] || '';
    setSelectedProfileName(newSelectedName);
    setProfileText(remainingProfiles[newSelectedName] || '');

    await chrome.storage.local.set({ profiles: remainingProfiles, selectedProfileName: newSelectedName });
    setStatus(`Profile "${selectedProfileName}" deleted.`);
  };

  const handleSelectProfile = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedProfileName(name);
    setProfileText(profiles[name] || '');
    await chrome.storage.local.set({ selectedProfileName: name });
    setStatus(`Profile "${name}" selected.`);
  };

  const handleSaveApiKey = async () => {
    await chrome.storage.local.set({ geminiApiKey: geminiApiKey });
    setStatus('API Key saved!');
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

    if (!profileText) { // Ensure a profile is loaded
      setStatus('Error: No profile data available for autofill. Please select or create a profile.');
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
    <div className="App min-w-[300px] bg-slate-50 p-4 text-gray-900 overflow-y-auto">
      <header className="App-header flex flex-col items-center">
        <h1 className="mb-4 text-xl font-bold">AI Autofill Pro</h1>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Manage Profiles</h2>
          <div className="mb-2 flex items-center gap-2">
            <select
              value={selectedProfileName}
              onChange={handleSelectProfile}
              className="flex-grow rounded border p-1"
            >
              <option value="" disabled>
                Select a profile
              </option>
              {Object.keys(profiles).map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={handleDeleteProfile}
              className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600"
              disabled={!selectedProfileName || Object.keys(profiles).length === 1}
            >
              Delete
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New profile name"
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              className="flex-grow rounded border p-1"
            />
            <button
              onClick={handleCreateNewProfile}
              className="rounded bg-green-500 px-3 py-1 text-white hover:bg-green-600"
              disabled={!newProfileName.trim()}
            >
              Create New
            </button>
          </div>
        </div>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">
            Current Profile Content ({selectedProfileName || 'No Profile Selected'})
          </h2>
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
            className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600"
            disabled={!selectedProfileName}
          >
            {t('saveProfileButton', 'Save Current Profile')}
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
          <button
            onClick={handleSaveApiKey}
            className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600"
          >
            Save API Key
          </button>
          <p className="mt-1 text-xs text-gray-600">
            Your API key is stored locally in your browser. Get one from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Google AI Studio
            </a>
            .
          </p>
        </div>

        <button
          onClick={handleAutofillNow}
          className="w-full rounded-lg bg-green-500 py-2 text-lg font-bold text-white shadow transition-colors duration-200 hover:bg-green-600"
          disabled={!profileText || !geminiApiKey}
        >
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
