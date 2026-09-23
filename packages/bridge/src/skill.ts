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

The person edits a live page in the Codename panel. Most of the time the panel's **Make changes** puts that edit into source itself: the bridge runs a coding agent headless in the project on the brief and shows its progress in the panel. Nothing you do through the bridge's tools writes to source; the repository is yours to edit.

## In a chat

1. If the panel is not paired, call \`pairing_code\` and read the code out to the user; they type it into the panel.
2. When the person asks you to apply what they did on the page, call \`get_changes\` and apply the brief. If the panel is already running Make changes on it, do not apply it a second time.
3. Call \`watch\` in a loop to work hands-free. It returns when there is a new comment, a new selection, or an explicit hand-off; on a hand-off, apply it and \`clear\` it with \`what: "handoff"\`.
4. On comments, call \`get_comments\` with \`status: "pending"\`; \`set_status\` to acknowledged when you start, resolved when the change is in source, dismissed if you will not act; \`reply\` briefly.
5. Before larger work, read \`codename://design-system/brand.md\` (or call \`get_design_system\`) and write the files into the repository as design context.

## The rules

${standingRules().split('\n').slice(2).join('\n')}
- Tokens the person locked are listed under "Keep as is" in the brief and in \`codename://rules\`; leave them exactly as they are.

## States

- An element change can be about a state rather than about the element at
  rest. In a brief it appears under a heading naming that state; in
  \`get_changes\` it is \`elements[].condition\`.
- \`{kind:'state'}\` is \`:hover\`, \`:focus-visible\` or \`:active\`;
  \`{kind:'scheme'}\` is the page's own dark mode, whatever hook it uses;
  \`{kind:'width', maxWidth}\` is \`@media (max-width: Npx)\`.
- Put each where that state is written in source. A hover change belongs on
  the hover rule, not on the base one, and not as a new rule if the component
  already has somewhere for it.

## Finding what to edit

- \`find_definition\` searches the project this bridge is running in for where a custom property is defined, and says whether each one sits at the root of the cascade, under a media query, in a scoped selector or in a token file. Use it instead of grepping. More than one answer means the cascade decides, so read them before you edit.
- \`check_tokens\` takes a \`path\` in the project and reads the file itself; you only need to pass \`file\` contents for a file that is not in the project.
- \`apply_definition\` writes one value into one root-level definition, and only where the person has turned that on for the project. It refuses anything ambiguous. It is a shortcut for the case with nothing to decide, not a substitute for editing source yourself.

## Showing your work

- \`point\` scrolls the page to an element and shows a short note on the bar — say "look here" before or after a change.
- \`get_screenshot\` captures the page; pass \`selector\` to crop to one component, or \`viewport\` to check a breakpoint (then \`reset\`).
- \`critique\` returns what a designer would flag on the page, as facts with numbers.
`;
