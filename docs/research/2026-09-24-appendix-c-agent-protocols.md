# Appendix C — AI-agnostic integration: MCP, ACP, headless CLIs (state of play, 24 Sept 2026)

Research agent report, 2026-09-24.

## Summary

- **Pull (agent reads the brief):** MCP is universal. Every coding agent that matters is an MCP client. Keep the MCP server. The 2026-07-28 spec made the core stateless, moved Tasks to an extension, added MCP Apps, and **deprecated Roots and Sampling** (12-month window). Do not build on those.
- **Push (tool tells the agent "run this now"):** ACP (Agent Client Protocol, from Zed, Apache-licensed, co-governed with JetBrains) is the only cross-vendor way to drive a coding agent from outside without writing one. Native ACP servers: Cursor (`agent acp`), Gemini CLI, Copilot CLI, opencode, Goose, Cline, Kilo, Kimi, Qwen Code, Junie, Mistral Vibe and ~30 others; Claude Code and Codex are covered by adapters maintained by Zed/the ACP org (`@agentclientprotocol/claude-agent-acp`, `@agentclientprotocol/codex-acp`). Clients are explicitly allowed to be "other UIs": Devin Desktop, Obsidian plugins, Chrome extensions and mobile apps already are.
- **Recommendation:** be an MCP server (pull) and an ACP client (push); spawn CLIs with `stream-json` only as a fallback. "Local models" = an ACP agent (opencode, Goose, Kilo, or `ollama launch claude|codex|opencode`) pointed at Ollama or LM Studio, never a raw model endpoint.
- **Biggest risks:** Anthropic's Feb 2026 credential policy and May/June 2026 "Agent SDK credit" metering of ACP/SDK usage on subscriptions; Copilot removing `--headless --stdio` without notice (Feb 2026); MCP deprecations; ACP's HTTP transport still draft.

## MCP, Sept 2026

Spec 2026-07-28: stateless core (no `initialize` handshake, version and capabilities in `_meta`, `server/discover`); `subscriptions/listen`; multi-round-trip requests (`resultType: "input_required"`) replace server-initiated elicitation; extensions framework (Tasks → `io.modelcontextprotocol/tasks`; MCP Apps `ui://` resources); OAuth DCR deprecated for Client ID Metadata Documents; **Roots, Sampling, Logging deprecated**; registry still preview.
Sources: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx · https://blog.modelcontextprotocol.io/posts/2026-07-28/ · https://modelcontextprotocol.io/registry/about

