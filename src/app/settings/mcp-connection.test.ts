import { describe, expect, it } from "vitest";

import {
  buildMcpClientConfigJson,
  resolveMcpEndpointUrl,
  resolveMcpRequestProtocol
} from "@/app/settings/mcp-connection";

describe("resolveMcpRequestProtocol", () => {
  it("uses x-forwarded-proto when present (cloud / reverse proxy)", () => {
    expect(resolveMcpRequestProtocol({ "x-forwarded-proto": "https" })).toBe("https");
  });

  it("takes the first value when x-forwarded-proto is a comma list", () => {
    expect(resolveMcpRequestProtocol({ "x-forwarded-proto": "https, http" })).toBe("https");
  });

  it("defaults to http when no forwarded proto is present (local / desktop)", () => {
    expect(resolveMcpRequestProtocol({})).toBe("http");
  });
});

describe("resolveMcpEndpointUrl", () => {
  it("builds an http endpoint from the request's own Host header", () => {
    expect(resolveMcpEndpointUrl("127.0.0.1:4571")).toBe("http://127.0.0.1:4571/api/mcp");
  });

  it("builds an https endpoint when the app was reached over https", () => {
    expect(resolveMcpEndpointUrl("paisa-watch.vercel.app", "https")).toBe(
      "https://paisa-watch.vercel.app/api/mcp"
    );
  });

  it("falls back to localhost when no Host header is present", () => {
    expect(resolveMcpEndpointUrl(null)).toBe("http://localhost/api/mcp");
  });
});

describe("buildMcpClientConfigJson", () => {
  it("emits a Cursor/Claude Code mcpServers entry with the given url and no headers", () => {
    expect(buildMcpClientConfigJson({ url: "http://127.0.0.1:4571/api/mcp" })).toBe(
      JSON.stringify(
        {
          mcpServers: {
            "paisa-watch": {
              type: "http",
              url: "http://127.0.0.1:4571/api/mcp"
            }
          }
        },
        null,
        2
      )
    );
  });

  it("includes an Authorization Bearer header when an access token is provided", () => {
    expect(
      buildMcpClientConfigJson({
        url: "https://paisa-watch.vercel.app/api/mcp",
        accessToken: "tok_abc"
      })
    ).toBe(
      JSON.stringify(
        {
          mcpServers: {
            "paisa-watch": {
              type: "http",
              url: "https://paisa-watch.vercel.app/api/mcp",
              headers: {
                Authorization: "Bearer tok_abc"
              }
            }
          }
        },
        null,
        2
      )
    );
  });
});
