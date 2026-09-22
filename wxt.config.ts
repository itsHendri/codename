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
    // 128 is where CSS `zoom` became the standard one, so an element's box
    // reads true inside a scaled frame.
    minimum_chrome_version: '128',
    action: {
      default_title: 'Codename',
    },
    /**
     * The panel's own page, so the panel can be drawn in a page as an iframe
     * (W33). The one file a page can reach; everything it loads comes from
     * the extension's own origin and needs no listing. The cost: a page can
     * tell Codename is installed by asking for this file.
     */
    web_accessible_resources: [{ resources: ['sidepanel.html'], matches: ['<all_urls>'] }],
    /**
     * Preview, Comment and the rail, from the keyboard. Alt rather than Cmd so
     * they never collide with the page's own shortcuts or Chrome's; the user
     * can rebind them at chrome://extensions/shortcuts.
     */
    commands: {
      'toggle-preview': {
        suggested_key: { default: 'Alt+P' },
        description: 'Switch between Select and Preview on the page',
      },
      'toggle-comment': {
        suggested_key: { default: 'Alt+C' },
        description: 'Toggle Comment mode on the page',
      },
      'toggle-layers': {
        suggested_key: { default: 'Alt+L' },
        description: 'Show or hide the layers rail on the page',
      },
    },
  },
});
