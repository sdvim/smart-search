import { fieldValue, identifierKey } from "./index-data.ts";
import type { SearchIndex } from "./index-data.ts";
import { normalize } from "./types.ts";
import type { ParsedQuery, QueryToken, SearchField, SearchRecord } from "./types.ts";

function matchesToken(
  record: SearchRecord,
  token: QueryToken,
  field: SearchField,
  postings: Map<string, Set<string>>,
) {
  const value = fieldValue(record, field);
  if (field.kind === "number") {
    if (typeof value !== "number") return false;
    const comparable = (value: number) => (field.currency ? Math.round(value * 100) : value);
    const actual = comparable(value);
    const values = token.values.map((value) => comparable(Number(value)));
    const [first, second] = values;
    switch (token.operator) {
      case "eq":
        return actual === first;
      case "lt":
        return actual < first;
      case "lte":
        return actual <= first;
      case "gt":
        return actual > first;
      case "gte":
        return actual >= first;
      case "range":
        return actual >= Math.min(first, second) && actual <= Math.max(first, second);
      case "in":
        return values.includes(actual);
    }
  }
  if (field.kind === "category") {
    if (
      token.values.some((expected) =>
        postings.get(`${field.key}:${normalize(String(expected))}`)?.has(record.id),
      )
    )
      return true;
    if (field.match !== "family") return false;
  }
  const actual = (Array.isArray(value) ? value : [value]).filter(
    (value): value is string => typeof value === "string",
  );
  return token.values.some((expected) =>
    actual.some((value) => {
      if (field.kind === "identifier") {
        const target = identifierKey(String(expected), field);
        const source = identifierKey(value, field);
        return (
          source === target ||
          (field.inference === "number" && !target.includes("/") && source.split("/")[0] === target)
        );
      }
      return (
        normalize(value) === normalize(String(expected)) ||
        (field.match === "family" && normalize(value).startsWith(`${normalize(String(expected))} `))
      );
    }),
  );
}

export function filterRecords<T extends SearchRecord>(
  index: SearchIndex<T>,
  query: ParsedQuery,
): T[] {
  const groups = new Map<string, QueryToken[]>();
  for (const token of query.tokens)
    groups.set(token.field, [...(groups.get(token.field) ?? []), token]);
  const text = query.pending ? "" : normalize(query.draft);
  const words = text.split(" ").filter(Boolean);
  const fields = index.dictionary.fields;
  const results = index.records.filter((record) => {
    for (const [key, tokens] of groups) {
      const field = fields.find((field) => field.key === key);
      if (!field) return false;
      const combine = field.kind === "number" || field.match === "all" ? "every" : "some";
      if (!tokens[combine]((token) => matchesToken(record, token, field, index.postings)))
        return false;
    }
    if (!words.length) return true;
    const searchable = normalize(
      [record.title, ...fields.map((field) => fieldValue(record, field))]
        .flat()
        .filter((value) => typeof value === "string")
        .join(" "),
    );
    return words.every((word) => searchable.split(/\s+/).some((value) => value.startsWith(word)));
  });
  const sorts = query.tokens.filter((token) => token.direction);
  return results.sort((a, b) => {
    for (const token of sorts) {
      const field = fields.find((field) => field.key === token.field)!;
      const difference = Number(fieldValue(a, field)) - Number(fieldValue(b, field));
      if (difference) return token.direction === "desc" ? -difference : difference;
    }
    return a.id.localeCompare(b.id);
  });
}
