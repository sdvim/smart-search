import { describe, expect, it, vi } from "vitest";
import { parseQuery, splitDraft } from "../src/search/parse.ts";
import { filterRecords } from "../src/search/filter.ts";
import { buildIndex } from "../src/search/index-data.ts";
import { updateDraft } from "../src/search/edit.ts";
import { activeRange, emptySearch, serializeQuery } from "../src/search/types.ts";
import { card, index } from "./fixtures.ts";

describe("numeric grammar", () => {
  it.each([
    ["2000-2010", "year", "range", [2000, 2010]],
    ["from 2000 to 2010", "year", "range", [2000, 2010]],
    ["between 2000 and 2010", "year", "range", [2000, 2010]],
    ["year:2000-2010", "year", "range", [2000, 2010]],
    ["before 2010", "year", "lt", [2010]],
    ["<2010", "year", "lt", [2010]],
    ["after 2010", "year", "gt", [2010]],
    ["at least grade 5", "grade", "gte", [5]],
    ["at least year 2010", "year", "gte", [2010]],
    ["under $100.00", "price", "lt", [100]],
    ["<$100", "price", "lt", [100]],
    ["between $100 and $1000", "price", "range", [100, 1000]],
    ["$100-$1000", "price", "range", [100, 1000]],
    ["at least $100.00", "price", "gte", [100]],
    [">=$100", "price", "gte", [100]],
    ["more than $100.00", "price", "gt", [100]],
    [">$100", "price", "gt", [100]],
    ["less than $100", "price", "lt", [100]],
    ["over $100", "price", "gt", [100]],
    ["above $100", "price", "gt", [100]],
    ["greater than $100", "price", "gt", [100]],
    ["below $100", "price", "lt", [100]],
    ["fewer than $100", "price", "lt", [100]],
    ["no less than $100", "price", "gte", [100]],
    ["no more than $100", "price", "lte", [100]],
    ["up to $100", "price", "lte", [100]],
    ["earlier than 2010", "year", "lt", [2010]],
    ["later than 2010", "year", "gt", [2010]],
    ["prior to 2010", "year", "lt", [2010]],
    ["since 2010", "year", "gt", [2010]],
    ["year:2000", "year", "eq", [2000]],
    ["y:2000", "year", "eq", [2000]],
    ["y:2000+", "year", "gte", [2000]],
    ["y:2000<", "year", "gt", [2000]],
    ["y:>2000", "year", "gt", [2000]],
    ["y:>=2000", "year", "gte", [2000]],
    ["y:2000>", "year", "lt", [2000]],
    ["price:100", "price", "eq", [100]],
    ["$100", "price", "eq", [100]],
    ["$100<", "price", "gt", [100]],
    ["$100+", "price", "gte", [100]],
    ["9", "grade", "eq", [9]],
    ["9.5", "grade", "eq", [9.5]],
    ["14.50", "price", "eq", [14.5]],
    ["$9.5", "price", "eq", [9.5]],
    ["grade 9+", "grade", "gte", [9]],
    ["g:8.5-10", "grade", "range", [8.5, 10]],
    ["$1,000", "price", "eq", [1000]],
  ])("%s", (input, field, operator, values) => {
    const parsed = parseQuery(String(input), index.dictionary);
    expect(parsed.draft).toBe("");
    expect(parsed.tokens).toHaveLength(1);
    expect(parsed.tokens[0]).toMatchObject({ field, operator, values });
  });

  it.each(["2010-2000", "from 2010 to 2000", "between 2010 and 2000"])(
    "sorts backwards: %s",
    (query) => {
      expect(
        filterRecords(index, parseQuery(query, index.dictionary)).map((record) => record.year),
      ).toEqual([2010, 2005, 2000]);
    },
  );

  it("uses inclusive endpoints and exclusive comparisons", () => {
    expect(
      filterRecords(index, parseQuery("$60-$100", index.dictionary)).map((record) => record.id),
    ).toEqual(["a", "b"]);
    expect(
      filterRecords(index, parseQuery("under $100", index.dictionary)).map((record) => record.id),
    ).toEqual(["a", "d"]);
    expect(
      filterRecords(index, parseQuery("at least $100", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["b", "c", "e"]);
  });

  it.each([
    "before 680",
    "after 7.9",
    "before $100",
    "after $100",
    "earlier than 680",
    "later than 7.9",
    "prior to $100",
    "since $100",
  ])("only allows before/after for years: %s", (query) => {
    const parsed = parseQuery(query, index.dictionary);
    expect(parsed.tokens).toHaveLength(0);
    expect(parsed.draft).toBe(query);
  });

  it("compares currency in integer cents", () => {
    const special = buildIndex(
      [card("fraction", { listed_value: 19.999 })],
      index.dictionary.fields,
    );
    expect(filterRecords(special, parseQuery("$20", special.dictionary))).toHaveLength(1);
    expect(filterRecords(special, parseQuery("under $20", special.dictionary))).toHaveLength(0);
  });

  it("prefers the listing over FMV, preserves zero, and excludes unknown prices", () => {
    const special = buildIndex(
      [
        card("listed", { listed_value: 120, fair_market_value: 30 }),
        card("free", { listed_value: 0 }),
        card("unknown", { fair_market_value: undefined }),
      ],
      index.dictionary.fields,
    );
    expect(
      filterRecords(special, parseQuery("under $100", special.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["free"]);
  });
});

describe("identifiers, context and drafts", () => {
  it.each(["#006 and #12 and #292", "6, 12, 292", "6,12,292"])(
    "matches identifier alternatives: %s",
    (query) => {
      expect(
        filterRecords(index, parseQuery(query, index.dictionary)).map((record) => record.id),
      ).toEqual(["a", "b", "c"]);
    },
  );
  it.each(["#6018503138 and 89733218", "6018503138, 89733218"])(
    "matches certificate alternatives: %s",
    (query) => {
      expect(
        filterRecords(index, parseQuery(query, index.dictionary)).map((record) => record.id),
      ).toEqual(["a", "b"]);
    },
  );
  it("preserves leading zeros in certificate IDs and matches set numerators", () => {
    expect(
      filterRecords(index, parseQuery("cert:0001234567", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["c"]);
    expect(
      filterRecords(index, parseQuery("#227", index.dictionary)).map((record) => record.id),
    ).toEqual(["d"]);
  });
  it("combines fields and keeps property matches exact", () => {
    expect(
      filterRecords(
        index,
        parseQuery("Slaking under $100 grade 9+ before 2010 reverse holo", index.dictionary),
      ).map((record) => record.id),
    ).toEqual(["a"]);
    expect(
      filterRecords(index, parseQuery("is holo and is first edition", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["b"]);
    expect(filterRecords(index, parseQuery("in Deoxys", index.dictionary))).toHaveLength(3);
    expect(filterRecords(index, parseQuery("Slaking", index.dictionary))).toHaveLength(4);
    expect(filterRecords(index, parseQuery("Seaking", index.dictionary))).toHaveLength(0);
    expect(
      filterRecords(index, parseQuery("basketball Michael Jordan", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["e"]);
  });
  it.each(["g:", "grade:", "under $", "between $100 and", "from 2000 to", "year:2000-"])(
    "retains incomplete expressions: %s",
    (query) => {
      const parsed = parseQuery(query, index.dictionary);
      expect(parsed.tokens).toHaveLength(0);
      expect(parsed.draft).toBe(query);
      expect(parsed.pending).toBe(true);
    },
  );
  it("does not eat malformed expressions or permit identifier ranges", () => {
    for (const query of ["#006-#012", "cert:6018503138-89733218", "year:banana", "before banana"]) {
      expect(parseQuery(query, index.dictionary).draft).toBe(query);
      expect(filterRecords(index, parseQuery(query, index.dictionary))).toHaveLength(0);
    }
  });
  it("waits for a multiword value or next clause before committing", () => {
    expect(splitDraft("Slaking e", index.dictionary)).toEqual({ tokens: [], draft: "Slaking e" });
    expect(splitDraft("Slaking something-unexpected", index.dictionary)).toEqual({
      tokens: [],
      draft: "Slaking something-unexpected",
    });
    expect(splitDraft("Slaking ex", index.dictionary).tokens).toHaveLength(0);
    expect(splitDraft("Slaking under $100", index.dictionary)).toMatchObject({
      tokens: [{ field: "subject" }],
      draft: "under $100",
    });
    expect(splitDraft("between $100 and", index.dictionary).tokens).toHaveLength(0);
  });
  it("edits in place without changing the surrounding query or range order", () => {
    const original = updateDraft(emptySearch, "2010-2000 grade 9+", index.dictionary, true);
    const editing = { ...original, editingId: original.tokens[0].id, draft: "2020-2005" };
    expect(activeRange(editing)).toEqual([0, 9]);
    const changed = updateDraft(editing, editing.draft, index.dictionary, true);
    expect(serializeQuery(changed)).toBe("2020-2005 grade 9+");
    expect(activeRange(changed)).toEqual([18, 18]);
  });
  it("assigns token ids without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    try {
      const value = updateDraft(emptySearch, "Slaking", index.dictionary, true);
      expect(value.tokens[0].id).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
