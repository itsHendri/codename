# codename-bridge

The local companion for [Codename](https://github.com/itsHendri/codename), a
Chrome design tool that edits the live page. The bridge runs in your project
folder: it lets the panel's **Make changes** run your coding agent there on
the change you made, tells the panel which project it is looking at, and — as
an MCP server — lets an agent you chat with see the page.

The bridge itself runs on your machine only: a WebSocket on `127.0.0.1` for
the panel, and MCP on stdio when an agent started it. It talks to no server.
The agent it runs for Make changes is your own, signed in with your own
account, and sends the brief to its own model service as it always would.

The extension is not in the Chrome Web Store yet; build and load it from the
[repository](https://github.com/itsHendri/codename#development).

## Use

In the project you are working in:

```sh
npx codename-bridge open .
```

It starts the bridge for that folder, starts the dev server with the package
manager your lockfile names, waits for the local URL, opens it, and prints the
pairing code. Click the Codename icon on the page and enter the code the first
time; the code is kept, so the panel pairs by itself after that.

Edit the page, then press **Make changes** on the Changes tab. The bridge runs
your coding agent in the folder on the brief — Claude Code, Cursor
(`cursor-agent`) or Codex, whichever is installed, signed in with your own
account — and the panel shows its steps as it works. The first run of each
agent in a project asks first. Claude Code is held to reading and editing
files; Cursor and Codex can also run commands (Codex in a sandbox with no
network). `CODENAME_AGENT_CMD` runs any other tool: a command with `{prompt}`
where the brief goes.

## From a chat

The bridge is also an MCP server, so an agent you chat with can read the page:
screenshots, the selection, notes, the critique, where a token is defined.
Register it once:

```sh
npx codename-bridge setup
```

That installs the `codename` skill into `~/.claude/skills` and runs
`claude mcp add codename -- npx codename-bridge`. For Cursor, `--client cursor`
prints the `mcp.json` entry to paste instead:

```json
{ "mcpServers": { "codename": { "command": "npx", "args": ["codename-bridge"] } } }
```

An agent started in the project then runs the bridge itself, and `open` uses
that one.

## Commands

| Command | What it does |
|---|---|
| `codename-bridge` | Run the bridge with MCP on stdio (an agent does this). `--port N`, `--keep-token` |
| `codename-bridge setup` | Install the skill and register the bridge with your agent |
| `codename-bridge open [dir]` | Start the bridge (unless one runs here), the dev server, and open it in your browser |
| `codename-bridge code` | Print the pairing code of the running bridge |
| `codename-bridge unpin` | Forget which copy of the extension it paired with, after switching between builds |

## What the bridge may do

It reads the files in the folder it runs in to find where a variable is
defined. It writes exactly one kind of change itself: the value of a variable
definition, in the scope the value was edited under — a light value into the
root of the cascade or a Tailwind `@theme`, a dark value into the page's dark
blocks — and only after you turn that on for the project in the panel. It
replaces the value and nothing else: no insertion, no reformatting, never a
width override or a component scope, never a token file. It never touches git.

Make changes runs an agent in that folder, and only after you allowed that
agent for the project in the panel. The agent edits source; the bridge starts
it, hands it the brief, and reports its steps.

Five wrong pairing codes in a minute lock it for five minutes, and it only
answers the one extension it first paired with.

## License

MIT
