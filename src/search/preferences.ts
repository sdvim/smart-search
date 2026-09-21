import { fieldValue } from "./index-data.ts";
import type { SearchIndex } from "./index-data.ts";
import { normalize } from "./types.ts";
import type { ParsedQuery, SearchContext, SearchField, SearchRecord } from "./types.ts";

export function preferenceScore(field: SearchField, value: unknown, context: SearchContext) {
  const preferences = context.preferred_values?.[field.key] ?? [];
  const values = Array.isArray(value) ? value : [value];
  const position = preferences.findIndex((preferred) =>
    values.some((actual) => {
      if (typeof actual === "number" || typeof preferred === "number") return actual === preferred;
      if (typeof actual !== "string") return false;
      const target = normalize(preferred);
      const source = normalize(actual);
      return source === target || (field.match === "family" && source.startsWith(`${target} `));
    }),
  );
  return position < 0 ? 0 : 1 / (position + 1);
}

export function rankRecords<T extends SearchRecord>(
  index: SearchIndex<T>,
  matches: T[],
  context: SearchContext,
  query: ParsedQuery,
): T[] {
  if (
    query.tokens.some((token) => token.direction) ||
    (!context.price_range && !Object.keys(context.preferred_values ?? {}).length)
  )
    return matches;
  const occupied = new Set(query.tokens.map((token) => token.field));
  const fields = index.dictionary.fields.filter((field) => !occupied.has(field.key));
  const ranked = matches.map((record, position) => {
    let score = 0;
    for (const field of fields) {
      const value = fieldValue(record, field);
      score += preferenceScore(field, value, context);
      if (
        field.inference === "price" &&
        context.price_range &&
        typeof value === "number" &&
        value >= context.price_range[0] &&
        value <= context.price_range[1]
      )
        score++;
    }
    return { record, score, position };
  });
  return ranked
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ record }) => record);
}
