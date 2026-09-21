# codename-bridge

The local companion for [Codename](https://github.com/itsHendri/codename), a
Chrome side-panel design tool that edits the live page. The bridge connects the
panel to your coding agent (Claude Code, Cursor, any MCP client). The agent
gets the design changes you made on the page, the page's tokens, screenshots
at any width, and the notes you pinned. The panel gets to know which project it
is looking at.

It runs on your machine only: an MCP server on stdio for your agent and a
WebSocket on `127.0.0.1` for the panel. Nothing leaves the machine.

The extension is not in the Chrome Web Store yet; build and load it from the
[repository](https://github.com/itsHendri/codename#development).

## Set up

Register the bridge with your agent, once:

```sh
npx codename-bridge setup
```

That installs the `codename` skill into `~/.claude/skills` and runs
`claude mcp add codename -- npx codename-bridge`. For Cursor, `--client cursor`
prints the `mcp.json` entry to paste instead:

```json
{ "mcpServers": { "codename": { "command": "npx", "args": ["codename-bridge"] } } }
```

## Use

1. Start your agent in the folder you are working in. It launches the bridge.
2. In a second terminal, open the project's dev server with the panel ready:

   ```sh
   npx codename-bridge open .
   ```

   It starts the `dev`, `start` or `serve` script with the package manager your
   lockfile names, waits for the local URL and opens it. `--cmd "…"` says how
   to start a project the scripts do not cover; `--url` opens one that is
   already running.
3. Click the Codename icon on the page and enter the pairing code the first
   time. It is printed by `open`, by `npx codename-bridge code`, or by your
   agent's `pairing_code` tool. After that the panel pairs by itself.

## Commands

| Command | What it does |
|---|---|
| `codename-bridge` | Run the bridge (your agent does this). `--port N`, `--keep-token` |
| `codename-bridge setup` | Install the skill and register the bridge with your agent |
| `codename-bridge open [dir]` | Start the dev server and open it in your browser |
| `codename-bridge code` | Print the pairing code of the running bridge |
| `codename-bridge unpin` | Forget which copy of the extension it paired with, after switching between builds |

## What the bridge may do

It reads the files in the folder it runs in to find where a variable is
defined. It writes exactly one kind of change: the value of a single,
unambiguous root-level variable definition, and only after you turn that on for
the project in the panel. It refuses anything else and never touches git.
Everything else stays your agent's to do.

Five wrong pairing codes in a minute lock it for five minutes, and it only
answers the one extension it first paired with.

## License

MIT
