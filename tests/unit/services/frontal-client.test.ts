import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { FrontalClient } from "@/clients/frontal-client.js";
import { FrontalApiError } from "@/lib/error.js";
import { createLogger } from "@/utils/logger.js";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(body === null ? "" : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function makeClient(overrides: Record<string, unknown> = {}): FrontalClient {
  const logger: Logger = createLogger({ level: "error" });
  return new FrontalClient({
    baseUrl: "https://api.frontal.dev",
    apiKey: "frt_testkey",
    logger,
    retry: { maxAttempts: 3, baseDelay: 1, maxDelay: 5, jitter: false },
    ...overrides,
  });
}

describe("FrontalClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function headersOf(callIndex = 0): Headers {
    return mockFetch.mock.calls[callIndex][1].headers as Headers;
  }

  describe("request formatting & auth", () => {
    it("sends bearer auth, request id, and region headers", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const client = makeClient({ region: "iad" });

      await client.request("GET", "/v1/data/query", {
        query: { limit: 10, tags: ["a", "b"] },
      });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.frontal.dev/v1/data/query?limit=10&tags=a&tags=b"
      );
      expect(opts.method).toBe("GET");
      const headers = headersOf();
      expect(headers.get("authorization")).toBe("Bearer frt_testkey");
      expect(headers.get("x-request-id")).toBeTruthy();
      expect(headers.get("x-frontal-region")).toBe("iad");
    });

    it("strips a stray /v1 suffix from the base URL", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const client = makeClient({ baseUrl: "https://api.frontal.dev/v1" });
      await client.request("GET", "/v1/data/datasets");
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.frontal.dev/v1/data/datasets"
      );
    });

    it("throws 401 without calling fetch when no key on a protected path", async () => {
      const client = makeClient({ apiKey: "" });
      await expect(client.request("GET", "/v1/data/query")).rejects.toThrow(
        FrontalApiError
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not send auth on public geo endpoints", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ status: "ok" }));
      const client = makeClient({ apiKey: "" });
      await client.request("GET", "/health");
      expect(headersOf().get("authorization")).toBeNull();
    });

    it("per-call token overrides the configured key", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const client = makeClient();
      await client.request("GET", "/v1/data/query", { token: "frt_other" });
      expect(headersOf().get("authorization")).toBe("Bearer frt_other");
    });
  });

  describe("success & rate limit", () => {
    it("returns parsed data and rate-limit headers", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { items: [1, 2] },
          {
            headers: {
              "x-ratelimit-limit": "20",
              "x-ratelimit-remaining": "18",
              "x-ratelimit-reset": "2026-07-24T00:00:00Z",
            },
          }
        )
      );
      const client = makeClient();
      const res = await client.request<{ items: number[] }>(
        "GET",
        "/v1/data/query"
      );
      expect(res.data.items).toEqual([1, 2]);
      expect(res.rateLimit).toEqual({
        limit: 20,
        remaining: 18,
        reset: "2026-07-24T00:00:00Z",
      });
    });
  });

  describe("retry matrix", () => {
    it("retries 503 then succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ message: "down" }, { status: 503 })
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = makeClient();
      const res = await client.request("GET", "/v1/data/query");
      expect((res.data as { ok: boolean }).ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry 401", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: { code: "unauthorized", message: "bad key" } },
          {
            status: 401,
          }
        )
      );
      const client = makeClient();
      await expect(
        client.request("GET", "/v1/data/query")
      ).rejects.toMatchObject({
        httpStatus: 401,
        code: "unauthorized",
        retryable: false,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry 409 (bad region)", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: "invalid_region", message: "unknown region" },
          {
            status: 409,
          }
        )
      );
      const client = makeClient();
      await expect(
        client.request("GET", "/v1/data/query")
      ).rejects.toMatchObject({ httpStatus: 409, retryable: false });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry 501 (route not enabled)", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: { code: "not_implemented", message: "off" } },
          {
            status: 501,
          }
        )
      );
      const client = makeClient();
      await expect(
        client.request("POST", "/v1/data/pipelines")
      ).rejects.toMatchObject({ httpStatus: 501, retryable: false });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries 429 honoring the response", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            { error: "rate_limited", message: "slow down" },
            {
              status: 429,
              headers: { "retry-after": "0" },
            }
          )
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = makeClient();
      const res = await client.request("GET", "/v1/data/query");
      expect((res.data as { ok: boolean }).ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("idempotency", () => {
    it("reuses one idempotency key across retried writes", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ message: "down" }, { status: 503 })
        )
        .mockResolvedValueOnce(jsonResponse({ id: "run_1" }));
      const client = makeClient();
      await client.request("POST", "/v1/data/pipelines", { body: { x: 1 } });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = headersOf(0).get("x-frontal-idempotency-key");
      const second = headersOf(1).get("x-frontal-idempotency-key");
      expect(first).toBeTruthy();
      expect(first).toBe(second);
    });

    it("does not send idempotency key on GET", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const client = makeClient();
      await client.request("GET", "/v1/data/query");
      expect(headersOf().get("x-frontal-idempotency-key")).toBeNull();
    });
  });

  describe("error normalization", () => {
    it("parses gateway shape { error: { code, message } }", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: { code: "bad", message: "gw error" } },
          {
            status: 400,
          }
        )
      );
      await expect(
        makeClient().request("GET", "/v1/data/query")
      ).rejects.toMatchObject({ code: "bad", message: "gw error" });
    });

    it("parses geo-router shape { error, message }", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: "rate_limited", message: "too many" },
          {
            status: 400,
          }
        )
      );
      await expect(
        makeClient().request("GET", "/v1/data/query")
      ).rejects.toMatchObject({ code: "rate_limited", message: "too many" });
    });

    it("parses backend google.rpc.Status { code, message, details }", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { code: "INVALID_ARGUMENT", message: "bad arg", details: [{ x: 1 }] },
          { status: 400 }
        )
      );
      await expect(
        makeClient().request("GET", "/v1/data/query")
      ).rejects.toMatchObject({
        code: "INVALID_ARGUMENT",
        message: "bad arg",
        details: [{ x: 1 }],
      });
    });
  });

  describe("pagination", () => {
    it("follows next_cursor until absent", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ items: [1], next_cursor: "c1" }))
        .mockResolvedValueOnce(jsonResponse({ items: [2], next_cursor: "c2" }))
        .mockResolvedValueOnce(jsonResponse({ items: [3] }));
      const client = makeClient();
      const pages = await client.paginate("/v1/data/datasets");
      expect(pages).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // second call carried the cursor from page 1
      expect(mockFetch.mock.calls[1][0]).toContain("cursor=c1");
    });

    it("respects maxPages", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ items: [1], next_cursor: "more" }))
      );
      const client = makeClient();
      const pages = await client.paginate("/v1/data/datasets", { maxPages: 2 });
      expect(pages).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("headers, region, and body handling", () => {
    it("merges custom headers", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await makeClient().request("GET", "/v1/data/query", {
        headers: { "x-custom": "yes" },
      });
      expect(headersOf().get("x-custom")).toBe("yes");
    });

    it("allows skipAuth without a key and omits Authorization", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await makeClient({ apiKey: "" }).request("POST", "/v1/data/pipelines", {
        skipAuth: true,
        body: {},
      });
      expect(headersOf().get("authorization")).toBeNull();
    });

    it("per-call region overrides the client default", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await makeClient({ region: "iad" }).request("GET", "/v1/data/query", {
        region: "lhr",
      });
      expect(headersOf().get("x-frontal-region")).toBe("lhr");
    });

    it("sends a content-type only when a body is present", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await makeClient().request("GET", "/v1/data/query");
      expect(headersOf().get("content-type")).toBeNull();
    });

    it("returns a non-JSON body as text", async () => {
      mockFetch.mockResolvedValue(
        new Response("plain text", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      );
      const res = await makeClient().request("GET", "/v1/data/query");
      expect(res.data).toBe("plain text");
    });

    it("does not retry a generic 4xx", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ message: "bad request" }, { status: 400 })
      );
      await expect(
        makeClient().request("GET", "/v1/data/query")
      ).rejects.toMatchObject({ httpStatus: 400, retryable: false });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("transport errors", () => {
    it("retries a network error then throws a 503", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNRESET"));
      await expect(
        makeClient().request("GET", "/v1/data/query")
      ).rejects.toMatchObject({ httpStatus: 503, retryable: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
