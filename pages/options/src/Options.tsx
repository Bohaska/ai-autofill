import '@src/Options.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { aiModelStorage, exampleThemeStorage, openAiStorage, providerStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useCallback, useEffect, useState } from 'react';
import type React from 'react';

const Options = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const { model: aiModel } = useStorage(aiModelStorage);
  const { apiKey: openAiApiKey, model: openAiModel } = useStorage(openAiStorage);
  const { provider: selectedProvider } = useStorage(providerStorage);
  const logo = isLight ? 'options/logo_horizontal.svg' : 'options/logo_horizontal_dark.svg';

  const [profileText, setProfileText] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready.');
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');
  const [newProfileName, setNewProfileName] = useState<string>('');

  useEffect(() => {
    // Load profiles, selected profile, and API key from storage on component mount
    chrome.storage.local.get(['profiles', 'selectedProfileName', 'geminiApiKey'], result => {
      const loadedProfiles = result.profiles || {};
      setProfiles(loadedProfiles);

      let initialSelectedProfileName = result.selectedProfileName || '';

      if (initialSelectedProfileName && loadedProfiles[initialSelectedProfileName]) {
        setProfileText(loadedProfiles[initialSelectedProfileName]);
      } else if (Object.keys(loadedProfiles).length > 0) {
        // If no selected profile, but profiles exist, select the first one
        initialSelectedProfileName = Object.keys(loadedProfiles)[0];
        setProfileText(loadedProfiles[initialSelectedProfileName]);
        chrome.storage.local.set({ selectedProfileName: initialSelectedProfileName }); // Persist selection
      } else {
        // No profiles exist, clear profileText
        setProfileText('');
      }
      setSelectedProfileName(initialSelectedProfileName);

      if (result.geminiApiKey) {
        setGeminiApiKey(result.geminiApiKey);
      }
    });
  }, []);

  const handleProfileTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProfileText(e.target.value);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!selectedProfileName) {
      setStatus('Please select or create a profile to save.');
      return;
    }
    const updatedProfiles = { ...profiles, [selectedProfileName]: profileText };
    setProfiles(updatedProfiles);
    await chrome.storage.local.set({ profiles: updatedProfiles });
    setStatus(`Profile "${selectedProfileName}" saved!`);
  }, [selectedProfileName, profileText, profiles]);

  const handleCreateNewProfile = useCallback(async () => {
    if (!newProfileName.trim()) {
      setStatus('Please enter a name for the new profile.');
      return;
    }
    if (profiles[newProfileName.trim()]) {
      setStatus(
        `Profile "${newProfileName.trim()}" already exists. Please choose a different name or select it to edit.`,
      );
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
  }, [newProfileName, profileText, profiles]);

  const handleDeleteProfile = useCallback(async () => {
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
  }, [selectedProfileName, profiles]);

  const handleSelectProfile = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      setSelectedProfileName(name);
      setProfileText(profiles[name] || '');
      await chrome.storage.local.set({ selectedProfileName: name });
      setStatus(`Profile "${name}" selected.`);
    },
    [profiles],
  );

  const handleSaveGeminiApiKey = useCallback(async () => {
    await chrome.storage.local.set({ geminiApiKey: geminiApiKey });
    setStatus('Gemini API Key saved!');
  }, [geminiApiKey]);

  const handleGeminiAiModelChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value;
      await aiModelStorage.set({ model });
      setStatus(`Gemini AI Model set to "${model}"!`);
    },
    [aiModelStorage],
  );

  const handleSaveOpenAiApiKey = useCallback(async () => {
    await openAiStorage.setApiKey(openAiApiKey);
    setStatus('OpenAI API Key saved!');
  }, [openAiApiKey]);

  const handleOpenAiModelChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value;
      await openAiStorage.setModel(model);
      setStatus(`OpenAI Model set to "${model}"!`);
    },
    [openAiStorage],
  );

  const handleProviderChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const provider = e.target.value as 'gemini' | 'openai';
      await providerStorage.setProvider(provider);
      setStatus(`Provider set to "${provider}"!`);
    },
    [providerStorage],
  );

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  return (
    <div
      className={cn(
        'App min-w-[400px] max-h-screen overflow-y-auto p-4',
        isLight ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100',
      )}>
      <header className="App-header flex flex-col items-center">
        <h1 className="mb-4 text-xl font-bold">AI Autofill Pro Settings</h1>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Manage Profiles</h2>
          <div className="mb-2 flex items-center gap-2">
            <select
              value={selectedProfileName}
              onChange={handleSelectProfile}
              className="flex-grow rounded border bg-white p-1 text-gray-900">
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
              className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600 disabled:opacity-50"
              disabled={!selectedProfileName || Object.keys(profiles).length === 1}>
              Delete
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New profile name"
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              className="flex-grow rounded border bg-white p-1 text-gray-900"
            />
            <button
              onClick={handleCreateNewProfile}
              className="rounded bg-green-500 px-3 py-1 text-white hover:bg-green-600 disabled:opacity-50"
              disabled={!newProfileName.trim()}>
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
            className="h-40 w-full resize-y rounded border bg-white p-2 text-sm text-gray-900"
          />
          <button
            onClick={handleSaveProfile}
            className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600 disabled:opacity-50"
            disabled={!selectedProfileName}>
            {t('saveProfileButton', 'Save Current Profile')}
          </button>
        </div>

        <div className="mb-4 w-full">
          <h2 className="mb-2 text-lg font-semibold">Select AI Provider</h2>
          <select
            value={selectedProvider}
            onChange={handleProviderChange}
            className="w-full rounded border bg-white p-1 text-gray-900">
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        {selectedProvider === `gemini` && (
          <div className="mb-4 w-full">
            <h2 className="mb-2 text-lg font-semibold">Gemini API Key</h2>
            <input
              type="password"
              placeholder="Enter your Gemini API Key"
              value={geminiApiKey}
              onChange={e => setGeminiApiKey(e.target.value)}
              className="w-full rounded border bg-white p-1 text-gray-900"
            />
            <button
              onClick={handleSaveGeminiApiKey}
              className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600">
              Save API Key
            </button>
            <p className="mt-1 text-xs text-gray-600">
              Your API key is stored locally in your browser. Get one from
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
        )}

        {selectedProvider === 'gemini' && (
          <div className="mb-4 w-full">
            <h2 className="mb-2 text-lg font-semibold">Select Gemini AI Model</h2>
            <select
              value={aiModel}
              onChange={handleGeminiAiModelChange}
              className="w-full rounded border bg-white p-1 text-gray-900">
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-flash-lite-preview-06-17">Gemini 2.5 Flash Lite</option>
            </select>
          </div>
        )}

        {selectedProvider === 'openai' && (
          <div className="mb-4 w-full">
            <h2 className="mb-2 text-lg font-semibold">OpenAI API Key</h2>
            <input
              type="password"
              placeholder="Enter your OpenAI API Key"
              value={openAiApiKey}
              onChange={e => openAiStorage.setApiKey(e.target.value)}
              className="w-full rounded border bg-white p-1 text-gray-900"
            />
            <button
              onClick={handleSaveOpenAiApiKey}
              className="mt-2 w-full rounded bg-blue-500 py-1 text-white hover:bg-blue-600">
              Save API Key
            </button>
            <p className="mt-1 text-xs text-gray-600">
              Your API key is stored locally in your browser. Get one from{' '}
              <a
                href="https://platform.openai.com/account/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline">
                OpenAI Platform
              </a>
              .
            </p>
          </div>
        )}

        {selectedProvider === 'openai' && (
          <div className="mb-4 w-full">
            <h2 className="mb-2 text-lg font-semibold">Select OpenAI Model</h2>
            <select
              value={openAiModel}
              onChange={handleOpenAiModelChange}
              className="w-full rounded border bg-white p-1 text-gray-900">
              <option value="gpt-4.1">GPT-4.1</option>
              <option value="gpt-4.1-mini">GPT-4.1 mini</option>
              <option value="gpt-4.1-nano">GPT-4.1 nano</option>
            </select>
          </div>
        )}

        <p className="mt-4 text-sm text-gray-700">Status: {status}</p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <ToggleButton onClick={exampleThemeStorage.toggle}>{t('toggleTheme')}</ToggleButton>
          <button onClick={goGithubSite} className="text-sm text-blue-500 hover:underline">
            View Project on GitHub
          </button>
        </div>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
