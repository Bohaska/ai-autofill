import { withPageConfig } from './index.js';
import { getContentScriptEntries } from './get-content-script-entires.js'; // Import the correct function
import { IS_DEV } from '@extension/env';
import { makeEntryPointPlugin } from '@extension/hmr';
import { build as buildTW } from 'tailwindcss/lib/cli/build';
import { build } from 'vite';
import { resolve } from 'node:path';

interface IContentBuilderProps {
  matchesDir: string;
  srcDir: string;
  rootDir: string;
  contentName: 'content' | 'content-ui' | 'content-runtime';
  withTw: boolean;
}

type BuilderPropsType = Omit<IContentBuilderProps, 'withTw'>;


const configsBuilder = ({ matchesDir, srcDir, rootDir, contentName }: BuilderPropsType) =>
  Object.entries(getContentScriptEntries(matchesDir)).map(([name, entry]) => ({
    name,
    config: withPageConfig({
      mode: IS_DEV ? 'development' : undefined,
      resolve: {
        alias: {
          '@src': srcDir,
        },
      },
      publicDir: resolve(rootDir, 'public'),
      plugins: [IS_DEV && makeEntryPointPlugin()],
      build: {
        lib: {
          name: name,
          formats: ['iife'],
          entry,
          fileName: name,
        },
        outDir: resolve(rootDir, '..', '..', 'dist', contentName),
      },
    }),
  }));

const builds = async ({ srcDir, contentName, rootDir, matchesDir, withTw }: IContentBuilderProps) =>
  configsBuilder({ matchesDir, srcDir, rootDir, contentName }).map(async ({ name, config }) => {
    if (withTw) {
      const folder = resolve(matchesDir, name);
      const args = {
        ['--input']: resolve(folder, 'index.css'),
        ['--output']: resolve(rootDir, 'dist', name, 'index.css'),
        ['--config']: resolve(rootDir, 'tailwind.config.ts'),
        ['--watch']: IS_DEV,
      };

      await buildTW(args);
    }

    //@ts-expect-error This is hidden property from vite's resolveConfig()
    config.configFile = false;
    return build(config);
  });

// FIXME: USE THIS FOR ALL CONTENT SCRIPTs
export const contentBuilder = async ({
  matchesDir,
  srcDir,
  rootDir,
  contentName,
  withTw = true,
}: IContentBuilderProps) =>
  builds({
    srcDir,
    contentName,
    rootDir,
    matchesDir,
    withTw,
  });
