import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple csv rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("supports quoted commas and escaped quotes", () => {
    const rows = parseCsv('name,note\n"2330","a, b, c"\n"0050","he said ""ok"""');
    expect(rows[1]).toEqual(["2330", "a, b, c"]);
    expect(rows[2]).toEqual(["0050", 'he said "ok"']);
  });
});
