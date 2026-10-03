import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as (input: string) => string[];

describe("braces depth guard", () => {
  it("still expands a normal pattern", () => {
    expect(braces("a{b,c}d")).toEqual(["a(b|c)d"]);
  });

  it("rejects patterns nested past 100 levels", () => {
    expect(() => braces("{".repeat(101) + "a,b" + "}".repeat(101))).toThrow(
      /exceeds max depth/,
    );
  });
});
