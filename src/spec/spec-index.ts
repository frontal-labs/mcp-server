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
  /** Templated path, e.g. `/v1/ontology/objects/{objectId}`. */
  path: string;
  tags: string[];
  summary?: string;
  description?: string;
  parameters: SpecParameter[];
  /** Raw requestBody object from the spec (schemas may contain `$ref`). */
  requestBody?: unknown;
  /** Raw responses object from the spec. */
  responses?: unknown;
  /** Whether this operation requires authentication (per-op overrides global). */
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

interface RawSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, Record<string, RawOperation>>;
  components?: Record<string, unknown>;
  security?: unknown[];
}

const REF_ROOT = "#/";
const MAX_DEREF_DEPTH = 12;

/** Indexed, queryable view over the vendored public OpenAPI spec. */
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
      let hasOperation = false;
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (op) {
          hasOperation = true;
          this.indexOperation(path, method, op, globalAuthed);
        }
      }

      // Catch-all engine routes are vendored as metadata-only path items
      // (`x-any-method-route`) with no per-method operations. Materialize a
      // synthetic operation per HTTP method so meta-tool users can discover
      // them (frontal_list_endpoints / frontal_describe_endpoint) and invoke
      // them (frontal_call_endpoint by operationId or method+path).
      const anyMethod =
        (item as Record<string, unknown>)["x-any-method-route"] === true;
      if (!hasOperation && anyMethod) {
        this.indexAnyMethodRoute(path, globalAuthed);
      }
    }
  }

  private indexOperation(
    path: string,
    method: HttpMethod,
    op: RawOperation,
    globalAuthed: boolean
  ): void {
    const operationId =
      op.operationId ?? this.syntheticOperationId(method, path);
    // Per-op `security: []` disables auth; a non-empty array or absence
    // (falling back to global) means auth is required.
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
      parameters: (op.parameters ?? []).filter(
        (p): p is SpecParameter => Boolean(p) && typeof p.name === "string"
      ),
      requestBody: op.requestBody,
      responses: op.responses,
      requiresAuth,
    });
  }

  private indexAnyMethodRoute(path: string, globalAuthed: boolean): void {
    const tag = path.split("/").filter(Boolean)[1];
    for (const method of HTTP_METHODS) {
      this.addOperation({
        operationId: this.syntheticOperationId(method, path),
        method,
        path,
        tags: tag ? [tag] : [],
        summary: `${method.toUpperCase()} ${path} (any-method route)`,
        parameters: [],
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

  /** All operations, optionally filtered by tag and/or free-text search. */
  list(options: { tag?: string; search?: string } = {}): OperationInfo[] {
    const tag = options.tag?.toLowerCase();
    const search = options.search?.toLowerCase();
    return this.operations.filter((op) => {
      if (tag && !op.tags.some((t) => t.toLowerCase() === tag)) {
        return false;
      }
      if (search) {
        const haystack =
          `${op.operationId} ${op.method} ${op.path} ${op.summary ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  /** Sorted, de-duplicated list of all tags in the spec. */
  allTags(): string[] {
    const tags = new Set<string>();
    for (const op of this.operations) {
      for (const tag of op.tags) {
        tags.add(tag);
      }
    }
    return [...tags].sort();
  }

  get count(): number {
    return this.operations.length;
  }

  /** Resolve a single JSON pointer `$ref` (e.g. `#/components/schemas/Foo`). */
  resolveRef(ref: string): unknown {
    if (!ref.startsWith(REF_ROOT)) {
      return;
    }
    const segments = ref
      .slice(REF_ROOT.length)
      .split("/")
      .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let node: unknown = this.spec;
    for (const segment of segments) {
      if (node && typeof node === "object" && segment in node) {
        node = (node as Record<string, unknown>)[segment];
      } else {
        return;
      }
    }
    return node;
  }

  /**
   * Recursively inline `$ref`s so a schema can be shown to a caller.
   * Guards against cycles and unbounded depth.
   */
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
      if (seen.has(ref)) {
        return { $ref: ref, note: "circular reference omitted" };
      }
      const resolved = this.resolveRef(ref);
      if (resolved === undefined) {
        return { $ref: ref, note: "unresolved reference" };
      }
      const nextSeen = new Set(seen).add(ref);
      return this.dereference(resolved, depth + 1, nextSeen);
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      out[key] = this.dereference(child, depth + 1, seen);
    }
    return out;
  }
}

let singleton: SpecIndex | undefined;

/** Load (and memoize) the indexed view of the vendored public API spec. */
export function loadSpecIndex(): SpecIndex {
  if (!singleton) {
    singleton = new SpecIndex(specJson as unknown as RawSpec);
  }
  return singleton;
}
