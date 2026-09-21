import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SmartSearchBar } from "../components/SmartSearchBar.tsx";
import { emptySearch, serializeQuery } from "../search/types.ts";
import type { SearchContext, SearchValue } from "../search/types.ts";
import { updateDraft } from "../search/edit.ts";
import { parseQuery, splitDraft } from "../search/parse.ts";
import { CollectibleCard } from "./CollectibleCard.tsx";
import { CollectibleDetail } from "./CollectibleDetail.tsx";
import { AnimatedMoney } from "./AnimatedMoney.tsx";
import type { Collectible } from "./collectibles.ts";
import { usePortfolio } from "./usePortfolio.ts";
import { useSearch } from "./useSearch.ts";
import { useScrollHeader } from "./useScrollHeader.ts";
import { canPurchase, canSell } from "./purchase.ts";
import "./demo.css";

function committedQuery(value: SearchValue) {
  return value.tokens.map((token) => token.text).join(" ");
}

function matchesCurrentOwnership(
  item: Collectible,
  tokens: SearchValue["tokens"],
  owns: (item: Collectible) => boolean,
) {
  const ownership = tokens.filter((token) => token.field === "ownership");
  if (!ownership.length) return true;
  const owned = owns(item);
  const matches = (_token: SearchValue["tokens"][number]) => owned;
  const positive = ownership.filter((token) => !token.negated);
  const negative = ownership.filter((token) => token.negated);
  return !negative.some(matches) && (!positive.length || positive.some(matches));
}

function updateQueryParam(query: string) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const searchPlaceholders = [
  "Slaking grade 9+ listed",
  "Pikachu between $100 and $300",
  "Alakazam 1996-2000 jp",
  "Slaking under $100 grade 9+",
  "Pikachu before 2010 reverse holo",
  "Alakazam in Base Set",
  "listed Slaking low to high",
  "Pikachu for sale high to low",
] as const;
const searchPlaceholderInterval = 2800;

