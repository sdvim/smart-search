import { describe, expect, it } from "vitest";
import { nearestPowerOfTen, suggest } from "../src/search/suggest.ts";
import { filterRecords } from "../src/search/filter.ts";
import { parseQuery } from "../src/search/parse.ts";
import { index } from "./fixtures.ts";

describe("contextual suggestions", () => {
  it.each([
    [137, 100],
    [398.28, 100],
    [650, 1000],
    [9, 10],
    [1, 1],
    [0, null],
    [-20, null],
  ])("rounds %s to %s", (balance, expected) => expect(nearestPowerOfTen(balance)).toBe(expected));
  it("completes the active word and preserves typed casing", () => {
    expect(suggest(index, "Sla", [0, 3])).toMatchObject({ text: "Slaking", suffix: "king" });
  });
  it("prioritizes a readable wallet-informed filter after the subject", () => {
    expect(suggest(index, "Slaking", [7, 7], { wallet_balance: 398.28 })).toMatchObject({
      text: "under $100",
    });
  });
  it("completes bare properties, explicit modifiers and numeric prefixes", () => {
    expect(suggest(index, "Slaking re", [8, 10])?.text).toBe("reverse holo");
    expect(suggest(index, "g:", [0, 2])?.token.field).toBe("grade");
    expect(suggest(index, "before 20", [0, 9])?.text).toMatch(/^before 20\d\d$/);
  });
  it("keeps a separator before a natural numeric modifier completion", () => {
    const completion = suggest(index, "over", [0, 4]);
    expect(completion?.text).toMatch(/^over \d/);
    expect(completion?.suffix).toMatch(/^ \d/);
  });
  it.each(["before ", "after "])("only suggests year values after %s", (query) => {
    const completion = suggest(index, query, [0, query.length]);
    expect(completion?.token.field).toBe("year");
    expect(completion?.text).toMatch(new RegExp(`^${query.trim()} \\d{4}$`));
  });
  it.each(["at least grade ", "at least year "])(
    "completes natural comparisons with explicit fields: %s",
    (query) => {
      const completion = suggest(index, query, [0, query.length]);
      expect(completion?.text.startsWith(query)).toBe(true);
    },
  );
  it("does not suggest an empty intersection or redundant next filter", () => {
    for (const query of ["Slaking", "Slaking under $100", "Slaking under $100 grade 9+"]) {
      const completion = suggest(index, query, [query.length, query.length], {
        wallet_balance: 398.28,
      });
      expect(completion).not.toBeNull();
      const previous = filterRecords(index, parseQuery(query, index.dictionary));
      const next = filterRecords(
        index,
        parseQuery(`${query} ${completion!.text}`, index.dictionary),
      );
      expect(next.length).toBeGreaterThan(0);
      expect(next.length).toBeLessThan(previous.length);
    }
  });
  it("returns no suggestion when the existing constraints have no matches", () => {
    expect(suggest(index, "grade 1 before 1900", [19, 19])).toBeNull();
  });
});
