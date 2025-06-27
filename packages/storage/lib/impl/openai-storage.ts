import { createStorage, StorageEnum } from '../base/index.js';
import type { OpenAiStorageType, OpenAiModelState } from '../types.js';

const storage = createStorage<OpenAiModelState>(
  'openai-storage-key',
  {
    apiKey: '',
    model: 'gpt-4.1-mini',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const openAiStorage: OpenAiStorageType = {
  ...storage,
  setApiKey: async (apiKey: string) => {
    await storage.set(currentState => ({
      ...currentState,
      apiKey,
    }));
  },
  setModel: async (model: string) => {
    await storage.set(currentState => ({
      ...currentState,
      model,
    }));
  },
};