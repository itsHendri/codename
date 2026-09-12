/**
 * The skill `codename-bridge setup` installs for the agent: how to work with
 * a Codename panel, in the agent's own skills folder, so the rules travel
 * with the tool rather than with each brief. The bridge's server
 * instructions and the `codename://rules` resource say the same things at
 * connect time; this is the copy the agent can read before it connects.
 */
import { standingRules } from '../../../studio/commit';

export const SKILL_NAME = 'codename';

export const SKILL_MD = `---
name: codename
description: Work with the Codename panel — a Chrome side panel that reads the design system a live page runs, lets a person edit it, and hands you the change at token level over a local MCP bridge. Use when the codename MCP server is registered, when the user mentions Codename, a hand-off, a brief, or asks you to apply a design change they made on the page.
---

# Codename

The person edits a live page in the Codename panel. You apply what they decided to source. Nothing you do through the bridge writes to source; the repository is yours to edit.

## The loop

1. If the panel is not paired, call \`pairing_code\` and read the code out to the user; they type it into the panel.
2. Call \`watch\` in a loop. It returns when there is a hand-off, a new comment, or a new selection.
3. On a hand-off, call \`get_changes\` and apply the brief. Then \`clear\` with \`what: "handoff"\`.
4. On comments, call \`get_comments\` with \`status: "pending"\`; \`set_status\` to acknowledged when you start, resolved when the change is in source, dismissed if you will not act; \`reply\` briefly.
5. Before larger work, read \`codename://design-system/brand.md\` (or call \`get_design_system\`) and write the files into the repository as design context.

## The rules

${standingRules().split('\n').slice(2).join('\n')}
- Tokens the person locked are listed under "Keep as is" in the brief and in \`codename://rules\`; leave them exactly as they are.

## Showing your work

- \`point\` scrolls the page to an element and shows a short note on the bar — say "look here" before or after a change.
- \`get_screenshot\` captures the page; pass \`selector\` to crop to one component, or \`viewport\` to check a breakpoint (then \`reset\`).
- \`critique\` returns what a designer would flag on the page, as facts with numbers.
`;
