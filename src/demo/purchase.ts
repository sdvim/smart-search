import { demoUser } from "./collectibles.ts";
import type { Collectible } from "./collectibles.ts";

export type PortfolioTransaction = {
  type: "buy" | "sell";
  item: Collectible;
  amount: number;
};

export function remainingBalance(purchases: readonly Collectible[]) {
  const spent = purchases.reduce((total, item) => total + Math.round(item.listed_value! * 100), 0);
  return (Math.round(demoUser.wallet_balance * 100) - spent) / 100;
}

function marketValue(item: Collectible) {
  const value = [item.fair_market_value, item.listed_value].find(
    (candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0,
  );
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function sellValue(item: Collectible) {
  const value = marketValue(item);
  return value === undefined ? undefined : Math.round(value * 0.9 * 100) / 100;
}

export function transactionBalance(transactions: readonly PortfolioTransaction[]) {
  const cents = transactions.reduce(
    (total, transaction) =>
      total + (transaction.type === "buy" ? -1 : 1) * Math.round(transaction.amount * 100),
    Math.round(demoUser.wallet_balance * 100),
  );
  return cents / 100;
}

export function applyTransactions(
  holdings: readonly Collectible[],
  transactions: readonly PortfolioTransaction[],
) {
  const current = new Map(holdings.map((item) => [item.id, item]));
  for (const transaction of transactions) {
    if (transaction.type === "buy") current.set(transaction.item.id, transaction.item);
    else current.delete(transaction.item.id);
  }
  return [...current.values()];
}

export function ownershipOverrides(
  holdings: readonly Collectible[],
  transactions: readonly PortfolioTransaction[],
) {
  const baseIds = new Set(holdings.map((item) => item.id));
  const ownedIds = new Set(applyTransactions(holdings, transactions).map((item) => item.id));
  return {
    purchasedIds: [...ownedIds].filter((id) => !baseIds.has(id)),
    soldIds: [...baseIds].filter((id) => !ownedIds.has(id)),
  };
}

export function canPurchase(item: Collectible, balance: number, owned: boolean, ready: boolean) {
  return (
    ready &&
    !owned &&
    Number.isFinite(balance) &&
    balance >= 0 &&
    item.listed_value !== undefined &&
    Number.isFinite(item.listed_value) &&
    item.listed_value >= 0 &&
    Math.round(item.listed_value * 100) <= Math.round(balance * 100)
  );
}

export function canSell(item: Collectible, owned: boolean, ready: boolean) {
  return ready && owned && sellValue(item) !== undefined;
}

export function addPurchase(
  purchases: readonly Collectible[],
  holdings: readonly Collectible[],
  item: Collectible,
  ready: boolean,
) {
  const owned =
    holdings.some((holding) => holding.id === item.id) ||
    purchases.some((purchase) => purchase.id === item.id);
  return canPurchase(item, remainingBalance(purchases), owned, ready)
    ? [...purchases, item]
    : purchases;
}
