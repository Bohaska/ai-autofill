import { createStorage, StorageEnum } from '../base/index.js';
import type { ProviderStorageType, ProviderState } from '../types.js';

const storage = createStorage<ProviderState>(
  'provider-storage-key',
  {
    provider: 'gemini',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const providerStorage: ProviderStorageType = {
  ...storage,
  setProvider: async (provider: 'gemini' | 'openai' | 'anthropic') => {
    await storage.set(() => ({
      provider,
    }));
  },
};