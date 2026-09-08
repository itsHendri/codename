/**
 * Applies token overrides to the live page.
 *
 * Custom properties are set inline on the root element rather than through an
 * injected stylesheet: an inline declaration outranks every author rule for that
 * element, including `:root.dark` and rules inside media queries, so one write
 * wins without `!important` and `removeProperty` puts it back exactly.
 *
 * Nothing here is persisted. The overrides live in this document and die with
 * it — a reload, a navigation or a clear returns the page to its own values.
 */

interface Override {
  name: string;
  from: string;
  to: string;
}

declare global {
  interface Window {
    __codenameReskin?: { clear: () => void; applied: () => number };
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Re-injection must not lose track of what is already overridden.
    if (window.__codenameReskin) return;

    const applied = new Map<string, string>();
    const root = document.documentElement;

    const apply = (overrides: Override[]) => {
      // Anything previously set but not in this batch goes back first, so the
      // page never keeps a value from an edit that has since been undone.
      const incoming = new Set(overrides.map((o) => o.name));
      for (const name of applied.keys()) {
        if (!incoming.has(name)) {
          root.style.removeProperty(name);
          applied.delete(name);
        }
      }
      for (const { name, to } of overrides) {
        root.style.setProperty(name, to);
        applied.set(name, to);
      }
      return applied.size;
    };

    const clear = () => {
      for (const name of applied.keys()) root.style.removeProperty(name);
      applied.clear();
    };

    const onMessage = (
      msg: { type?: string; overrides?: Override[] },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: { ok: boolean; applied: number }) => void,
    ) => {
      if (msg?.type === 'reskin-apply') {
        sendResponse({ ok: true, applied: apply(msg.overrides ?? []) });
        return true;
      }
      if (msg?.type === 'reskin-clear') {
        clear();
        sendResponse({ ok: true, applied: 0 });
        return true;
      }
      if (msg?.type === 'reskin-ping') {
        sendResponse({ ok: true, applied: applied.size });
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(onMessage);
    window.__codenameReskin = { clear, applied: () => applied.size };
  },
});
