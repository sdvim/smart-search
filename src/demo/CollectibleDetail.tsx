import { addTransitionType, startTransition, useLayoutEffect, useRef, ViewTransition } from "react";
import { X } from "lucide-react";
import { BuyButton } from "./BuyButton.tsx";
import { CardImage } from "./CollectibleCard.tsx";
import { formatMoney } from "./collectibles.ts";
import type { Collectible } from "./collectibles.ts";
import "./detail.css";

type Props = {
  items: Collectible[];
  total: number;
  selectedId: string;
  direction: "next" | "previous";
  onNavigate: (direction: "next" | "previous") => void;
  onClose: () => void;
  onBuy: (item: Collectible) => void;
  onSell?: (item: Collectible) => void;
  owns: (item: Collectible) => boolean;
  balance: number;
  ready: boolean;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  onLoadMore?: () => void;
};

export function CollectibleDetail({
  items,
  total,
  selectedId,
  direction,
  onNavigate,
  onClose,
  onBuy,
  onSell,
  owns,
  balance,
  ready,
  loadingMore = false,
  loadMoreError = false,
  onLoadMore,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissTouch = useRef<{ x: number; y: number } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const position = items.findIndex((item) => item.id === selectedId);
  const item = items[position];
  const hasItem = Boolean(item);
  const previous = items[position - 1];
  const next = items[position + 1];

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [hasItem]);

  function navigate(direction: "next" | "previous") {
    startTransition(() => {
      addTransitionType("detail-navigation");
      onNavigate(direction);
    });
  }

  if (!item) return null;
  const metadata = [
    ["Set", item.set_name],
    ["Year", item.year],
    ["Card number", item.set_number ? `#${item.set_number}` : ""],
    [
      "Language",
      item.language === "en" ? "English" : item.language === "jp" ? "Japanese" : item.language,
    ],
    ["Grade", `${item.grader} ${item.grade}${item.grader_label ? ` · ${item.grader_label}` : ""}`],
    ["Certification", item.grader_cert_id],
    ["Properties", item.properties.join(", ")],
    [
      "Market value",
      Number.isFinite(item.fair_market_value) ? formatMoney(item.fair_market_value!) : "",
    ],
  ].filter(([, value]) => value !== undefined && value !== "");

  return (
    <dialog
      ref={dialog}
      className="collectible-detail"
      aria-labelledby="detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.matches("input, textarea, select, [contenteditable]")
        )
          return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        navigate(event.key === "ArrowRight" ? "next" : "previous");
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        dismissTouch.current =
          event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchMove={(event) => {
        if (event.touches.length !== 1) dismissTouch.current = null;
      }}
      onTouchCancel={() => {
        dismissTouch.current = null;
      }}
      onTouchEnd={(event) => {
        const start = dismissTouch.current;
        dismissTouch.current = null;
        const end = event.changedTouches[0];
        if (!start || !end || (dialog.current?.scrollTop ?? 0) !== 0) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (dy < 72 || dy < Math.abs(dx) * 1.25) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="detail-header">
        <button
          type="button"
          className="detail-close"
          aria-label="Close item details"
          onClick={onClose}
        >
          <X aria-hidden="true" size={24} />
        </button>
      </header>
      <div
        className="detail-gallery"
        onTouchStart={(event) => {
          const point = event.touches[0];
          touch.current =
            event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) touch.current = null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          const end = event.changedTouches[0];
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          if (dy >= 72 && dy >= Math.abs(dx) * 1.25) {
            event.preventDefault();
            onClose();
            return;
          }
          if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          event.preventDefault();
          navigate(dx > 0 ? "previous" : "next");
        }}
      >
        <ViewTransition
          name="detail-gallery"
          update={{
            "detail-navigation": `detail-${direction}`,
            default: "none",
          }}
          default="none"
        >
          <div className="detail-slides">
            {previous ? (
              <button
                type="button"
                className="detail-neighbor detail-previous"
                aria-label="View previous item"
                onClick={() => navigate("previous")}
              >
                <CardImage key={previous.id} item={previous} eager />
              </button>
            ) : null}
            <div className="detail-current">
              <CardImage key={item.id} item={item} eager shared />
            </div>
            {next ? (
              <button
                type="button"
                className="detail-neighbor detail-next"
                aria-label="View next item"
                onClick={() => navigate("next")}
              >
                <CardImage key={next.id} item={next} eager />
              </button>
            ) : null}
          </div>
        </ViewTransition>
      </div>
      <section className="detail-information">
        <nav className="detail-navigation" aria-label="Browse items">
          <button type="button" disabled={!previous} onClick={() => navigate("previous")}>
            Previous
          </button>
          <span>
            {position + 1} / {total}
          </span>
          <button
            type="button"
            disabled={!next && !(loadMoreError && onLoadMore)}
            onClick={() => (next ? navigate("next") : onLoadMore?.())}
          >
            {!next && loadMoreError ? "Retry loading" : !next && loadingMore ? "Loading…" : "Next"}
          </button>
        </nav>
        <h1 id="detail-title">{item.title}</h1>
        <BuyButton
          item={item}
          owned={owns(item)}
          balance={balance}
          ready={ready}
          onBuy={() => onBuy(item)}
          onSell={onSell ? () => onSell(item) : undefined}
        />
        <dl className="detail-metadata">
          {metadata.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </dialog>
  );
}
