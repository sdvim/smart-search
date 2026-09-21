import { describe, expect, it } from "vitest";
import { demoUser } from "../src/demo/collectibles.ts";
import { summarizePortfolio } from "../src/demo/portfolio.ts";
import {
  addPurchase,
  applyTransactions,
  canPurchase,
  canSell,
  ownershipOverrides,
  remainingBalance,
  sellValue,
  transactionBalance,
} from "../src/demo/purchase.ts";
import type { PortfolioTransaction } from "../src/demo/purchase.ts";
import { card } from "./fixtures.ts";

describe("local purchases", () => {
  it("charges listed prices in cents while valuing holdings at market value", () => {
    const first = card("first", { listed_value: 0.1, fair_market_value: 50 });
    const second = card("second", { listed_value: 0.2, fair_market_value: 70 });
    const purchases = addPurchase(addPurchase([], [], first, true), [], second, true);
    expect(remainingBalance(purchases)).toBe(397.98);
    expect(
      summarizePortfolio(
        purchases,
        purchases.map((item) => item.id),
      ),
    ).toMatchObject({
      item_count: 2,
      total_value: 120,
    });
  });

  it("rejects duplicate purchases and cards already in the initial portfolio", () => {
    const item = card("owned", { listed_value: 20 });
    const purchases = addPurchase([], [], item, true);
    expect(addPurchase(purchases, [], item, true)).toBe(purchases);
    const empty: typeof purchases = [];
    expect(addPurchase(empty, [item], item, true)).toBe(empty);
    expect(remainingBalance(purchases)).toBe(378.28);
  });

  it("checks the remaining balance for every queued purchase", () => {
    const first = card("first", { listed_value: 250 });
    const second = card("second", { listed_value: 200 });
    const purchases = addPurchase([], [], first, true);
    expect(addPurchase(purchases, [], second, true)).toBe(purchases);
    expect(remainingBalance(purchases)).toBe(148.28);
  });

  it("requires loaded ownership, an affordable listing, and a valid price", () => {
    const item = card("listed", { listed_value: 25 });
    expect(canPurchase(item, 25, false, true)).toBe(true);
    expect(canPurchase(item, 24.99, false, true)).toBe(false);
    expect(canPurchase(item, 25, true, true)).toBe(false);
    expect(canPurchase(item, 25, false, false)).toBe(false);
    expect(addPurchase([], [], item, false)).toEqual([]);
    for (const listed_value of [undefined, -1, NaN, Infinity])
      expect(canPurchase(card("invalid", { listed_value }), 100, false, true)).toBe(false);
    for (const balance of [-1, NaN, Infinity])
      expect(canPurchase(item, balance, false, true)).toBe(false);
  });

  it("allows zero-priced listings and spending the exact remaining balance", () => {
    const free = card("free", { listed_value: 0 });
    expect(canPurchase(free, 0, false, true)).toBe(true);
    const purchases = addPurchase([], [], free, true);
    expect(purchases).toEqual([free]);
    expect(remainingBalance(purchases)).toBe(demoUser.wallet_balance);
    const fullBalance = card("full-balance", { listed_value: demoUser.wallet_balance });
    expect(remainingBalance(addPurchase(purchases, [], fullBalance, true))).toBe(0);
  });

  it("values sales at a stable ten percent discount and updates holdings and cash", () => {
    const owned = card("owned", { listed_value: 20, fair_market_value: 100 });
    const purchased = card("purchased", { listed_value: 10, fair_market_value: 40 });
    const transactions: PortfolioTransaction[] = [
      { type: "sell", item: owned, amount: 90 },
      { type: "buy", item: purchased, amount: 10 },
    ];
    expect(sellValue(owned)).toBe(90);
    expect(
      sellValue(card("listed-only", { fair_market_value: Number.NaN, listed_value: 20 })),
    ).toBe(18);
    expect(canSell(owned, true, true)).toBe(true);
    expect(
      canSell(
        card("unknown", { fair_market_value: undefined, listed_value: undefined }),
        true,
        true,
      ),
    ).toBe(false);
    expect(transactionBalance(transactions)).toBe(478.28);
    expect(applyTransactions([owned], transactions)).toEqual([purchased]);
    expect(ownershipOverrides([owned], transactions)).toEqual({
      purchasedIds: ["purchased"],
      soldIds: ["owned"],
    });
  });
});
