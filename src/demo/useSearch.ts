import { useCallback, useEffect, useRef, useState } from "react";
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

export function useSearch(value: SearchValue, user: SearchContext) {
  const [dictionary, setDictionary] = useState<SearchDictionary | null>(null);
  const [dictionaryError, setDictionaryError] = useState(false);
  const [response, setResponse] = useState<{
    key: string;
    data: SearchResult;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  const [loadMoreErrorKey, setLoadMoreErrorKey] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const moreRequest = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const query = serializeQuery(value);
  const range = activeRange(value);
  const requestBody = JSON.stringify({ query, active_range: range, user });
  const key = `${requestBody}:${retryCount}`;

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
    moreRequest.current?.abort();
    moreRequest.current = null;
    loadingMoreRef.current = false;
    const controller = new AbortController();
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
    };
  }, [requestBody, key]);

  const loadMore = useCallback(() => {
    if (
      loadingMoreRef.current ||
      response?.key !== key ||
      !response.data.has_more ||
      response.data.page_size !== resultPageSize
    )
      return;
    loadingMoreRef.current = true;
    setLoadingMoreKey(key);
    setLoadMoreErrorKey(null);
    const controller = new AbortController();
    moreRequest.current = controller;
    const page = response.data.page + 1;
    requestPage(requestBody, page, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
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
        if (!controller.signal.aborted) setLoadMoreErrorKey(key);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        loadingMoreRef.current = false;
        moreRequest.current = null;
        setLoadingMoreKey((currentKey) => (currentKey === key ? null : currentKey));
      });
  }, [key, requestBody, response]);

  const error = dictionaryError
    ? "Search vocabulary could not load. Please try again."
    : failure?.key === key
      ? failure.message
      : null;
  const current = response?.key === key ? response.data : null;
  const loadingMore = loadingMoreKey === key && current !== null;
  return {
    dictionary,
    items: current?.items ?? [],
    total: current?.total ?? 0,
    suggestion: current && !error ? current.suggestion : null,
    loading: response?.key !== key && !error,
    loadingMore,
    loadMoreError: current ? loadMoreErrorKey === key : false,
    hasMore: Boolean(current?.has_more),
    loadMore,
    error,
    retry: () => setRetryCount((count) => count + 1),
  };
}