export function App() {
  const [initialQuery] = useState(() => new URL(window.location.href).searchParams.get("q") ?? "");
  const [value, setValue] = useState<SearchValue>(() =>
    initialQuery ? { ...emptySearch, draft: initialQuery } : emptySearch,
  );
  const account = usePortfolio();
  const { portfolio } = account;
  const [detail, setDetail] = useState<{ id: string; direction: "next" | "previous" } | null>(
    () => {
      const id = new URL(window.location.href).searchParams.get("detail");
      return id ? { id, direction: "next" } : null;
    },
  );
  const portfolioQuery = useRef<SearchValue | null>(null);
  const detailId = detail?.id ?? null;
  const [browseContext, setBrowseContext] = useState<{
    user: SearchContext;
    purchasedIds: string[];
    soldIds: string[];
  } | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [purchaseRevealKey, setPurchaseRevealKey] = useState(0);
  const user = account.searchContext;
  const search = useSearch(
    value,
    browseContext?.user ?? user,
    browseContext
      ? { purchasedIds: browseContext.purchasedIds, soldIds: browseContext.soldIds }
      : { purchasedIds: account.purchasedIds, soldIds: account.soldIds },
    initialQuery,
  );
  const headerHidden = useScrollHeader(purchaseRevealKey);
  const demoRef = useRef<HTMLElement>(null);
  const resultsEnd = useRef<HTMLDivElement>(null);
  const returnTarget = useRef<HTMLButtonElement | null>(null);
  const { hasMore, loadMore, loadingMore, loadMoreError } = search;
  const displayValue = search.value;

  useEffect(() => {
    if (displayValue.draft || displayValue.tokens.length) return;
    const timer = window.setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % searchPlaceholders.length),
      searchPlaceholderInterval,
    );
    return () => window.clearInterval(timer);
  }, [displayValue.draft, displayValue.tokens.length]);

  useEffect(() => {
    const target = resultsEnd.current;
    if (
      !target ||
      detailId ||
      !hasMore ||
      loadingMore ||
      loadMoreError ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore, loadMoreError, detailId]);

  const ownershipTokens = search.dictionary
    ? parseQuery(serializeQuery(displayValue), search.dictionary).tokens.filter(
        (token) => token.field === "ownership",
      )
    : [];
  const showingPortfolio = ownershipTokens.length > 0;
  const displayedItems = search.items.filter((item) =>
    matchesCurrentOwnership(item, ownershipTokens, account.owns),
  );
  const displayedTotal =
    showingPortfolio && displayedItems.length !== search.items.length
      ? Math.max(0, search.total + displayedItems.length - search.items.length)
      : search.total;
  const detailIndex = detailId ? displayedItems.findIndex((item) => item.id === detailId) : -1;
  useEffect(() => {
    if (detailId && detailIndex < 0 && hasMore && !loadingMore && !loadMoreError) loadMore();
  }, [detailId, detailIndex, hasMore, loadingMore, loadMoreError, loadMore]);

  useEffect(() => {
    if (
      detailIndex >= 0 &&
      detailIndex >= displayedItems.length - 3 &&
      hasMore &&
      !loadingMore &&
      !loadMoreError
    )
      loadMore();
  }, [detailIndex, displayedItems.length, hasMore, loadingMore, loadMoreError, loadMore]);

  useLayoutEffect(() => {
    const target = returnTarget.current;
    if (detailId || !target?.isConnected) return;
    returnTarget.current = null;
    const bounds = target.getBoundingClientRect();
    const header = document.querySelector(".demo-header")?.getBoundingClientRect();
    if (bounds.top < Math.max(0, header?.bottom ?? 0) || bounds.bottom > window.innerHeight)
      target.scrollIntoView({ block: "center", behavior: "instant" });
    target.focus({ preventScroll: true });
  }, [detailId]);

  useEffect(() => {
    function restoreDetail() {
      const id = new URL(window.location.href).searchParams.get("detail");
      setDetail(id ? { id, direction: "next" } : null);
    }
    window.addEventListener("popstate", restoreDetail);
    return () => window.removeEventListener("popstate", restoreDetail);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (detailId) url.searchParams.set("detail", detailId);
    else url.searchParams.delete("detail");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [detailId]);

  function apply(next: SearchValue) {
    if (committedQuery(next) !== committedQuery(displayValue))
      updateQueryParam(committedQuery(next));
    setValue(next);
    setBrowseContext(null);
  }

  function submit(submittedDraft?: string) {
    if (!search.dictionary) return false;
    const draft = submittedDraft ?? displayValue.draft;
    const next = updateDraft(displayValue, draft, search.dictionary, true);
    const committed =
      next.editingId !== displayValue.editingId ||
      next.tokens.length !== displayValue.tokens.length;
    if (!committed) return false;
    apply(next);
    return true;
  }

  function togglePortfolio() {
    if (!search.dictionary) return;
    setDetail(null);
    if (showingPortfolio) {
      const previous = portfolioQuery.current ?? emptySearch;
      portfolioQuery.current = null;
      apply(previous);
    } else {
      portfolioQuery.current = displayValue;
      apply({ ...splitDraft("mine", search.dictionary, true), editingId: null });
    }
    window.scrollTo({ top: 0 });
  }

  function openDetail(item: Collectible) {
    const url = new URL(window.location.href);
    url.searchParams.set("detail", item.id);
    window.history.pushState({ detail: item.id }, "", `${url.pathname}${url.search}${url.hash}`);
    const card = demoRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(item.id)}"]`,
    );
    demoRef.current?.classList.add("has-detail");
    card?.classList.add("is-detail-active");
    startTransition(() => {
      setBrowseContext(
        (current) =>
          current ?? {
            user,
            purchasedIds: account.purchasedIds,
            soldIds: account.soldIds,
          },
      );
      setDetail({ id: item.id, direction: "next" });
    });
  }

  function closeDetail(restoreFocus = true) {
    returnTarget.current = restoreFocus
      ? document.querySelector<HTMLButtonElement>(
          `[data-item-id="${CSS.escape(detailId!)}"] .card-open`,
        )
      : null;
    if (!restoreFocus && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const url = new URL(window.location.href);
    url.searchParams.delete("detail");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    startTransition(() => setDetail(null));
  }

  function navigateDetail(direction: "next" | "previous") {
    setDetail((current) => {
      const index = displayedItems.findIndex((item) => item.id === current?.id);
      if (index < 0) return current;
      const adjacent = displayedItems[index + (direction === "next" ? 1 : -1)];
      if (adjacent) {
        const url = new URL(window.location.href);
        url.searchParams.set("detail", adjacent.id);
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      return adjacent ? { id: adjacent.id, direction } : current;
    });
  }

  function buy(item: Collectible) {
    const purchaseAllowed = canPurchase(item, account.balance, account.owns(item), account.ready);
    account.buy(item);
    if (purchaseAllowed) setPurchaseRevealKey((key) => key + 1);
  }

  function sell(item: Collectible) {
    const saleAllowed = canSell(item, account.owns(item), account.ready);
    account.sell(item);
    if (saleAllowed) setPurchaseRevealKey((key) => key + 1);
  }

  return (
    <main ref={demoRef} className={`demo${detail ? " has-detail" : ""}`}>
      <header className={`demo-header${headerHidden ? " is-hidden" : ""}`}>
        <button
          type="button"
          className="portfolio"
          aria-label={showingPortfolio ? "Show all collectibles" : "Show my portfolio"}
          aria-pressed={showingPortfolio}
          aria-busy={portfolio === undefined}
          disabled={!search.dictionary}
          onClick={togglePortfolio}
          title={
            portfolio
              ? `Estimated from ${portfolio.valued_item_count} of ${portfolio.item_count} imported collectibles with known values.`
              : undefined
          }
        >
          Portfolio:{" "}
          <strong>
            {portfolio ? (
              <AnimatedMoney value={portfolio.total_value} />
            ) : portfolio === undefined ? (
              "…"
            ) : (
              "—"
            )}
          </strong>
        </button>
        <SmartSearchBar
          value={displayValue}
          onChange={apply}
          suggestion={search.suggestion}
          onAcceptSuggestion={(suggestion) => {
            if (search.dictionary)
              apply(updateDraft(displayValue, suggestion.text, search.dictionary, true));
          }}
          onSubmit={submit}
          ariaLabel="Search collectibles"
          placeholder={searchPlaceholders[placeholderIndex]}
        />
        <p className="wallet">
          Balance:{" "}
          <strong>
            <AnimatedMoney value={account.balance} />
          </strong>
        </p>
      </header>
      <section
        className="results"
        aria-label="Search results"
        aria-busy={search.loading || search.loadingMore}
      >
        <output className="visually-hidden">
          {search.loading ? "Searching" : `${displayedTotal} collectibles found`}
        </output>
        {search.error ? (
          <div className="result-message" role="alert">
            <p>{search.error}</p>
            <button type="button" onClick={search.retry}>
              Try again
            </button>
          </div>
        ) : null}
        {!search.error && !search.loading && !displayedTotal ? (
          <div className="result-message">
            <p>No matching collectibles.</p>
            <span>Try changing or removing a filter.</span>
          </div>
        ) : null}
        {search.loading && !displayedItems.length ? (
          <div className="result-message">Finding collectibles…</div>
        ) : null}
        <div className="result-grid" data-loading={search.loading}>
          {displayedItems.map((item) => (
            <CollectibleCard
              key={item.id}
              item={item}
              onOpen={() => openDetail(item)}
              onBuy={() => buy(item)}
              onSell={() => sell(item)}
              inDetail={detailId === item.id}
              detailOpen={detailId !== null}
              owned={account.owns(item)}
              balance={account.balance}
              ready={account.ready}
            />
          ))}
        </div>
        <div
          ref={resultsEnd}
          className="results-sentinel"
          data-results-sentinel
          data-has-more={search.hasMore}
          data-loading={search.loadingMore}
          aria-live="polite"
        >
          {search.loadingMore ? "Loading more collectibles…" : null}
          {search.loadMoreError ? (
            <button type="button" onClick={search.loadMore}>
              Try loading more
            </button>
          ) : null}
        </div>
      </section>
      {detail ? (
        <CollectibleDetail
          items={displayedItems}
          total={displayedTotal}
          selectedId={detail.id}
          direction={detail.direction}
          onNavigate={navigateDetail}
          onClose={closeDetail}
          onBuy={buy}
          onSell={sell}
          owns={account.owns}
          balance={account.balance}
          ready={account.ready}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={loadMore}
        />
      ) : null}
    </main>
  );
}
