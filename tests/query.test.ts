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
    ["under  $100", "price", "lt", [100]],
    ["at least  grade 5", "grade", "gte", [5]],
    ["at\u00a0least\u00a0year 2010", "year", "gte", [2010]],
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
    ["since 2010", "year", "gte", [2010]],
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
    ["~$100", "price", "range", [90, 110]],
    ["about 9", "grade", "range", [8, 10]],
    ["around 9", "grade", "range", [8, 10]],
    ["about 2000", "year", "range", [1999, 2001]],
    ["around 2000", "year", "range", [1999, 2001]],
    ["around year 2000", "year", "range", [1999, 2001]],
    ["~2000", "year", "range", [1999, 2001]],
    ["around grade 9", "grade", "range", [8, 10]],
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

  it("formats currency chips with grouping while preserving entered cents", () => {
    const whole = parseQuery("under $10000", index.dictionary).tokens[0];
    const cents = parseQuery("under $10000.00", index.dictionary).tokens[0];
    const range = parseQuery("between $10000.00 and $25000", index.dictionary).tokens[0];
    expect(whole).toMatchObject({ label: "under $10,000", compactLabel: "<$10,000" });
    expect(cents).toMatchObject({ label: "under $10,000.00", compactLabel: "<$10,000.00" });
    expect(range).toMatchObject({
      label: "from $10,000.00 to $25,000",
      compactLabel: "$10,000.00–$25,000",
    });
    expect(parseQuery("6112069161", index.dictionary).tokens[0]).toMatchObject({
      field: "grader_cert_id",
      label: "#6112069161",
      compactLabel: "#6112069161",
    });
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

  it("includes the named year for since but excludes it for after", () => {
    expect(
      filterRecords(index, parseQuery("since 2010", index.dictionary)).map((record) => record.id),
    ).toEqual(["b", "d"]);
    expect(
      filterRecords(index, parseQuery("after 2010", index.dictionary)).map((record) => record.id),
    ).toEqual(["d"]);
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
  it("preserves adjacent categorical clauses separated by a comma", () => {
    const parsed = parseQuery("Slaking,CGC", index.dictionary);
    expect(parsed.tokens.map((token) => token.text)).toEqual(["Slaking", "CGC"]);
    expect(filterRecords(index, parsed).map((record) => record.id)).toEqual(["d"]);
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
  it.each(["not about", "-under $"])("retains incomplete negated expressions: %s", (query) => {
    const parsed = parseQuery(query, index.dictionary);
    expect(parsed.tokens).toHaveLength(0);
    expect(parsed.draft).toBe(query);
    expect(parsed.pending).toBe(true);
  });
  it("does not eat malformed expressions or permit identifier ranges", () => {
    for (const query of [
      "#006-#012",
      "cert:6018503138-89733218",
      "year:banana",
      "before banana",
      "over holo",
      "over cert:89733218",
    ]) {
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
  it("keeps family subjects editable through Space until a new query starts", () => {
    for (const draft of ["Slaking", "Slaking ", "Slaking e", "Slaking ex", "Slaking ex "]) {
      expect(updateDraft(emptySearch, draft, index.dictionary, "space")).toMatchObject({
        tokens: [],
        draft,
      });
    }
    expect(splitDraft("Slaking ex before", index.dictionary)).toMatchObject({
      tokens: [{ field: "subject", values: ["Slaking ex"] }],
      draft: "before",
    });
    expect(updateDraft(emptySearch, "under $100", index.dictionary, "space").tokens).toEqual([
      expect.objectContaining({ field: "price", values: [100] }),
    ]);
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

describe("sorting and ownership keywords", () => {
  it.each([
    ["cheapest", "asc", ["d", "a", "b", "c", "e"]],
    ["low to high", "asc", ["d", "a", "b", "c", "e"]],
    ["LOW  to\u00a0HIGH", "asc", ["d", "a", "b", "c", "e"]],
    ["most expensive", "desc", ["e", "c", "b", "a", "d"]],
    ["high to low", "desc", ["e", "c", "b", "a", "d"]],
  ])("commits %s as a sort chip without filtering results", (query, direction, expected) => {
    const value = updateDraft(emptySearch, String(query), index.dictionary, true);
    expect(value.draft).toBe("");
    expect(value.tokens).toEqual([
      expect.objectContaining({ field: "price", operator: "sort", direction, values: [] }),
    ]);
    expect(
      filterRecords(index, parseQuery(String(query), index.dictionary)).map((record) => record.id),
    ).toEqual(expected);
  });

  it("combines sort keywords with bounds and uses the final order for the same field", () => {
    expect(
      filterRecords(index, parseQuery("Slaking under $100 cheapest", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["d", "a"]);
    expect(
      filterRecords(index, parseQuery("Slaking $50-$150 most expensive", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["c", "b", "a"]);
    expect(
      filterRecords(index, parseQuery("cheapest most expensive", index.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["e", "c", "b", "a", "d"]);
  });

  it("sorts unknown prices last in either direction and preserves stable ties", () => {
    const prices = buildIndex(
      [
        card("missing-z", { fair_market_value: undefined }),
        card("listed", { listed_value: 10, fair_market_value: 100 }),
        card("fallback", { fair_market_value: 20 }),
        card("free", { listed_value: 0 }),
        card("tie", { listed_value: 10 }),
        card("missing-a", { fair_market_value: undefined }),
      ],
      index.dictionary.fields,
    );
    expect(
      filterRecords(prices, parseQuery("cheapest", prices.dictionary)).map((record) => record.id),
    ).toEqual(["free", "listed", "tie", "fallback", "missing-a", "missing-z"]);
    expect(
      filterRecords(prices, parseQuery("most expensive", prices.dictionary)).map(
        (record) => record.id,
      ),
    ).toEqual(["fallback", "listed", "tie", "free", "missing-a", "missing-z"]);
  });

  it("keeps incomplete sort phrases pending without consuming similar ordinary words", () => {
    expect(parseQuery("low to ", index.dictionary)).toMatchObject({ tokens: [], pending: true });
    expect(parseQuery("cheapestish", index.dictionary)).toMatchObject({
      tokens: [],
      draft: "cheapestish",
      pending: false,
    });
  });

  it.each(["mine", "vaulted"])("filters %s through the configured ownership field", (keyword) => {
    const owned = buildIndex(
      [
        card("owned", { ownership: ["mine", "vaulted"], listed_value: 60 }),
        card("expensive-owned", { ownership: ["mine", "vaulted"], listed_value: 120 }),
        card("unowned", { ownership: [], listed_value: 25 }),
      ],
      index.dictionary.fields,
    );
    const query = `${keyword} under $100`;
    expect(parseQuery(query, owned.dictionary).tokens[0]).toMatchObject({
      field: "ownership",
      values: [keyword],
    });
    expect(
      filterRecords(owned, parseQuery(query, owned.dictionary)).map((record) => record.id),
    ).toEqual(["owned"]);
  });

  it.each(["-mine", "not mine"])("negates ownership filters: %s", (query) => {
    const scoped = buildIndex(
      [
        card("owned", { ownership: ["mine", "vaulted"], listed_value: 60 }),
        card("unowned", { ownership: [], listed_value: 25 }),
      ],
      index.dictionary.fields,
    );
    const parsed = parseQuery(query, scoped.dictionary);
    expect(parsed.tokens[0]).toMatchObject({
      field: "ownership",
      values: ["mine"],
      negated: true,
    });
    expect(filterRecords(scoped, parsed).map((record) => record.id)).toEqual(["unowned"]);
  });

  it.each(["listed", "for sale"])("filters listed items with %s", (query) => {
    const listed = buildIndex(
      [
        card("listed", { listed_value: 60 }),
        card("free", { listed_value: 0 }),
        card("unlisted", { listed_value: undefined }),
      ],
      index.dictionary.fields,
    );
    const parsed = parseQuery(query, listed.dictionary);
    expect(parsed.tokens[0]).toMatchObject({ field: "listing" });
    expect(filterRecords(listed, parsed).map((record) => record.id)).toEqual(["free", "listed"]);
  });

  it("negates categorical and numeric filters without changing their positive grammar", () => {
    const scoped = buildIndex(
      [
        card("slaking", { language: "en", grade: 9, listed_value: 60 }),
        card("pikachu", {
          subject: "Pikachu",
          language: "en",
          grade: 10,
          listed_value: 100,
        }),
        card("japanese", {
          subject: "Alakazam",
          language: "jp",
          grade: 8,
          listed_value: 110,
        }),
      ],
      index.dictionary.fields,
    );
    for (const [query, expected] of [
      ["not pikachu", ["japanese", "slaking"]],
      ["not jp", ["pikachu", "slaking"]],
      ["not above 100", ["pikachu", "slaking"]],
      ["not 10", ["japanese", "slaking"]],
      ["not pikachu not alakazam", ["slaking"]],
    ] as const) {
      const parsed = parseQuery(query, scoped.dictionary);
      expect(parsed.draft).toBe("");
      expect(parsed.tokens[0].negated).toBe(true);
      expect(filterRecords(scoped, parsed).map((record) => record.id)).toEqual(expected);
    }
  });

  it.each(["japanese", "jp", "language:japanese", "language:jp"])(
    "accepts Japanese language terms: %s",
    (query) => {
      const scoped = buildIndex(
        [card("english", { language: "en" }), card("japanese", { language: "jp" })],
        index.dictionary.fields,
      );
      const parsed = parseQuery(query, scoped.dictionary);
      expect(parsed).toMatchObject({ draft: "", tokens: [{ field: "language", operator: "eq" }] });
      expect(filterRecords(scoped, parsed).map((record) => record.id)).toEqual(["japanese"]);
    },
  );

  it.each(["english", "en", "language:english", "language:en"])(
    "accepts English language terms: %s",
    (query) => {
      const scoped = buildIndex(
        [card("english", { language: "en" }), card("japanese", { language: "jp" })],
        index.dictionary.fields,
      );
      const parsed = parseQuery(query, scoped.dictionary);
      expect(parsed).toMatchObject({ draft: "", tokens: [{ field: "language", operator: "eq" }] });
      expect(filterRecords(scoped, parsed).map((record) => record.id)).toEqual(["english"]);
    },
  );

  it("interprets about as an inclusive ten percent range", () => {
    const parsed = parseQuery("about $100", index.dictionary);
    expect(parsed).toMatchObject({ draft: "", tokens: [{ field: "price", operator: "range" }] });
    expect(parsed.tokens[0].values).toEqual([90, 110]);
    expect(filterRecords(index, parsed).map((record) => record.id)).toEqual(["b"]);
    expect(parseQuery("about $100.00", index.dictionary).tokens[0]).toMatchObject({
      label: "about $100.00",
      compactLabel: "~$100.00",
    });
    expect(parseQuery("~$100.00", index.dictionary).tokens[0]).toMatchObject({
      label: "about $100.00",
      compactLabel: "~$100.00",
      values: [90, 110],
    });
    expect(parseQuery("around $100", index.dictionary).tokens[0]).toMatchObject({
      label: "about $100",
      compactLabel: "~$100",
      values: [90, 110],
    });
  });
});
