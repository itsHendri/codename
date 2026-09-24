/**
 * Writing token values into their definitions.
 *
 * `applyDefinition` writes one value into the one root definition of one
 * variable; this writes a batch, and each edit into every definition of the
 * scope it was made under — the light value into the root (and a Tailwind
 * `@theme`), the dark value into the page's dark blocks, however many ways
 * the page spells them. What it will not do is choose: a width query or a
 * component scope is never a target of a token edit, definitions that
 * disagree are refused with the list, and a value computed from others is
 * not flattened to a literal unless the edit says that is the intention.
 *
 * Replacement stays an offset splice of the value's span, found by a fresh
 * read of the file, so every byte around it is kept as written. Nothing here
 * inserts a declaration; that is a different edit with a different guard.
 */

import { readFileSync } from 'node:fs';
import type { Definition, TokenEdit, WriteResult, WrittenToken } from '../../../shared/protocol';
import { isComputedValue, scopeKindOf, targetsFor } from '@/studio/writeScope';
import { badValue, findDefinitions, sameValue, scanCss, writeFileAtomic, type FindOptions, type Located } from './definitions';
import { resolveInside } from './repo';

/** One place one edit lands. */
interface Plan {
  edit: TokenEdit;
  target: Definition;
  scope: WrittenToken['scope'];
}

const scopeLabel = (d: Definition): WrittenToken['scope'] => {
  const kind = scopeKindOf(d);
  return kind === 'theme' ? 'theme' : kind === 'dark' ? 'dark' : 'root';
};

/**
 * Writes every edit it can and says why it could not write the rest.
 *
 * The search is run once for all the names, and everything is checked
 * before anything is written: an edit whose definitions moved, or whose
 * source no longer says what the edit says it did, is refused whole, and the
 * files are written only after every edit that will be written has found
 * its exact spans. Files are written one at a time, atomically.
 */
export function writeTokens(cwd: string, edits: TokenEdit[], opts: FindOptions = {}): WriteResult {
  const result: WriteResult = { written: [], left: [], refused: [] };
  const refuse = (name: string, reason: string) => result.refused.push({ name, reason });
  if (!edits.length) return result;

  const names = [...new Set(edits.map((e) => e.name))];
  const { found, truncated } = findDefinitions(cwd, names, opts);
  if (truncated) {
    for (const e of edits) {
      refuse(e.name, `the search for ${e.name} stopped before it had read the whole project, so it cannot say where every definition is; edit it yourself`);
    }
    return result;
  }

  const plans: Plan[] = [];
  for (const edit of edits) {
    const wrong = badValue(edit.to);
    if (wrong) {
      refuse(edit.name, wrong);
      continue;
    }
    const mode = edit.mode ?? 'light';
    const { targets, left, reason } = targetsFor(edit.name, found[edit.name] ?? [], mode);
    for (const definition of left) result.left.push({ name: edit.name, definition });
    if (reason) {
      refuse(edit.name, reason);
      continue;
    }
    const stale = targets.find((t) => !sameValue(t.value, edit.from));
    if (stale) {
      refuse(edit.name, `${edit.name} is \`${stale.value}\` in source, not \`${edit.from}\`; it changed since it was read`);
      continue;
    }
    const computed = targets.find((t) => isComputedValue(t.value));
    if (computed && !edit.flatten && !isComputedValue(edit.to)) {
      refuse(
        edit.name,
        `${edit.name} is \`${computed.value}\`, a value computed from others; edit what it points at, or say the intention is to flatten it`,
      );
      continue;
    }
    for (const target of targets) plans.push({ edit, target, scope: scopeLabel(target) });
  }
  if (!plans.length) return result;

  // Every edit finds its spans in a fresh read before any file is written,
  // so a file that changed since the search refuses the edits in it rather
  // than being written over.
  const byFile = new Map<string, Plan[]>();
  for (const plan of plans) (byFile.get(plan.target.file) ?? byFile.set(plan.target.file, []).get(plan.target.file)!).push(plan);

  const failed = new Set<TokenEdit>();
  const splices = new Map<string, { text: string; spans: { plan: Plan; span: Located }[] }>();
  for (const [file, filePlans] of byFile) {
    const absolute = resolveInside(cwd, file);
    if (!absolute) {
      for (const p of filePlans) {
        failed.add(p.edit);
        refuse(p.edit.name, `"${file}" is outside the folder this bridge is running in`);
      }
      continue;
    }
    let text: string;
    try {
      text = readFileSync(absolute, 'utf8');
    } catch (err) {
      for (const p of filePlans) {
        failed.add(p.edit);
        refuse(p.edit.name, `could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
    const here = scanCss(text, [...new Set(filePlans.map((p) => p.edit.name))], file);
    const spans: { plan: Plan; span: Located }[] = [];
    for (const plan of filePlans) {
      const match = here.filter(
        (d) => d.name === plan.edit.name && d.line === plan.target.line && sameValue(d.value, plan.target.value),
      );
      if (match.length !== 1) {
        failed.add(plan.edit);
        refuse(plan.edit.name, `${file} changed while this was being applied; nothing was written`);
        continue;
      }
      spans.push({ plan, span: match[0]! });
    }
    splices.set(absolute, { text, spans });
  }

  // An edit that failed in one file is written nowhere: a dark side written
  // in one block and refused in the other is worse than either.
  for (const [absolute, entry] of splices) {
    const live = entry.spans.filter((s) => !failed.has(s.plan.edit)).sort((a, b) => b.span.valueStart - a.span.valueStart);
    if (!live.length) continue;
    let next = entry.text;
    for (const { plan, span } of live) next = next.slice(0, span.valueStart) + plan.edit.to + next.slice(span.valueEnd);
    try {
      writeFileAtomic(absolute, next, live[0]!.plan.target.file);
    } catch (err) {
      for (const { plan } of live) {
        failed.add(plan.edit);
        refuse(plan.edit.name, err instanceof Error ? err.message : String(err));
      }
      continue;
    }
    for (const { plan, span } of live) {
      result.written.push({
        name: plan.edit.name,
        file: plan.target.file,
        line: span.line ?? plan.target.line ?? 0,
        from: span.value,
        to: plan.edit.to,
        scope: plan.scope,
      });
    }
  }
  // Reported in source order, whatever order the splices ran in.
  result.written.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  // A refusal is reported once per edit, whichever file it was found in.
  const seen = new Set<string>();
  result.refused = result.refused.filter((r) => {
    const key = `${r.name}\u0000${r.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return result;
}
