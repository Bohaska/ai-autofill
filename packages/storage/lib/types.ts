import type { ValueOrUpdateType } from './base/index.js';

export type BaseStorageType<D> = {
  get: () => Promise<D>;
  set: (value: ValueOrUpdateType<D>) => Promise<void>;
  getSnapshot: () => D | null;
  subscribe: (listener: () => void) => () => void;
};

export type AiModelState = {
  model: string;
};

export type OpenAiModelState = {
  apiKey: string;
  model: string;
};

export type ProviderState = {
  provider: 'gemini' | 'openai';
};

export type AiModelStorageType = BaseStorageType<AiModelState>;
export type OpenAiStorageType = BaseStorageType<OpenAiModelState> & {
  setApiKey: (apiKey: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
};

export type ProviderStorageType = BaseStorageType<ProviderState> & {
  setProvider: (provider: 'gemini' | 'openai') => Promise<void>;
};
