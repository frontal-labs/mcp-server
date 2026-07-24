import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { registerCuratedTool } from "@/adapters/curated.js";
import {
  callOperation,
  substitutePath,
  toToolError,
  toToolResult,
} from "@/adapters/tool-helpers.js";
import type { AdapterContext } from "@/adapters/types.js";
import { FrontalApiError, SpecError, ToolInputError } from "@/lib/error.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { createLogger } from "@/utils/logger.js";

describe("toToolResult", () => {
  it("passes strings through unchanged", () => {
    expect(toToolResult("hello").content[0].text).toBe("hello");
  });

  it("JSON-stringifies objects", () => {
    expect(toToolResult({ a: 1 }).content[0].text).toContain('"a": 1');
  });
});

describe("toToolError", () => {
  const cases: [number, string][] = [
    [401, "API key"],
    [409, "region"],
    [501, "not currently enabled"],
  ];
  for (const [status, hint] of cases) {
    it(`adds guidance for ${status}`, () => {
      const result = toToolError(
        new FrontalApiError("boom", status, "code", false)
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(hint);
    });
  }

  it("includes details when present", () => {
    const result = toToolError(
      new FrontalApiError("boom", 400, "bad", false, { field: "x" })
    );
    expect(result.content[0].text).toContain("Details");
  });

  it("handles non-FrontalApiError values", () => {
    expect(toToolError(new Error("plain")).content[0].text).toContain("plain");
    expect(toToolError("weird").content[0].text).toContain("weird");
  });
});

describe("substitutePath", () => {
  it("substitutes and URL-encodes params", () => {
    expect(substitutePath("/a/{id}", { id: "x/y" })).toBe("/a/x%2Fy");
  });

  it("throws on a missing param", () => {
    expect(() => substitutePath("/a/{id}", {})).toThrow(ToolInputError);
  });
});

describe("callOperation", () => {
  const ctx = {
    spec: loadSpecIndex(),
    logger: createLogger({ level: "error" }),
    getToken: () => "frt_x",
    client: {
      request: () =>
        Promise.resolve({
          data: { ok: true },
          status: 200,
          rateLimit: {},
          requestId: "r",
        }),
      paginate: () => Promise.resolve([{ p: 1 }]),
    },
  } as unknown as AdapterContext;

  it("throws for an unknown operationId", async () => {
    await expect(callOperation(ctx, "nope")).rejects.toBeInstanceOf(SpecError);
  });

  it("auto-paginates GET operations", async () => {
    const result = (await callOperation(
      ctx,
      "getV1DataCatalogCatalogDatasets",
      {
        autoPaginate: true,
      }
    )) as { pages: unknown[] };
    expect(result.pages).toHaveLength(1);
  });
});

describe("registerCuratedTool drift guard", () => {
  it("skips (and warns) when the operationId is missing from the spec", () => {
    const logger = createLogger({ level: "error" });
    const warnSpy = vi.spyOn(logger, "warn");
    const registered: string[] = [];
    const server = {
      registerTool: (name: string) => registered.push(name),
    } as unknown as McpServer;
    const ctx = {
      spec: loadSpecIndex(),
      logger,
    } as unknown as AdapterContext;

    registerCuratedTool(server, ctx, {
      name: "bogus_tool",
      title: "Bogus",
      description: "maps to nothing",
      inputSchema: {},
      operationId: "operationThatDoesNotExist",
    });

    expect(registered).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
