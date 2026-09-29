import type { StorybookConfig } from '@storybook/react-vite';
import type { PluginOption } from 'vite';
import { fileURLToPath } from 'node:url';

const isPwaPlugin = (plugin: PluginOption) =>
  plugin &&
  typeof plugin === 'object' &&
  !Array.isArray(plugin) &&
  'name' in plugin &&
  typeof plugin.name === 'string' &&
  plugin.name.startsWith('vite-plugin-pwa');

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../public'],
  viteFinal: (viteConfig) => {
    const flattenedPlugins = (
      viteConfig.plugins as unknown[] | undefined
    )?.flat(Number.POSITIVE_INFINITY) as PluginOption[] | undefined;
    viteConfig.plugins = flattenedPlugins?.filter(
      (plugin) => !isPwaPlugin(plugin),
    );
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: {
        ...viteConfig.resolve?.alias,
        'virtual:pwa-register': fileURLToPath(
          new URL('./pwa-register-stub.ts', import.meta.url),
        ),
      },
    };
    return viteConfig;
  },
};

export default config;
