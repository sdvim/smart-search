import { describe, expect, it } from "vitest";
import { nearestPowerOfTen, suggest } from "../src/search/suggest.ts";
import { filterRecords } from "../src/search/filter.ts";
import { parseQuery } from "../src/search/parse.ts";
import { buildIndex } from "../src/search/index-data.ts";
import { card, index } from "./fixtures.ts";

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
  it.each([
    ["slaking  ", "Slaking ex", "ex"],
    ["under  $100", "under $1000", "0"],
    ["  Sla", "Slaking", "king"],
  ])("aligns completion with the typed whitespace: %s", (query, text, suffix) => {
    const completion = suggest(index, query, [0, query.length]);
    expect(completion).toMatchObject({ text, suffix });
    expect(parseQuery(`${query}${completion!.suffix}`, index.dictionary).tokens).toEqual([
      expect.objectContaining({ field: completion!.token.field, values: completion!.token.values }),
    ]);
  });
  it("does not suggest a continuation through whitespace inside an unfinished word", () => {
    expect(suggest(index, "Sla ", [0, 4])).toBeNull();
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

  it.each([
    ["chea", "cheapest", "asc"],
    ["low to ", "low to high", "asc"],
    ["high to ", "high to low", "desc"],
    ["most exp", "most expensive", "desc"],
  ])("completes the configured sort phrase %s", (prefix, text, direction) => {
    const query = `Slaking under $100 ${prefix}`;
    expect(suggest(index, query, [query.length - prefix.length, query.length])).toMatchObject({
      text,
      token: { field: "price", operator: "sort", direction },
    });
  });
});

describe("personalized suggestions", () => {
  it("prefers the strongest available subject without overriding the typed prefix", () => {
    const context = {
      preferred_values: { subject: ["Missing subject", "Michael Jordan", "Slaking"] },
    };
    expect(suggest(index, "", [0, 0], context)?.text).toBe("Michael Jordan");
    expect(suggest(index, "Sla", [0, 3], context)?.text).toBe("Slaking");
    const query = "Slaking under $100";
    expect(suggest(index, query, [query.length, query.length], context)?.token.field).not.toBe(
      "subject",
    );
  });

  it("uses favorite grades for the next filter and falls back when they are unavailable", () => {
    const grades = buildIndex(
      [card("low", { grade: 5 }), card("mint", { grade: 9 }), card("gem", { grade: 10 })],
      index.dictionary.fields,
    );
    const query = "Slaking under $100";
    const range: [number, number] = [query.length, query.length];
    expect(suggest(grades, query, range)?.text).toBe("grade 9+");
    expect(suggest(grades, query, range, { preferred_values: { grade: [10, 9] } })?.text).toBe(
      "grade 10+",
    );
    expect(suggest(grades, query, range, { preferred_values: { grade: [8] } })?.text).toBe(
      "grade 9+",
    );
  });

  it("suggests a comfortable price range while keeping wallet fallback and explicit prices", () => {
    const query = "Slaking";
    const range: [number, number] = [query.length, query.length];
    const context = { wallet_balance: 398.28, price_range: [90, 130] as [number, number] };
    const completion = suggest(index, query, range, context);
    expect(completion?.text).toBe("between $90 and $130");
    expect(
      filterRecords(index, parseQuery(`${query} ${completion!.text}`, index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["b", "c"]);
    expect(suggest(index, query, range, { ...context, price_range: [5000, 10000] })?.text).toBe(
      "under $100",
    );
    const priced = "Slaking under $100";
    expect(suggest(index, priced, [priced.length, priced.length], context)?.token.field).not.toBe(
      "price",
    );
    expect(suggest(index, "under $1", [0, 8], context)?.text.startsWith("under $1")).toBe(true);
  });
});
