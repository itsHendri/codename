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
   * One output folder, whether this is a dev build or a production one.
   *
   * WXT defaults to `chrome-mv3-dev` in dev, which means the folder you loaded
   * into the browser and the folder being rebuilt are different — so you end
   * up loading both and they inject into every page twice. Dropping the suffix
   * means the extension you loaded once is always the current one.
   *
   * The cost: `npm run build` overwrites the dev output, so reload the
   * extension once after a production build.
   */
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  /**
   * `wxt` normally launches its own browser on a throwaway profile. Keeping it
   * in the browser you already have means your tabs, your granted site
   * permissions and your bridge pairing all survive a restart of the dev server.
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
