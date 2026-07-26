---
name: ethui-init
description: Use when setting up ethui Stacks for the first time in a project, when ethui MCP tools are missing or failing with auth errors, or when the user says "ethui init", "connect ethui", "set up stacks". Authenticates by email code and registers the ethui-stacks MCP server for this project.
---

# ethui-init

Step zero. Every other ethui skill fails without this, usually with a confusing "unknown tool"
error, so run it whenever the tools are absent.

## 1. Check what already exists

```bash
claude mcp list 2>&1 | grep -i ethui
```

- **Present and connected** → nothing to do. Tell the user, and stop.
- **Present but failing** → the token is stale or the url changed. Continue; step 4 re-points it.
- **Absent** → continue.

If the user is pointing at a local instance (`api` on `localhost:4000`, `ETHUI_STACKS_SAAS` unset),
there is no auth at all. Skip to step 4 with no `Authorization` header.

## 2. Get a token

Ask for the user's email, then:

```bash
curl -s -X POST https://api.stacks.ethui.dev/auth/send-code \
  -H 'content-type: application/json' -d '{"email":"<email>"}'
```

Ask the user to paste the code that arrives, then:

```bash
curl -s -X POST https://api.stacks.ethui.dev/auth/verify-code \
  -H 'content-type: application/json' -d '{"email":"<email>","code":"<code>"}'
```

The response is `{"token": "<jwt>"}`.

**Never print the token**, not in output, not in a summary, not in a commit. Pass it directly into
step 4.

## 3. Reuse an existing token if there is one

Before asking for an email, check whether another project already registered the server — the same
token works everywhere:

```bash
python3 -c "
import json; d=json.load(open('$HOME/.claude.json'))
for p,c in d.get('projects',{}).items():
    for n,s in (c.get('mcpServers') or {}).items():
        if 'ethui' in n: print(p)
"
```

If one turns up, reuse its `Authorization` header rather than sending another email code.

## 4. Register the server

```bash
claude mcp add --transport http ethui-stacks https://api.stacks.ethui.dev/mcp \
  --header "Authorization: Bearer <jwt>"
```

Default scope is local, which is what you want — the token is a credential and does not belong in a
shared project config.

Then verify:

```bash
claude mcp list 2>&1 | grep -i ethui
```

## 5. Tell the user the one thing they will get wrong

MCP servers bind at session start, so **the tools are not available in the session that ran this
command.** Say it plainly: run `/mcp` to reconnect, or restart the session, then try again.

Without this line the user's next command fails and looks like the plugin is broken.

## Notes

- The JWT carries a 7-day `exp` that the server never validates, so old tokens keep working. Do not
  build expiry handling and do not advertise this.
- Against a local instance `list_stacks` returns **every** stack in the database, not just the
  user's. Say so if you notice a local url.
- This is a bearer token, not OAuth 2.1, so one-click connect from claude.ai web will not work.
  Claude Code and Desktop with a custom header do.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
