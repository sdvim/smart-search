import type { SearchContext } from "../search/types.ts";
import type { Collectible } from "./collectibles.ts";

export type PortfolioSource = {
  source_url: string;
  captured_at: string;
  public_item_count: number;
  excluded_ungraded_count: number;
  item_ids: string[];
  external_holdings?: {
    item_id: string;
    platform: string;
    ownership_source: string;
    verification_url: string;
  }[];
};

export type PortfolioSummary = {
  item_count: number;
  valued_item_count: number;
  total_value: number;
  preferences: Pick<SearchContext, "preferred_values" | "price_range">;
};

export type PortfolioSnapshot = PortfolioSummary & { items: Collectible[] };

function topValues<T extends string | number>(values: T[], limit: number): T[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value]) => value);
}

export function summarizePortfolio(
  items: readonly Collectible[],
  itemIds: readonly string[],
): PortfolioSummary {
  const owned = new Set(itemIds);
  const holdings = items.filter((item) => owned.has(item.id));
  const values = holdings
    .map((item) => item.fair_market_value ?? item.listed_value)
    .filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
    .map((value) => Math.round(value * 100))
    .sort((a, b) => a - b);
  const preferences: PortfolioSummary["preferences"] = {};
  if (holdings.length)
    preferences.preferred_values = {
      subject: topValues(
        holdings.map((item) => item.subject),
        3,
      ),
      grade: topValues(
        holdings.map((item) => item.grade),
        2,
      ),
    };
  if (values.length) {
    const lower = values[Math.floor((values.length - 1) * 0.25)] / 100;
    const upper = values[Math.ceil((values.length - 1) * 0.75)] / 100;
    preferences.price_range = [Math.floor(lower / 10) * 10, Math.ceil(upper / 10) * 10];
  }
  return {
    item_count: holdings.length,
    valued_item_count: values.length,
    total_value: values.reduce((sum, value) => sum + value, 0) / 100,
    preferences,
  };
}
