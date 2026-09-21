import { filterRecords } from "./filter.ts";
import type { SearchIndex } from "./index-data.ts";
import { parseQuery } from "./parse.ts";
import { preferenceScore } from "./preferences.ts";
import { normalize, normalizedPrefixLength } from "./types.ts";
import type { SearchContext, SearchRecord, SearchSuggestion } from "./types.ts";

export function nearestPowerOfTen(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const lower = 10 ** Math.floor(Math.log10(value));
  const upper = lower * 10;
  return value - lower < upper - value ? lower : upper;
}

export function suggest<T extends SearchRecord>(
  index: SearchIndex<T>,
  query: string,
  range: [number, number],
  context: SearchContext = {},
): SearchSuggestion | null {
  const typed = query.slice(range[0], range[1]);
  const prefix = normalize(typed);
  const baseline = `${query.slice(0, range[0])} ${query.slice(range[1])}`;
  const parsed = parseQuery(baseline, index.dictionary);
  const remaining = filterRecords(index, parsed);
  if (!remaining.length) return null;
  const narrowed = { ...index, records: remaining };
  const occupied = new Set(parsed.tokens.map((token) => token.field));
  const wallet = nearestPowerOfTen(context.wallet_balance ?? 0);
  for (const field of [...index.dictionary.fields].sort((a, b) => a.priority - b.priority)) {
    if (occupied.has(field.key) && !prefix) continue;
    const candidates: { text: string; rank: number; field: string }[] = [];
    const addCandidate = (text: string, rank: number) =>
      candidates.push({ text, rank, field: field.key });
    if (prefix)
      for (const alias of Object.values(field.sortAliases ?? {}).flat())
        addCandidate(alias, field.priority * 100);
    if (field.kind !== "number") {
      for (const entry of index.dictionary.entries.filter((entry) => entry.field === field.key)) {
        const forms = [
          entry.value,
          ...(field.prefix ? [`${field.prefix} ${entry.value}`] : []),
          ...field.aliases.map((alias) => `${alias}:${entry.value}`),
        ];
        for (const text of forms)
          addCandidate(
            text,
            field.priority * 100 - preferenceScore(field, entry.value, context) * 50,
          );
      }
    } else {
      const values = index.dictionary.numeric_values[field.key] ?? [];
      if (field.inference === "price") {
        if (context.price_range) {
          const [minimum, maximum] = context.price_range;
          addCandidate(`between $${minimum} and $${maximum}`, field.priority * 100 - 100);
          addCandidate(`under $${maximum}`, field.priority * 100 - 90);
        }
        const ceilings = [
          ...new Set(
            [wallet, ...values.map(nearestPowerOfTen)].filter(
              (value): value is number => value !== null,
            ),
          ),
        ];
        for (const value of ceilings) {
          for (const [position, text] of [`under $${value}`, `<$${value}`, `$${value}`].entries())
            addCandidate(text, field.priority * 100 + (value === wallet ? -50 : 0) + position);
          addCandidate(`at least price $${value}`, field.priority * 100 + 4);
          addCandidate(`about $${value}`, field.priority * 100 + 5);
          addCandidate(`about ${value}`, field.priority * 100 + 6);
        }
      } else if (field.inference === "grade") {
        const personalized = values.some((value) => preferenceScore(field, value, context) > 0);
        for (const value of values) {
          const gradeRank = personalized
            ? -preferenceScore(field, value, context) * 50
            : Math.abs(9 - value) * 10;
          for (const [position, text] of [
            `grade ${value}+`,
            `${value}+`,
            `g:${value}`,
            `grade ${value}`,
          ].entries())
            addCandidate(text, field.priority * 100 + gradeRank + position);
          addCandidate(
            `at least grade ${value}`,
            field.priority * 100 + (personalized ? gradeRank : 0) + 4,
          );
          addCandidate(`about grade ${value}`, field.priority * 100 + gradeRank + 5);
          addCandidate(`about ${value}`, field.priority * 100 + gradeRank + 6);
        }
      } else if (field.inference === "year") {
        for (const value of [...new Set(values.map((value) => Math.ceil((value + 1) / 10) * 10))]) {
          for (const [position, text] of [
            `before ${value}`,
            `<${value}`,
            `year:${value}`,
          ].entries())
            addCandidate(text, field.priority * 100 + position);
          addCandidate(`at least year ${value}`, field.priority * 100 + 3);
          addCandidate(`about year ${value}`, field.priority * 100 + 4);
          addCandidate(`about ${value}`, field.priority * 100 + 5);
        }
      } else {
        for (const value of values)
          addCandidate(`${field.aliases[0] ?? field.key}:${value}`, field.priority * 100);
      }
      const operator = typed.match(
        /^(.*?(?:[:<>=$]|\b(?:about|before|after|under|below|over|above|least|most|more|less|fewer|greater|higher|lower|earlier|later|prior|up to|since|than|from|between|to|and))\s*)[\d.]*$/i,
      )?.[1];
      if (operator) {
        const separator = /[\s:<>=$]$/.test(operator) ? "" : " ";
        for (const value of values)
          addCandidate(`${operator}${separator}${value}`, field.priority * 100 + 10);
      }
    }
    const scored = candidates
      .flatMap((candidate) => {
        const normalized = normalize(candidate.text);
        if (!normalized.startsWith(prefix) || normalized === prefix) return [];
        const remainder = candidate.text.slice(normalizedPrefixLength(candidate.text, prefix));
        const suffix = /\s$/.test(typed) ? remainder.trimStart() : remainder;
        if (normalize(typed + suffix) !== normalized) return [];
        const result = parseQuery(candidate.text, index.dictionary);
        if (result.draft || result.tokens.length !== 1) return [];
        if (result.tokens[0].field !== candidate.field) return [];
        const count = filterRecords(narrowed, result).length;
        if (!count || (!prefix && count === remaining.length && parsed.tokens.length)) return [];
        return [{ ...candidate, count, suffix, token: result.tokens[0] }];
      })
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          b.count - a.count ||
          a.text.length - b.text.length ||
          a.text.localeCompare(b.text),
      );
    const best = scored[0];
    if (best)
      return {
        text: best.text,
        suffix: best.suffix,
        label: best.token.label,
        token: best.token,
      };
  }
  return null;
}
