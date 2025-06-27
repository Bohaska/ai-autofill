import { createStorage, StorageEnum } from '../base/index.js';
import type { AnthropicStorageType, AnthropicModelState } from '../types.js';

const storage = createStorage<AnthropicModelState>(
  'anthropic-storage-key',
  {
    apiKey: '',
    model: 'claude-3-5-haiku-latest',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const anthropicStorage: AnthropicStorageType = {
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