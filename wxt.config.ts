import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Codename',
    description:
      "Designer's toolkit: inspect fonts & colors, grab SVGs, resize the viewport, export a site's design tokens.",
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage'],
    optional_host_permissions: ['<all_urls>'],
    minimum_chrome_version: '114',
    action: {
      default_title: 'Open Codename',
    },
  },
});
