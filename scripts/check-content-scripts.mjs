// Chromium refuses to inject a content script that is not strictly UTF-8,
// and "strictly" includes rejecting noncharacters (U+FFFE, U+FFFF, U+FDD0–FDEF)
// and lone surrogates. A minifier will happily write those as literals when a
// regex range ends at U+FFFF, and nothing else in the toolchain complains —
// the failure only shows up as "It isn't UTF-8 encoded" in a real browser.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist/chrome-mv3/content-scripts';
const files = readdirSync(dir).filter((n) => n.endsWith('.js'));
let bad = 0;
for (const name of files) {
  const text = readFileSync(join(dir, name)).toString('utf8');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const noncharacter = (c & 0xfffe) === 0xfffe || (c >= 0xfdd0 && c <= 0xfdef);
    const high = c >= 0xd800 && c <= 0xdbff;
    const low = c >= 0xdc00 && c <= 0xdfff;
    const loneSurrogate =
      (high && (text.charCodeAt(i + 1) & 0xfc00) !== 0xdc00) ||
      (low && (text.charCodeAt(i - 1) & 0xfc00) !== 0xd800);
    if (noncharacter || loneSurrogate) {
      console.error(
        `${name}: U+${c.toString(16).toUpperCase().padStart(4, '0')} at offset ${i} — Chrome will refuse to inject this file`,
      );
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`content scripts are injectable (${files.length} files checked)`);
