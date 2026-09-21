import { useEffect, useMemo, useRef, useState } from "react";
import { activeRange, serializeQuery } from "../search/types.ts";
import type {
  SearchContext,
  SearchDictionary,
  SearchResponse,
  SearchValue,
} from "../search/types.ts";
import type { Collectible } from "./collectibles.ts";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Search is temporarily unavailable");
  return data;
}

const resultPageSize = 24;

type SearchResult = SearchResponse<Collectible> & {
  page: number;
  page_size: number;
  has_more: boolean;
};

export type SearchOwnership = {
  purchasedIds?: string[];
  soldIds?: string[];
};

function normalizeResult(result: SearchResponse<Collectible>, page: number): SearchResult {
  return {
    items: result.items ?? [],
    total: result.total,
    suggestion: result.suggestion ?? null,
    page: result.page ?? page,
    page_size: result.page_size ?? resultPageSize,
    has_more: result.has_more ?? false,
  };
}

function requestPage(requestBody: string, page: number, signal: AbortSignal) {
  const request = JSON.parse(requestBody) as Record<string, unknown>;
  return fetch("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, page, page_size: resultPageSize }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  }).then(readResponse<SearchResponse<Collectible>>);
}

export function useSearch(
  value: SearchValue,
  user: SearchContext,
  ownership: SearchOwnership | string[] = {},
) {
  const [dictionary, setDictionary] = useState<SearchDictionary | null>(null);
  const [dictionaryError, setDictionaryError] = useState(false);
  const [response, setResponse] = useState<{
    key: string;
    data: SearchResult;
    loadingMore?: boolean;
    loadMoreError?: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const query = serializeQuery(value);
  const range = activeRange(value);
  const ownershipIds = useMemo(
    () =>
      Array.isArray(ownership)
        ? { purchasedIds: ownership, soldIds: [] }
        : { purchasedIds: ownership.purchasedIds ?? [], soldIds: ownership.soldIds ?? [] },
    [ownership],
  );
  const { purchasedIds, soldIds } = ownershipIds;
  const requestInputKey = JSON.stringify({ query, active_range: range, user });
  const requestCaptureKey = `${requestInputKey}:${retryCount}`;
  const latestInput = useRef({ query, range, user, purchasedIds, soldIds });
  const request = useRef<{ key: string; body: string } | null>(null);
  const key = requestCaptureKey;

  useEffect(() => {
    latestInput.current = { query, range, user, ...ownershipIds };
  }, [query, range, user, ownershipIds]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dictionary", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(readResponse<SearchDictionary>)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDictionary(data);
        setDictionaryError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDictionaryError(true);
      });
    return () => controller.abort();
  }, [retryCount]);

  useEffect(() => {
    const controller = new AbortController();
    const { query, range, user, purchasedIds, soldIds } = latestInput.current;
    const requestBody = JSON.stringify({
      query,
      active_range: range,
      user,
      purchased_ids: [...purchasedIds],
      sold_ids: [...soldIds],
    });
    request.current = { key, body: requestBody };
    const timeout = setTimeout(async () => {
      try {
        const result = await requestPage(requestBody, 0, controller.signal);
        if (!controller.signal.aborted) {
          setResponse({ key, data: normalizeResult(result, 0) });
          setFailure(null);
        }
      } catch {
        if (!controller.signal.aborted)
          setFailure({ key, message: "Search is unavailable. Please try again." });
      }
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
      moreRequest.current?.abort();
      moreRequest.current = null;
    };
  }, [key]);

  function loadMore() {
    if (moreRequest.current || response?.key !== key || !response.data.has_more) return;
    const requestBody = request.current?.key === key ? request.current.body : null;
    if (!requestBody) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setResponse({ ...response, loadingMore: true, loadMoreError: false });
    const page = response.data.page + 1;
    requestPage(requestBody, page, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        moreRequest.current = null;
        setResponse((previous) => {
          if (!previous || previous.key !== key) return previous;
          const existing = new Set(previous.data.items.map((item) => item.id));
          const items = result.items.filter((item) => !existing.has(item.id));
          return {
            key,
            data: {
              ...normalizeResult(result, page),
              items: [...previous.data.items, ...items],
              suggestion: previous.data.suggestion,
            },
          };
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        moreRequest.current = null;
        setResponse((previous) =>
          previous?.key === key
            ? { ...previous, loadingMore: false, loadMoreError: true }
            : previous,
        );
      });
  }

  const error = dictionaryError
    ? "Search vocabulary could not load. Please try again."
    : failure?.key === key
      ? failure.message
      : null;
  const current = response?.key === key ? response : null;
  const displayed = response?.data;
  return {
    dictionary,
    items: displayed?.items ?? [],
    total: displayed?.total ?? 0,
    suggestion: current && !error ? current.data.suggestion : null,
    loading: response?.key !== key && !error,
    loadingMore: Boolean(current?.loadingMore),
    loadMoreError: Boolean(current?.loadMoreError),
    hasMore: Boolean(current?.data.has_more),
    loadMore,
    error,
    retry: () => setRetryCount((count) => count + 1),
  };
}
