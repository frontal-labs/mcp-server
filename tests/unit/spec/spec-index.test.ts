/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
    for (const method of ["GET", "PUT", "DELETE"]) {
      const op = idx.getByMethodPath(method, "/admin/users/{userId}");
      expect(op).toBeDefined();
      const userId = op?.parameters.find((p) => p.name === "userId");
      expect(userId).toMatchObject({ name: "userId", in: "path" });
    }
  });
});
