import { createStorage, StorageEnum } from '../base/index.js';
import type { AiModelStorageType, AiModelState } from '../types.js';

const storage = createStorage<AiModelState>(
  'ai-model-storage-key',
  {
    model: 'gemini-2.5-flash-lite-preview-06-17',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const aiModelStorage = storage;
