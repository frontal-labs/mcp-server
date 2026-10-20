import { describe, expect, it } from "vitest";
import { deepMerge, setNested } from "@/helpers/object.js";

describe("object helpers", () => {
  it("rejects unsafe nested path segments", () => {
    const target: Record<string, unknown> = {};

    expect(() => setNested(target, "__proto__.polluted", true)).toThrow(
      "Unsafe object path segment: __proto__"
    );
    expect(() =>
      setNested(target, "constructor.prototype.polluted", true)
    ).toThrow("Unsafe object path segment: constructor");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not traverse inherited intermediate properties", () => {
    const inherited = Object.create({ nested: { polluted: false } }) as Record<
      string,
      unknown
    >;

    setNested(inherited, "nested.value", true);

    expect(inherited.nested).toEqual({ value: true });
  });

  it("rejects unsafe keys during deep merge", () => {
    const source = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    const target: Record<string, unknown> = {};

    expect(() => deepMerge(target, source)).toThrow(
      "Unsafe object path segment: __proto__"
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
