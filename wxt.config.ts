import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  /**
   * `wxt` normally launches its own browser on a throwaway profile. Load
   * `dist/chrome-mv3-dev` into the browser you already have open instead: the
   * hot reload works over the dev server either way, and you keep your tabs,
   * your site permissions and your bridge pairing.
   */
  webExt: { disabled: true },
  manifest: {
    name: 'Codename',
    description:
      "Designer's toolkit: inspect fonts & colors, grab SVGs, resize the viewport, export a site's design tokens.",
    permissions: ['activeTab', 'tabs', 'scripting', 'sidePanel', 'storage'],
    optional_host_permissions: ['<all_urls>'],
    minimum_chrome_version: '116',
    action: {
      default_title: 'Open Codename',
    },
  },
});
