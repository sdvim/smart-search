export type SearchRecord = { id: string; [field: string]: unknown };

export type SearchField = {
  key: string;
  aliases: string[];
  kind: "category" | "number" | "identifier";
  priority: number;
  inference?: "year" | "grade" | "price" | "number" | "certificate";
  prefix?: string;
  match?: "family" | "all";
  currency?: boolean;
  fallbackKeys?: string[];
  presenceKeys?: string[];
  presenceValues?: string[];
  valueAliases?: Record<string, string>;
  sortAliases?: { asc?: string[]; desc?: string[] };
};

type DictionaryEntry = { field: string; value: string; normalized: string; count: number };

export type SearchDictionary = {
  fields: SearchField[];
  entries: DictionaryEntry[];
  numeric_values: Record<string, number[]>;
};

export type QueryToken = {
  id: string;
  field: string;
  operator: "eq" | "lt" | "lte" | "gt" | "gte" | "range" | "in" | "sort";
  values: (string | number)[];
  negated?: boolean;
  direction?: "asc" | "desc";
  text: string;
  label: string;
  compactLabel: string;
};

export type ParsedQuery = { tokens: QueryToken[]; draft: string; pending: boolean };
export type SearchValue = { tokens: QueryToken[]; draft: string; editingId: string | null };
export type SearchSuggestion = { text: string; suffix: string; label: string; token: QueryToken };
export type SearchContext = {
  wallet_balance?: number;
  preferred_values?: Record<string, (string | number)[]>;
  price_range?: [number, number];
};
export type SearchResponse<T> = {
  items: T[];
  total: number;
  suggestion: SearchSuggestion | null;
  page?: number;
  page_size?: number;
  has_more?: boolean;
};

export const emptySearch: SearchValue = { tokens: [], draft: "", editingId: null };

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedPrefixLength(value: string, prefix: string) {
  let length = 0;
  while (length < value.length && normalize(value.slice(0, length)).length < prefix.length)
    length++;
  return length;
}

export function serializeQuery(value: SearchValue) {
  const parts = value.tokens.map((token) =>
    token.id === value.editingId ? value.draft : token.text,
  );
  if (!value.editingId) parts.push(value.draft);
  return parts.filter(Boolean).join(" ");
}

export function activeRange(value: SearchValue): [number, number] {
  const before = value.editingId
    ? value.tokens.slice(
        0,
        value.tokens.findIndex((token) => token.id === value.editingId),
      )
    : value.tokens;
  const prefix = before.map((token) => token.text).join(" ");
  const start = prefix.length + (prefix && value.draft ? 1 : 0);
  return [start, start + value.draft.length];
}
