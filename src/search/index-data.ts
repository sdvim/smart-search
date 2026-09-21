import { normalize } from "./types.ts";
import type { SearchDictionary, SearchField, SearchRecord } from "./types.ts";

export type SearchIndex<T extends SearchRecord> = {
  records: T[];
  dictionary: SearchDictionary;
  postings: Map<string, Set<string>>;
};

export function fieldValue(record: SearchRecord, field: SearchField): unknown {
  if (field.presenceKeys)
    return field.presenceKeys.some((key) => {
      const value = record[key];
      return value !== undefined && value !== null;
    })
      ? (field.presenceValues ?? [field.key])
      : [];
  return field.fallbackKeys
    ? field.fallbackKeys
        .map((key) => record[key])
        .find((value) => value !== undefined && value !== null)
    : record[field.key];
}

export function identifierKey(value: string, field: SearchField) {
  const clean = value.replace(/^#/, "");
  return field.inference === "number"
    ? clean
        .split("/")
        .map((part) => part.replace(/^0+(?=\d)/, ""))
        .join("/")
    : clean;
}

export function buildIndex<T extends SearchRecord>(
  records: T[],
  fields: SearchField[],
): SearchIndex<T> {
  const counts = new Map<
    string,
    { field: string; value: string; normalized: string; count: number }
  >();
  const postings = new Map<string, Set<string>>();
  const numbers: Record<string, Set<number>> = {};
  const addCategoricalValue = (field: SearchField, value: string, record: T, count = true) => {
    const normalized = normalize(value);
    const key = `${field.key}:${normalized}`;
    if (count) {
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { field: field.key, value, normalized, count: 1 });
    } else if (!counts.has(key)) counts.set(key, { field: field.key, value, normalized, count: 0 });
    if (!postings.has(key)) postings.set(key, new Set());
    postings.get(key)!.add(record.id);
  };
  for (const record of records) {
    for (const field of fields) {
      const value = fieldValue(record, field);
      if (typeof value === "number" && Number.isFinite(value)) {
        (numbers[field.key] ??= new Set()).add(value);
      } else {
        for (const entry of Array.isArray(value) ? value : [value]) {
          if (typeof entry !== "string" || !entry) continue;
          addCategoricalValue(field, entry, record);
          for (const [alias, canonical] of Object.entries(field.valueAliases ?? {}))
            if (normalize(canonical) === normalize(entry))
              addCategoricalValue(field, alias, record);
        }
      }
    }
  }
  for (const field of fields)
    for (const value of field.presenceValues ?? []) {
      const normalized = normalize(value);
      const key = `${field.key}:${normalized}`;
      if (!counts.has(key)) counts.set(key, { field: field.key, value, normalized, count: 0 });
    }
  return {
    records,
    postings,
    dictionary: {
      fields,
      entries: [...counts.values()].sort(
        (a, b) =>
          b.normalized.length - a.normalized.length || a.normalized.localeCompare(b.normalized),
      ),
      numeric_values: Object.fromEntries(
        Object.entries(numbers).map(([key, values]) => [key, [...values].sort((a, b) => a - b)]),
      ),
    },
  };
}
