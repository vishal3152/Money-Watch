# Connecting an AI assistant (MCP setup)

How to point Claude Desktop, Claude Code, Cursor, or another MCP-compatible client at
Paisa-Watch's own MCP server so it can import a bank statement. See `docs/specs/import.md`
for what the server actually does; this page is only the client-side connection steps.

The steps differ by deployment mode: local/desktop needs no credential at all
(loopback is the trust boundary); cloud-hosted needs an MCP access token
(`docs/adr/0011-mcp-cloud-auth-static-bearer-token.md`).

## 1. Find your server URL

Open **Settings → Connect AI Assistant → How to connect MCP** (`/settings/mcp`) in the running
app. It shows the exact address for this instance (including `https://` when the app itself was
opened over HTTPS), e.g. `http://localhost:3000/api/mcp` locally or `https://your-domain/api/mcp`
in cloud mode, plus a ready-to-paste `mcp.json` block.

**Local/desktop/self-hosted only:** this endpoint accepts connections from the same
machine only — no login or API key is needed. Skip to step 2.

**Cloud-hosted only:** this same page also has an "MCP Access Token" control. Click
**Generate token** and copy the plaintext shown — it is shown exactly once and only its
hash is ever stored, so if you lose it you'll need to generate a new one (which
invalidates the old one immediately). You'll use it in step 2 below.

## 2. Add it to your client

**Claude Desktop** — Settings → Connectors → Add custom connector → paste the URL from
step 1. Local/desktop: Desktop will attempt an OAuth handshake; since this server needs
no auth there, that step should just complete (nothing to fill in). Cloud-hosted: use the
Advanced settings to add a custom header, `Authorization: Bearer <your token>`, using the
token from step 1 — if the connector UI doesn't offer a custom-header field, use Claude
Code or Cursor's JSON config below instead. See [Anthropic's Custom Connectors
docs](https://support.claude.com/en/articles/10949351) if the flow prompts for anything
unexpected.

**Claude Code / Cursor** — add an entry to your MCP config (Cursor: Settings → Features →
MCP → Add New MCP Server, or edit `mcp.json` directly; Claude Code: `.mcp.json`):

```json
{
  "mcpServers": {
    "paisa-watch": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Use the URL from step 1, not the placeholder above. **Local/desktop/self-hosted:** omit
the `headers` block entirely — it isn't needed and there's no token to put there.
**Cloud-hosted:** keep `headers`, replacing `YOUR_TOKEN_HERE` with the token from step 1.
Cursor's config accepts a bare `url` field without `type`; Claude Code needs
`"type": "http"` (or `"streamable-http"`, an alias for the same transport) alongside it.

**Another MCP client** — connect it as a Streamable HTTP server at the URL from step 1,
with the `Authorization: Bearer <token>` header in cloud mode. If the client only
supports local stdio servers, it isn't compatible with this endpoint today (see "Not
covered" below).

## 3. Verify it worked

Ask the assistant something like "list my Paisa-Watch accounts". It should call the
`list_accounts` tool and read back your Institutions/Accounts. If it can't see the
server at all, see Troubleshooting below.

## Troubleshooting

- **403 Forbidden (local/desktop/self-hosted)** — the request's `Host` header wasn't
  recognized as loopback (`src/app/api/mcp/loopback-guard.ts`). This can happen behind a
  reverse proxy that rewrites `Host`; the MCP endpoint isn't meant to be exposed that way
  in this mode (loopback is the trust boundary).
- **401 Unauthorized (cloud-hosted)** — the `Authorization` header was missing, malformed,
  or the token doesn't match a generated one. Re-check the header is exactly
  `Authorization: Bearer <token>` (no extra quoting), and that the token wasn't since
  regenerated or revoked from Settings — only the most recently generated token works.
- **Client can't reach the URL at all** — confirm the app is actually running and that
  the address in the URL matches what Settings currently shows (it's read live from the
  request, not hardcoded, so it changes if you change how the app is launched or deployed).
- **Assistant sees the tools but the import looks wrong** — the assistant reads and
  parses your statement itself; Paisa-Watch never sees the file. Re-check what you
  pasted/uploaded to the assistant, not this server.

## Not covered

A remote client that can't send a static header (e.g. a hosted ChatGPT connector, which
requires OAuth 2.1 with dynamic client registration) needs a separate public,
OAuth-protected endpoint — proposed but not built yet:
`docs/adr/0008-mcp-endpoint-adds-scoped-oauth-for-remote-clients.md`.
