import { describe, expect, it } from "vitest";
import { collectibleFields } from "../src/demo/collectibles.ts";
import { filterRecords } from "../src/search/filter.ts";
import { buildIndex } from "../src/search/index-data.ts";
import { parseQuery } from "../src/search/parse.ts";
import { rankRecords } from "../src/search/preferences.ts";
import type { SearchContext } from "../src/search/types.ts";
import { index } from "./fixtures.ts";

describe("personalized result ranking", () => {
  function ranked(query: string, context: SearchContext) {
    const parsed = parseQuery(query, index.dictionary);
    return rankRecords(index, filterRecords(index, parsed), context, parsed).map(
      (record) => record.id,
    );
  }

  it("bumps listed items without ownership data", () => {
    expect(ranked("", { wallet_balance: 398.28 })).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("boosts preferred subjects and grades without removing other matches", () => {
    expect(ranked("", { preferred_values: { subject: ["Michael Jordan", "Slaking ex"] } })).toEqual(
      ["e", "d", "a", "c", "b"],
    );
    expect(ranked("", { preferred_values: { grade: [10, 9] } })).toEqual(["c", "d", "a", "b", "e"]);
  });

  it("boosts listed prices or their FMV fallback inside the comfortable range", () => {
    expect(ranked("", { price_range: [90, 130] })).toEqual(["c", "b", "a", "d", "e"]);
    expect(ranked("", { price_range: [20, 40] })).toEqual(["d", "a", "c", "b", "e"]);
  });

  it("honors filters and ignores preferences for fields the user has already specified", () => {
    expect(
      ranked("Slaking", { preferred_values: { subject: ["Slaking ex", "Michael Jordan"] } }),
    ).toEqual(["a", "c", "d", "b"]);
    expect(ranked("grade 9+", { preferred_values: { grade: [10] } })).toEqual(["a", "c", "d", "b"]);
    expect(ranked("under $100", { price_range: [20, 40] })).toEqual(["a", "d"]);
  });

  it("preserves the requested numeric sort even when preferences favor a later result", () => {
    expect(
      ranked("2010-2000", { preferred_values: { grade: [10] }, price_range: [110, 130] }),
    ).toEqual(["b", "a", "c"]);
    expect(
      ranked("cheapest", {
        preferred_values: { subject: ["Michael Jordan"] },
        price_range: [900, 1100],
      }),
    ).toEqual(["d", "a", "b", "c", "e"]);
  });

  it("uses listing and ownership as a conservative tie-break", () => {
    const availabilityIndex = buildIndex(
      [
        { ...index.records[0], ownership: ["mine", "vaulted"] },
        { ...index.records[1], subject: "Pikachu", listed_value: 20 },
        { ...index.records[2], subject: "Alakazam", listed_value: undefined },
        { ...index.records[3], listed_value: undefined, ownership: ["mine", "vaulted"] },
      ],
      collectibleFields,
    );
    const available = (context: SearchContext) => {
      const parsed = parseQuery("", availabilityIndex.dictionary);
      return rankRecords(
        availabilityIndex,
        filterRecords(availabilityIndex, parsed),
        context,
        parsed,
      ).map((record) => record.id);
    };
    expect(available({})).toEqual(["b", "c", "a", "d"]);
    expect(available({ preferred_values: { subject: ["Slaking"] } })).toEqual(["a", "d", "b", "c"]);
  });
});
