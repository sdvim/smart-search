import { useEffect, useMemo, useRef, useState } from "react";
import { SmartSearchBar } from "../components/SmartSearchBar.tsx";
import { emptySearch } from "../search/types.ts";
import type { SearchValue } from "../search/types.ts";
import { updateDraft } from "../search/edit.ts";
import { CollectibleCard } from "./CollectibleCard.tsx";
import { demoUser, formatMoney } from "./collectibles.ts";
import { useSearch } from "./useSearch.ts";
import { useScrollHeader } from "./useScrollHeader.ts";
import "./demo.css";

function committedQuery(value: SearchValue) {
  return value.tokens.map((token) => token.text).join(" ");
}

function updateQueryParam(query: string) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function App() {
  const [initialQuery] = useState(() => new URL(window.location.href).searchParams.get("q") ?? "");
  const [value, setValue] = useState<SearchValue>(() =>
    initialQuery ? { ...emptySearch, draft: initialQuery } : emptySearch,
  );
  const [hasEdited, setHasEdited] = useState(false);
  const search = useSearch(value, demoUser);
  const headerHidden = useScrollHeader();
  const resultsEnd = useRef<HTMLDivElement>(null);
  const { hasMore, loadMore } = search;

  useEffect(() => {
    const target = resultsEnd.current;
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const displayedValue = useMemo(() => {
    if (
      !initialQuery ||
      hasEdited ||
      !search.dictionary ||
      value.tokens.length ||
      value.draft !== initialQuery
    )
      return value;
    return updateDraft(emptySearch, initialQuery, search.dictionary, true);
  }, [hasEdited, initialQuery, search.dictionary, value]);

  function apply(next: SearchValue) {
    if (committedQuery(next) !== committedQuery(displayedValue))
      updateQueryParam(committedQuery(next));
    setHasEdited(true);
    setValue(next);
  }

  function change(next: SearchValue) {
    apply(next);
  }

  function submit() {
    if (!search.dictionary) return false;
    const next = updateDraft(displayedValue, displayedValue.draft, search.dictionary, true);
    const committed =
      Boolean(displayedValue.draft || displayedValue.editingId) &&
      (next.draft !== displayedValue.draft ||
        next.editingId !== displayedValue.editingId ||
        next.tokens.length !== displayedValue.tokens.length);
    apply(next);
    return committed;
  }

  return (
    <main className="demo">
      <header className={`demo-header${headerHidden ? " is-hidden" : ""}`}>
        <p className="portfolio">
          Portfolio: <strong>$13,398</strong>
        </p>
        <SmartSearchBar
          value={displayedValue}
          onChange={change}
          suggestion={search.suggestion}
          onAcceptSuggestion={(suggestion) => {
            if (search.dictionary)
              apply(updateDraft(displayedValue, suggestion.text, search.dictionary, true));
          }}
          onSubmit={submit}
          ariaLabel="Search collectibles"
        />
        <p className="wallet">
          Balance: <strong>{formatMoney(demoUser.wallet_balance)}</strong>
        </p>
      </header>
      <section
        className="results"
        aria-label="Search results"
        aria-busy={search.loading || search.loadingMore}
      >
        <output className="visually-hidden">
          {search.loading ? "Searching" : `${search.total} collectibles found`}
        </output>
        {search.error ? (
          <div className="result-message" role="alert">
            <p>{search.error}</p>
            <button type="button" onClick={search.retry}>
              Try again
            </button>
          </div>
        ) : null}
        {!search.error && !search.loading && !search.total ? (
          <div className="result-message">
            <p>No matching collectibles.</p>
            <span>Try changing or removing a filter.</span>
          </div>
        ) : null}
        {search.loading && !search.items.length ? (
          <div className="result-message">Finding collectibles…</div>
        ) : null}
        <div className="result-grid" data-loading={search.loading}>
          {search.items.map((item) => (
            <CollectibleCard key={item.id} item={item} />
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
    </main>
  );
}
