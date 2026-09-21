import { formatMoney } from "./collectibles.ts";
import type { Collectible } from "./collectibles.ts";
import { canPurchase, canSell, sellValue } from "./purchase.ts";

type Props = {
  item: Collectible;
  owned: boolean;
  balance: number;
  ready: boolean;
  onBuy?: () => void;
  onSell?: () => void;
};

export function BuyButton({ item, owned, balance, ready, onBuy, onSell }: Props) {
  const listed =
    typeof item.listed_value === "number" &&
    Number.isFinite(item.listed_value) &&
    item.listed_value >= 0;
  const estimated =
    typeof item.fair_market_value === "number" &&
    Number.isFinite(item.fair_market_value) &&
    item.fair_market_value >= 0;
  const ownedValue = estimated ? item.fair_market_value : listed ? item.listed_value : undefined;
  const sale = sellValue(item);
  const purchaseEnabled = canPurchase(item, balance, owned, ready) && Boolean(onBuy);
  const saleEnabled = canSell(item, owned, ready) && Boolean(onSell);
  const label = listed
    ? `Buy for ${formatMoney(item.listed_value!)}`
    : estimated
      ? `Est. ${formatMoney(item.fair_market_value!)}`
      : "Value unavailable";
  const reason = owned
    ? saleEnabled
      ? `Sell for ${formatMoney(sale!)}`
      : "Selling unavailable"
    : !listed
      ? "Not for sale"
      : !ready
        ? "Waiting for your balance"
        : !onBuy
          ? "Buying unavailable"
          : !purchaseEnabled
            ? "Insufficient balance"
            : undefined;
  return (
    <button
      type="button"
      className={`buy-button${owned ? " owned-button" : ""}${!listed && !owned ? " estimated-value" : ""}`}
      disabled={owned ? !saleEnabled : !purchaseEnabled}
      title={reason}
      onClick={(event) => {
        if (owned && event.detail > 1) return;
        (owned ? onSell : onBuy)?.();
      }}
    >
      {owned ? (
        <>
          <span className="owned-label">
            Owned{ownedValue === undefined ? "" : ` · ${formatMoney(ownedValue)}`}
          </span>
          <span className="sell-label">
            Sell for {sale === undefined ? "—" : formatMoney(sale)}
          </span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
