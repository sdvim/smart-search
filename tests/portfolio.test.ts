import { describe, expect, it } from "vitest";
import { loadIndex, loadPortfolio } from "../server/api.ts";
import { summarizePortfolio } from "../src/demo/portfolio.ts";
import { card } from "./fixtures.ts";

describe("portfolio summary", () => {
  it("values only selected unique holdings in cents, preferring market value over listings", () => {
    const items = [
      card("a", { fair_market_value: 0.1, listed_value: 999 }),
      card("b", { fair_market_value: undefined, listed_value: 0.2 }),
      card("c", { fair_market_value: 0, listed_value: 20 }),
      card("d", { fair_market_value: undefined }),
      card("not-owned", { fair_market_value: 1000 }),
    ];
    expect(summarizePortfolio(items, ["a", "a", "b", "c", "d", "unknown"])).toMatchObject({
      item_count: 4,
      valued_item_count: 3,
      total_value: 0.3,
    });
  });

  it("recalculates compact preferences from frequencies and typical values, not outliers", () => {
    const items = [10, 12, 15, 18, 20, 22, 10000].map((price, i) =>
      card(String(i), {
        fair_market_value: price,
        subject: i < 5 ? "Slaking ex" : "Pikachu",
        grade: i < 5 ? 10 : 9,
      }),
    );
    expect(
      summarizePortfolio(
        items,
        items.map((item) => item.id),
      ).preferences,
    ).toEqual({
      preferred_values: { subject: ["Slaking ex", "Pikachu"], grade: [10, 9] },
      price_range: [10, 30],
    });
    expect(summarizePortfolio(items, ["5", "6"]).preferences.preferred_values).toEqual({
      subject: ["Pikachu"],
      grade: [9],
    });
  });

  it("does not invent preferences or values for an empty or unpriced portfolio", () => {
    expect(summarizePortfolio([], ["unknown"])).toEqual({
      item_count: 0,
      valued_item_count: 0,
      total_value: 0,
      preferences: {},
    });
    const summary = summarizePortfolio([card("a", { fair_market_value: undefined })], ["a"]);
    expect(summary.valued_item_count).toBe(0);
    expect(summary.preferences.price_range).toBeUndefined();
  });

  it("resolves the selected holdings to real cards with a compact recalculated profile", async () => {
    const [index, source] = await Promise.all([loadIndex(), loadPortfolio()]);
    expect(new Set(source.item_ids).size).toBe(source.item_ids.length);
    expect(source.item_ids).toHaveLength(3);
    expect(source.external_holdings?.map((holding) => holding.item_id)).toEqual(["psa-78682474"]);
    const holdings = source.item_ids.map((id) => index.records.find((item) => item.id === id));
    expect(holdings.every(Boolean)).toBe(true);
    const subjects = holdings.map((item) => item!.subject);
    expect(subjects.filter((subject) => subject === "Slaking")).toHaveLength(1);
    expect(subjects.filter((subject) => subject === "Alakazam")).toHaveLength(1);
    expect(subjects.filter((subject) => subject === "Pikachu")).toHaveLength(1);
    const summary = summarizePortfolio(index.records, source.item_ids);
    expect(summary.item_count).toBe(source.item_ids.length);
    expect(summary.valued_item_count).toBe(summary.item_count);
    expect(summary.total_value).toBeGreaterThan(0);
    expect(JSON.stringify(summary.preferences).length).toBeLessThan(200);
  });
});
