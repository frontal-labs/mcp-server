import { describe, expect, it } from "vitest";
import { loadSpecIndex } from "@/spec/spec-index.js";

describe("SpecIndex", () => {
  const idx = loadSpecIndex();

  it("indexes the full operation catalog", () => {
    expect(idx.count).toBeGreaterThan(300);
    expect(idx.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("looks up an operation by id", () => {
    const op = idx.getByOperationId("getV1OntologyObjectsObjects");
    expect(op).toBeDefined();
    expect(op?.method).toBe("get");
    expect(op?.path).toBe("/v1/ontology/objects/objects");
  });

  it("looks up an operation by method and path", () => {
    const op = idx.getByMethodPath("GET", "/v1/ontology/objects/objects");
    expect(op?.operationId).toBe("getV1OntologyObjectsObjects");
  });

  it("filters by tag", () => {
    const ontology = idx.list({ tag: "ontology" });
    expect(ontology.length).toBeGreaterThan(0);
    expect(ontology.every((op) => op.tags.includes("ontology"))).toBe(true);
  });

  it("filters by free-text search", () => {
    const results = idx.list({ search: "datasets" });
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((op) => `${op.operationId} ${op.path}`.includes("datasets"))
    ).toBe(true);
  });

  it("exposes the available tags", () => {
    const tags = idx.allTags();
    expect(tags).toContain("ontology");
    expect(tags).toContain("data");
  });

  it("dereferences a $ref without throwing on cycles", () => {
    const result = idx.dereference({ $ref: "#/components/schemas/Missing" });
    expect(result).toMatchObject({ note: expect.any(String) });
  });

  it("inherits path-item-level parameters into each operation", () => {
    // `/admin/users/{userId}` declares `userId` at the path-item level, so
    // every operation on it (get/put/delete) must expose that path param.
    const op = idx.getByMethodPath("GET", "/admin/users/{userId}");
    expect(op).toBeDefined();
    const userId = op?.parameters.find((p) => p.name === "userId");
    expect(userId).toMatchObject({ name: "userId", in: "path" });
  });
});
