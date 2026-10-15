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
import specJson from "../../openapi/public.v1.json" with { type: "json" };

/** HTTP methods that carry an operation in the OpenAPI spec. */
export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** A single parameter as declared in the spec (path/query/header/cookie). */
export interface SpecParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema?: unknown;
}

/** A normalized, spec-derived view of one API operation. */
export interface OperationInfo {
  operationId: string;
  method: HttpMethod;
  path: string;
  tags: string[];
  summary?: string;
  description?: string;
  parameters: SpecParameter[];
  catchAllParams: string[];
  requestBody?: unknown;
  responses?: unknown;
  requiresAuth: boolean;
}

interface RawOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: SpecParameter[];
  requestBody?: unknown;
  responses?: unknown;
  security?: unknown[];
}

interface RawPathItem {
  get?: RawOperation;
  post?: RawOperation;
  put?: RawOperation;
  patch?: RawOperation;
  delete?: RawOperation;
  parameters?: SpecParameter[];
  "x-any-method-route"?: boolean;
  "x-audit-original-paths"?: string[];
}

interface RawSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, RawPathItem>;
  components?: Record<string, unknown>;
  security?: unknown[];
}

function catchAllParamNames(item: RawPathItem): string[] {
  const originals = item["x-audit-original-paths"];
  if (!Array.isArray(originals)) return [];
  const names = new Set<string>();
  for (const original of originals) {
    if (typeof original !== "string") continue;
    for (const match of original.matchAll(/\{([^}:]+):path\}/g)) {
      names.add(match[1]);
    }
  }
  return [...names];
}

function validParameters(list: SpecParameter[]): SpecParameter[] {
  return list.filter(
    (p): p is SpecParameter => Boolean(p) && typeof p.name === "string"
  );
}

function mergeParameters(
  itemParams: SpecParameter[],
  opParams: SpecParameter[]
): SpecParameter[] {
  const merged = new Map<string, SpecParameter>();
  for (const p of [
    ...validParameters(itemParams),
    ...validParameters(opParams),
  ]) {
    merged.set(`${p.in}:${p.name}`, p);
  }
  return [...merged.values()];
}

const REF_ROOT = "#/";
const MAX_DEREF_DEPTH = 12;

export class SpecIndex {
  private readonly spec: RawSpec;
  private readonly byOperationId = new Map<string, OperationInfo>();
  private readonly byMethodPath = new Map<string, OperationInfo>();
  private readonly operations: OperationInfo[] = [];

  constructor(spec: RawSpec) {
    this.spec = spec;
    const globalAuthed =
      Array.isArray(spec.security) && spec.security.length > 0;

    for (const [path, item] of Object.entries(spec.paths ?? {})) {
      const itemParams = Array.isArray(item.parameters) ? item.parameters : [];
      const catchAllParams = catchAllParamNames(item);
      let hasOperation = false;
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (op) {
          hasOperation = true;
          this.indexOperation(
            path,
            method,
            op,
            itemParams,
            catchAllParams,
            globalAuthed
          );
        }
      }

      const anyMethod = item["x-any-method-route"] === true;
      if (!hasOperation && anyMethod) {
        this.indexAnyMethodRoute(
          path,
          itemParams,
          catchAllParams,
          globalAuthed
        );
      }
    }
  }

  private indexOperation(
    path: string,
    method: HttpMethod,
    op: RawOperation,
    itemParams: SpecParameter[],
    catchAllParams: string[],
    globalAuthed: boolean
  ): void {
    const operationId =
      op.operationId ?? this.syntheticOperationId(method, path);
    const requiresAuth = Array.isArray(op.security)
      ? op.security.length > 0
      : globalAuthed;

    this.addOperation({
      operationId,
      method,
      path,
      tags: op.tags ?? [],
      summary: op.summary,
      description: op.description,
      parameters: mergeParameters(itemParams, op.parameters ?? []),
      catchAllParams,
      requestBody: op.requestBody,
      responses: op.responses,
      requiresAuth,
    });
  }

  private indexAnyMethodRoute(
    path: string,
    itemParams: SpecParameter[],
    catchAllParams: string[],
    globalAuthed: boolean
  ): void {
    const tag = path.split("/").filter(Boolean)[1];
    const parameters = validParameters(itemParams);
    for (const method of HTTP_METHODS) {
      this.addOperation({
        operationId: this.syntheticOperationId(method, path),
        method,
        path,
        tags: tag ? [tag] : [],
        summary: `${method.toUpperCase()} ${path} (any-method route)`,
        parameters,
        catchAllParams,
        requiresAuth: globalAuthed,
      });
    }
  }

  private addOperation(info: OperationInfo): void {
    this.operations.push(info);
    this.byOperationId.set(info.operationId, info);
    this.byMethodPath.set(`${info.method.toUpperCase()} ${info.path}`, info);
  }

  private syntheticOperationId(method: string, path: string): string {
    const slug = path.replace(/[/{}]/g, "_").replace(/_+/g, "_");
    return `${method}${slug}`;
  }

  get info(): RawSpec["info"] {
    return this.spec.info;
  }

  get version(): string {
    return this.spec.info.version;
  }

  get baseUrl(): string | undefined {
    return this.spec.servers?.[0]?.url;
  }

  getByOperationId(operationId: string): OperationInfo | undefined {
    return this.byOperationId.get(operationId);
  }

  getByMethodPath(method: string, path: string): OperationInfo | undefined {
    return this.byMethodPath.get(`${method.toUpperCase()} ${path}`);
  }

  list(options: { tag?: string; search?: string } = {}): OperationInfo[] {
    const tag = options.tag?.toLowerCase();
    const search = options.search?.toLowerCase();
    return this.operations.filter((op) => {
      if (tag && !op.tags.some((t) => t.toLowerCase() === tag)) return false;
      if (search) {
        const haystack =
          `${op.operationId} ${op.method} ${op.path} ${op.summary ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  allTags(): string[] {
    const tags = new Set<string>();
    for (const op of this.operations) {
      for (const tag of op.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  get count(): number {
    return this.operations.length;
  }

  resolveRef(ref: string): unknown {
    if (!ref.startsWith(REF_ROOT)) return;
    const segments = ref
      .slice(REF_ROOT.length)
      .split("/")
      .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let node: unknown = this.spec;
    for (const segment of segments) {
      if (node && typeof node === "object" && segment in node) {
        node = (node as Record<string, unknown>)[segment];
      } else return;
    }
    return node;
  }

  dereference(value: unknown, depth = 0, seen = new Set<string>()): unknown {
    if (
      depth > MAX_DEREF_DEPTH ||
      value === null ||
      typeof value !== "object"
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.dereference(item, depth + 1, seen));
    }
    const obj = value as Record<string, unknown>;
    const ref = obj.$ref;
    if (typeof ref === "string") {
      if (seen.has(ref))
        return { $ref: ref, note: "circular reference omitted" };
      const resolved = this.resolveRef(ref);
      if (resolved === undefined)
        return { $ref: ref, note: "unresolved reference" };
      return this.dereference(resolved, depth + 1, new Set(seen).add(ref));
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      out[key] = this.dereference(child, depth + 1, seen);
    }
    return out;
  }
}

let singleton: SpecIndex | undefined;

export function loadSpecIndex(): SpecIndex {
  if (!singleton) {
    singleton = new SpecIndex(specJson as unknown as RawSpec);
  }
  return singleton;
}