Client support (canimcp.dev, ContextBolt): VS Code + Copilot widest (renders MCP Apps); Claude Code stdio/SSE/HTTP, URL-mode elicitation only, no MCP Apps (terminal); Cursor form-mode elicitation; Claude Desktop stdio + remote, `.mcpb` installs; Claude.ai and ChatGPT remote only (cannot reach a local process); Codex resources since v0.119 (Apr 2026), elicitation, prompts not consumed, open issue on stateless stdio (#33952); Gemini CLI full; LM Studio host with a per-call dialog; Ollama has no MCP client (provides endpoints; `ollama launch` runs other harnesses).

Push mechanisms that exist: Claude Code **Channels** (preview, v2.1.80, Mar 2026; allowlist-gated, custom channels need a `--dangerously-load-development-channels` flag); `codex mcp-server` exposes a `codex` tool (prompt, cwd, sandbox) and `codex-reply`; Codex **app-server** (JSON-RPC over stdio/WebSocket, `thread/start {cwd}`, `turn/start`, approvals); `opencode serve` HTTP API with SSE and a permissions endpoint; Copilot SDK (GA Jun 2 2026); Cursor Cloud Agents API (cloud checkout only). Claude Desktop, Claude.ai, ChatGPT: no push. Every vendor's push path is different, except that most also speak ACP.
Sources: https://code.claude.com/docs/en/channels-reference · https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md · https://opencode.ai/docs/server/ · https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/

## ACP

JSON-RPC 2.0 over stdio (agent spawned as a subprocess); streamable HTTP is a draft. Registry live Jan 28 2026. Lifecycle as a client: `initialize` → `session/new { cwd, mcpServers[] }` (this is where you inject your own MCP server into the agent, no user config) → `session/prompt` → stream of `session/update` (text, `tool_call` with `kind`, `status`, diffs and `locations`, plan updates) → `session/request_permission` (allow_once / allow_always / reject) → `session/cancel`; `session/load` and `session/resume` for continuation; modes (Cursor: agent/plan/ask).
Agents: Claude Code (adapter on the Agent SDK), Codex (adapter over app-server), Gemini CLI (`--experimental-acp`), Copilot (`copilot --acp --stdio`, replaced `--headless --stdio` in v0.0.410 without deprecation), Cursor (`agent acp`), opencode, Goose (ACP now its primary interface, plus an HTTP/WS transport), Cline, Kilo, Kimi, Kiro, Qwen Code, Junie, Mistral Vibe, OpenHands, Augment, Factory Droid, Docker cagent. Windsurf/Cascade EOL Jul 1 2026; the product is now Devin Desktop, an ACP host.
Hosts: Zed, JetBrains (2025.3+, in-IDE registry), Devin Desktop (Jun 2 2026), VS Code via extensions, Neovim, Emacs, Obsidian, Unity, Jupyter, CLI clients, Chrome extensions, mobile.
Maturity: v1, stdio stable, HTTP draft; the two most important agents are behind adapters that can lag upstream; vendor extension methods (Cursor's `cursor/*`) exist.
Sources: https://agentclientprotocol.com/protocol/overview · https://agentclientprotocol.com/get-started/agents · https://agentclientprotocol.com/get-started/clients · https://zed.dev/blog/claude-code-via-acp · https://zed.dev/blog/jetbrains-on-acp · https://cursor.com/docs/cli/acp

## Headless CLIs

| Agent | Spawn with prompt + cwd | Stream | Permissions reach the caller | Resume | MCP servers |
|---|---|---|---|---|---|
| Claude Code | `claude -p` (`--bare` recommended for scripts), `--add-dir` | `--output-format stream-json` | Agent SDK `canUseTool`, `--permission-prompt-tool`, ACP | `--continue`, `--resume` | `--mcp-config` |
| Codex | `codex exec -C <dir>`, `--sandbox`, `--full-auto` | `--json` JSONL | not in `exec`; via app-server/ACP | `codex exec resume` | `config.toml` |
| Cursor | `agent -p --workspace`; changes only proposed without `--force` | `--output-format stream-json` | ACP only | `--resume` | `.cursor/mcp.json` |
| Gemini CLI | `gemini -p`, `--include-directories` | `--output-format stream-json` | `--approval-mode`; ACP | `--resume` | settings |
| opencode | `opencode run --dir`, or HTTP server | `--format json`, SSE | HTTP permissions endpoint; ACP | `--session` | `POST /mcp` |
| Copilot | `copilot -p`; SDK | SDK streaming; ACP | ACP; SDK | SDK | config |

## Anthropic terms and billing (the real constraint)

- You may preinstall or run the **unmodified** `claude` binary in your product if each end user authenticates with their own key, subscription or cloud credential; you may say the product "runs Claude Code". Agent SDK products must use API-key auth; third parties may not offer Claude.ai login or route through Pro/Max credentials. Feb 17–20 2026: enforcement by account blocking; opencode dropped subscription login.
- May 14 / Jun 16 2026 (Zed's write-up): ACP, `claude -p`, Agent SDK and SDK-built apps "continue to work with Claude subscriptions", but third-party agent usage through ACP draws from a new **Agent SDK credit** ($20 Pro / $100 Max 5x / $200 Max 20x) then bills at API rates. Whether spawning `claude -p` from a third-party app is metered the same way is not stated; assume yes.
- OpenAI: ChatGPT-plan Codex is licensed for interactive personal use; automation should hold its own credential. GitHub: SDK terms permissive, but the CLI broke the SDK in Feb 2026 and the issue was closed "not planned"; pin versions. Cursor: no published wrapper terms found; ACP mode is documented.
Sources: https://code.claude.com/docs/en/legal-and-compliance · https://zed.dev/blog/anthropic-subscription-changes · https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/ · https://learn.chatgpt.com/docs/non-interactive-mode

## Other paths

AG-UI: for UIs over an agent you run; irrelevant without an own agent. A2A: enterprise, no coding CLI speaks it locally. ChatGPT Apps SDK: remote MCP only, no local file access; read-only surface at most. `.mcpb`: one-click local MCP install for Claude Desktop, cheap to ship. MCP Apps: UI inside chat hosts, not Claude Code; conflicts with "the live page is the canvas". Vercel AI SDK: means owning a harness. Local models: a raw model does not do agentic multi-file edits well; working combos on a 24 GB card (Jul 2026) are Qwen3-Coder 30B, GLM-4.7-Flash, gpt-oss:20b, Qwen3.6-35B with context ≥64K; usable for single-file token edits, unreliable for cross-component refactors.

## How comparable products do it

Figma: remote MCP + Code Connect, agents pull. Framer 3: `npx @framer/agent setup` installs skill files for Claude Code, Codex, Cursor, Antigravity, Windsurf; pull. Webflow MCP 2.1: pull. stagewise: was push via an IDE extension, fragile, so it built its own agent (the cautionary tale). Pencil: local MCP server, pull, plus built-in BYOK agents. Onlook: own agent. Ship Studio: hosts terminals, the user types. Every design-adjacent product that stayed agnostic is pull-only; every one that wanted a "do it now" button hosts a terminal or built an agent. ACP is the third option none has taken yet.

## Recommended architecture

1. **MCP server (keep, harden):** stdio and streamable HTTP on loopback; support both the 2025-11-25 and 2026-07-28 handshakes; no Roots or Sampling; project root as a tool argument; ship `.mcpb`, `mcp.json` snippets, `claude mcp add` / `codex mcp add` one-liners, and a `/codename` skill file. Chat-only hosts get read access only.
2. **ACP client (new):** on "Make changes", spawn the chosen agent from a launch table or the ACP registry; `session/new { cwd, mcpServers: [codename] }`; `session/prompt` with the brief; render `session/update` as a compact progress strip (files touched, diffs) with no chat; `session/request_permission` as your own allow/deny; `session/resume` for a second press; `session/cancel` for stop; auth stays with the agent; default to the workspace-write mode, never full access.
3. **CLI fallback (demoted):** `claude -p --output-format stream-json`, `codex exec --json -C`, `agent -p --output-format stream-json --force`, `gemini -p --output-format stream-json`; plus the existing "open a terminal with the agent" path.
4. **Local models:** presets (opencode, Goose, Cline, Kilo, `ollama launch …`), with the hardware floor stated plainly.

Cost: MCP hardening plus install surfaces, days; ACP client (TS SDK, spawn manager, update renderer, permission UI, launch table, per-agent quirks), roughly 3–5 weeks for a solid first version; ongoing tracking of ACP HTTP transport, adapter releases and the MCP deprecation clock.

## Risks

1. Protocol churn (MCP 2026-07-28 handshake and deprecations; ACP HTTP draft; registry preview).
2. Terms on wrapping CLIs (Anthropic metering and enforcement; OpenAI interactive-use licence; Copilot breaking changes; Cursor unpublished).
3. Local models in 2026 = 20–35B coders on 24 GB with a raised context; fine for token edits, unreliable for refactors.
4. Adapter dependency for Claude and Codex.
5. Precedent: stagewise abandoned its agnostic bridge for a first-party agent. Mitigation: the CLI fallback layer.
