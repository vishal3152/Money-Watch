import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvedCheckMock = vi.fn();
vi.mock("@/email-sync/assert-safe-llm-host", () => ({
  assertSafeLlmBaseUrlResolved: (...args: unknown[]) => resolvedCheckMock(...args)
}));

const { createLlmCaller, createEmailClassifier, EMAIL_ALERT_SYSTEM_PROMPT, TRANSACTION_CLASSIFIER_SYSTEM_PROMPT } =
  await import("@/email-sync/llm-client");
const { InvalidEmailAlertError } = await import("@/domain/email-alert");
const { UnsafeLlmHostError } = await import("@/domain/llm-host-safety");

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe("createLlmCaller", () => {
  beforeEach(() => {
    resolvedCheckMock.mockReset();
    resolvedCheckMock.mockResolvedValue(undefined);
  });

  const input = { subject: "Debit alert", body: "Rs 100 debited" };

  it("posts to the configured URL as-is — settings holds the full endpoint, nothing is appended", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.model).toBe("openai/gpt-4o-mini");
  });

  it("sends a system prompt that lists every import field the JSON must include", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: EMAIL_ALERT_SYSTEM_PROMPT });
    for (const field of [
      "direction",
      "amount",
      "currencyCode",
      "occurredAt",
      "accountNumberSuffix",
      "institutionName",
      "description"
    ]) {
      expect(EMAIL_ALERT_SYSTEM_PROMPT).toContain(`"${field}"`);
    }
  });

  it("strips only a trailing slash — does not rewrite or append a path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/api/chat/",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:11434/api/chat");
  });

  it("leaves an OpenAI-compatible or provider-native path unchanged (e.g. Ollama /api/chat)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/api/chat",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:11434/api/chat");
  });

  it("includes an Authorization header when apiKey is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect((requestInit as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk-test" });
  });

  it("omits the Authorization header entirely when apiKey is blank", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect((requestInit as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("returns the parsed JSON content on a well-formed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"direction":"debit"}' } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).resolves.toEqual({ direction: "debit" });
  });

  it("always sends stream:false so hosts that default to NDJSON streaming (Ollama /api/chat) return one JSON object", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/api/chat",
      model: "qwen2.5:1.5b",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.stream).toBe(false);
  });

  it("on Ollama /api/chat, sends format=<schema> (not OpenAI response_format) and reads message.content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "qwen2.5:1.5b",
        message: { role: "assistant", content: '{"direction":"credit"}' },
        done: true
      })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/api/chat",
      model: "qwen2.5:1.5b",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).resolves.toEqual({ direction: "credit" });

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.format).toEqual(expect.objectContaining({ type: "object" }));
    expect(body).not.toHaveProperty("response_format");
  });

  it("raises InvalidEmailAlertError, not SyntaxError, when the HTTP body is NDJSON (Ollama stream default)", async () => {
    const ndjson = [
      '{"message":{"role":"assistant","content":"{\\"is"},"done":false}',
      '{"message":{"role":"assistant","content":"TransactionUpdate\\":false}"},"done":true}'
    ].join("\n");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => JSON.parse(ndjson),
      text: async () => ndjson
    } as Response);

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/api/chat",
      model: "qwen2.5:1.5b",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).rejects.toThrow(InvalidEmailAlertError);
  });

  it("throws on a non-ok HTTP response (transport failure, not content-shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 500));

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).rejects.toThrow(/500/);
  });

  it("raises InvalidEmailAlertError, not an uncaught SyntaxError, when content is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "Sure! ```json\\n{}\\n```" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).rejects.toThrow(InvalidEmailAlertError);
  });

  it("raises InvalidEmailAlertError, not a generic Error, when the response has no message content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{}] }));

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(call(input)).rejects.toThrow(InvalidEmailAlertError);
  });

  it("runs the resolved SSRF check before fetching when enforceHostSafety is true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: true,
      fetchImpl
    });
    await call(input);

    expect(resolvedCheckMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never fetches when the resolved SSRF check rejects", async () => {
    resolvedCheckMock.mockRejectedValueOnce(new UnsafeLlmHostError("http://169.254.169.254/v1", "blocked"));
    const fetchImpl = vi.fn();

    const call = createLlmCaller({
      baseUrl: "http://169.254.169.254/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: true,
      fetchImpl
    });

    await expect(call(input)).rejects.toThrow(UnsafeLlmHostError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs the resolved SSRF check only once across many calls from the same caller (a poll with many messages must not re-resolve DNS per message)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: true,
      fetchImpl
    });
    await call(input);
    await call(input);
    await call(input);

    expect(resolvedCheckMock).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("skips the resolved SSRF check entirely when enforceHostSafety is false (local mode, e.g. Ollama on localhost)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    const call = createLlmCaller({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });
    await call(input);

    expect(resolvedCheckMock).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createEmailClassifier", () => {
  beforeEach(() => {
    resolvedCheckMock.mockReset();
    resolvedCheckMock.mockResolvedValue(undefined);
  });

  function classifierResponse(isTransactionUpdate: boolean): Response {
    return jsonResponse({ choices: [{ message: { content: JSON.stringify({ isTransactionUpdate }) } }] });
  }

  it("sends only the sender name and subject as the user message — never the email body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await classify({ senderName: "RBL Bank <alerts@rblbank.com>", subject: "Credit Alert" });

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "Sender: RBL Bank <alerts@rblbank.com>\nSubject: Credit Alert"
    });
  });

  it("adds an 'Originally from' line when a forwarded email supplies a second, embedded sender", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await classify({
      senderName: "John Doe <john@example.com>",
      originalSenderName: "RBL Bank",
      subject: "Fwd: Credit Alert"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "Sender: John Doe <john@example.com>\nOriginally from: RBL Bank\nSubject: Fwd: Credit Alert"
    });
  });

  it("uses a dedicated binary JSON schema, not the full email-alert schema", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });
    await classify({ senderName: "RBL Bank", subject: "Credit Alert" });

    const [, requestInit] = fetchImpl.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.response_format.json_schema.schema.properties.isTransactionUpdate.type).toBe("boolean");
    expect(body.response_format.json_schema.name).toBe("transaction_email_classification");
    expect(body.messages[0]).toEqual({ role: "system", content: TRANSACTION_CLASSIFIER_SYSTEM_PROMPT });
  });

  it("the system prompt tells the model to exclude telecom/utility bills that merely look transactional", () => {
    expect(TRANSACTION_CLASSIFIER_SYSTEM_PROMPT.toLowerCase()).toContain("telecom");
  });

  it("returns true when the LLM classifies the email as a transaction update", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(classify({ senderName: "RBL Bank", subject: "Credit Alert" })).resolves.toBe(true);
  });

  it("returns false when the LLM classifies the email as not a transaction update (e.g. a telecom bill)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(false));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(
      classify({ senderName: "Airtel", subject: "Your bill payment of Rs 499 is due" })
    ).resolves.toBe(false);
  });

  it("raises InvalidEmailAlertError when the response has no boolean isTransactionUpdate field", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: false,
      fetchImpl
    });

    await expect(classify({ senderName: "RBL Bank", subject: "Credit Alert" })).rejects.toThrow(
      InvalidEmailAlertError
    );
  });

  it("runs the resolved SSRF check before fetching when enforceHostSafety is true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      enforceHostSafety: true,
      fetchImpl
    });
    await classify({ senderName: "RBL Bank", subject: "Credit Alert" });

    expect(resolvedCheckMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips the resolved SSRF check entirely when enforceHostSafety is false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(classifierResponse(true));

    const classify = createEmailClassifier({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      enforceHostSafety: false,
      fetchImpl
    });
    await classify({ senderName: "RBL Bank", subject: "Credit Alert" });

    expect(resolvedCheckMock).not.toHaveBeenCalled();
  });
});
