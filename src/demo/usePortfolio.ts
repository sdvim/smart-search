import { useEffect, useState } from "react";
import { demoUser } from "./collectibles.ts";
import type { Collectible } from "./collectibles.ts";
import { summarizePortfolio } from "./portfolio.ts";
import type { PortfolioSnapshot } from "./portfolio.ts";
import {
  applyTransactions,
  canPurchase,
  canSell,
  ownershipOverrides,
  sellValue,
  transactionBalance,
} from "./purchase.ts";
import type { PortfolioTransaction } from "./purchase.ts";

export function usePortfolio() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>();
  const [transactions, setTransactions] = useState<readonly PortfolioTransaction[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/portfolio", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Portfolio is unavailable");
        return (await response.json()) as PortfolioSnapshot;
      })
      .then((summary) => {
        if (!controller.signal.aborted) setSnapshot(summary);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSnapshot(null);
      });
    return () => controller.abort();
  }, []);

  const baseItems = snapshot?.items ?? [];
  const items = applyTransactions(baseItems, transactions);
  const ownedIds = new Set(items.map((item) => item.id));
  const portfolio = snapshot ? summarizePortfolio(items, [...ownedIds]) : snapshot;
  const overrides = ownershipOverrides(baseItems, transactions);

  function buy(item: Collectible) {
    setTransactions((current) => {
      const currentItems = applyTransactions(baseItems, current);
      const balance = transactionBalance(current);
      return canPurchase(
        item,
        balance,
        currentItems.some(({ id }) => id === item.id),
        Boolean(snapshot),
      )
        ? [...current, { type: "buy", item, amount: item.listed_value! }]
        : current;
    });
  }

  function sell(item: Collectible) {
    setTransactions((current) => {
      const currentItems = applyTransactions(baseItems, current);
      const amount = sellValue(item);
      if (
        amount === undefined ||
        !canSell(
          item,
          currentItems.some(({ id }) => id === item.id),
          Boolean(snapshot),
        )
      )
        return current;
      return [...current, { type: "sell", item, amount }];
    });
  }

  return {
    portfolio,
    balance: transactionBalance(transactions),
    searchContext: { wallet_balance: demoUser.wallet_balance, ...snapshot?.preferences },
    purchasedIds: overrides.purchasedIds,
    soldIds: overrides.soldIds,
    owns: (item: Collectible) => ownedIds.has(item.id),
    buy,
    sell,
    ready: Boolean(snapshot),
  };
}
