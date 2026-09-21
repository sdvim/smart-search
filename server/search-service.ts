import type { Collectible } from "../src/demo/collectibles.ts";
import { summarizePortfolio } from "../src/demo/portfolio.ts";
import type { PortfolioSource, PortfolioSnapshot } from "../src/demo/portfolio.ts";
import { filterRecords } from "../src/search/filter.ts";
import { buildIndex } from "../src/search/index-data.ts";
import type { SearchIndex } from "../src/search/index-data.ts";
import { parseActiveQuery } from "../src/search/parse.ts";
import { rankRecords } from "../src/search/preferences.ts";
import { suggest } from "../src/search/suggest.ts";
import type { SearchContext, SearchDictionary, SearchResponse } from "../src/search/types.ts";

type SearchRequest = {
  query: string;
  activeRange: [number, number];
  user: SearchContext;
  purchasedIds: readonly string[];
  soldIds: readonly string[];
  page: number;
  pageSize: number;
};

type SearchService = {
  dictionary: SearchDictionary;
  portfolio: PortfolioSnapshot;
  hasKnownId: (id: string) => boolean;
  search: (request: SearchRequest) => SearchResponse<Collectible>;
};

function withOwnership(
  sourceIndex: SearchIndex<Collectible>,
  owned: ReadonlySet<string>,
): SearchIndex<Collectible> {
  return buildIndex(
    sourceIndex.records.map((item) => ({
      ...item,
      ownership: owned.has(item.id) ? ["mine", "vaulted"] : [],
    })),
    sourceIndex.dictionary.fields,
  );
}

export function createSearchService(
  sourceIndex: SearchIndex<Collectible>,
  portfolio?: PortfolioSource,
): SearchService {
  const initialOwned = new Set(portfolio?.item_ids ?? []);
  const baseIndex = withOwnership(sourceIndex, initialOwned);
  const knownIds = new Set(sourceIndex.records.map((item) => item.id));
  const summary = summarizePortfolio(sourceIndex.records, portfolio?.item_ids ?? []);

  return {
    dictionary: baseIndex.dictionary,
    portfolio: {
      ...summary,
      items: sourceIndex.records.filter((item) => initialOwned.has(item.id)),
    },
    hasKnownId: (id) => knownIds.has(id),
    search: ({ query, activeRange, user, purchasedIds, soldIds, page, pageSize }) => {
      const purchased = new Set(purchasedIds);
      const sold = new Set(soldIds);
      const owned = new Set(
        sourceIndex.records
          .filter(
            (item) => purchased.has(item.id) || (initialOwned.has(item.id) && !sold.has(item.id)),
          )
          .map((item) => item.id),
      );
      const index = purchased.size || sold.size ? withOwnership(sourceIndex, owned) : baseIndex;
      const parsed = parseActiveQuery(query, index.dictionary, activeRange);
      const matches = rankRecords(index, filterRecords(index, parsed), user, parsed);
      const start = page * pageSize;
      const items = matches.slice(start, start + pageSize);
      return {
        items,
        total: matches.length,
        page,
        page_size: pageSize,
        has_more: start + items.length < matches.length,
        suggestion: suggest(index, query, activeRange, user),
      };
    },
  };
}
