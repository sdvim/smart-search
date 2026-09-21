import { comparisonSource, numericKeywords, readNumber } from "./numeric.ts";
import { normalize, normalizedPrefixLength } from "./types.ts";
import type { ParsedQuery, QueryToken, SearchDictionary, SearchField } from "./types.ts";

const comparisonPrefix = new RegExp(`^(${comparisonSource})\\s+`, "i");
const pendingComparison = new RegExp(`^(?:${comparisonSource}|~)\\s*\\$?$`, "i");

function categoricalToken(field: SearchField, value: string, text: string): QueryToken {
  return {
    id: "",
    field: field.key,
    operator: "eq",
    values: [value],
    text,
    label: value,
    compactLabel: value,
  };
}

function readSort(input: string, dictionary: SearchDictionary) {
  const normalized = normalize(input);
  for (const field of dictionary.fields) {
    for (const direction of ["asc", "desc"] as const) {
      for (const alias of field.sortAliases?.[direction] ?? []) {
        const keyword = normalize(alias);
        if (
          normalized !== keyword &&
          !normalized.startsWith(`${keyword} `) &&
          !normalized.startsWith(`${keyword},`)
        )
          continue;
        const length = normalizedPrefixLength(input, keyword);
        const token: QueryToken = {
          id: "",
          field: field.key,
          operator: "sort",
          values: [],
          direction,
          text: input.slice(0, length),
          label: alias,
          compactLabel: alias,
        };
        return { length, token };
      }
    }
  }
  return null;
}

function readIdentifier(input: string, dictionary: SearchDictionary, explicit?: SearchField) {
  const match = input.match(/^#?\d+(?:\/\d+)?(?:(?:\s*,\s*|\s+and\s+)#?\d+(?:\/\d+)?)*/i);
  if (!match || /^\s*[-–]/.test(input.slice(match[0].length))) return null;
  const values = match[0].split(/\s*(?:,|\band\b)\s*/i).map((value) => value.replace(/^#/, ""));
  const isList = values.length > 1;
  const certificate = dictionary.entries.some(
    (entry) =>
      dictionary.fields.find((field) => field.key === entry.field)?.inference === "certificate" &&
      entry.value === values[0],
  );
  if (!explicit && !input.startsWith("#") && !isList && values[0].length < 6 && !certificate)
    return null;
  const field =
    explicit ??
    dictionary.fields.find(
      (field) =>
        field.inference === (certificate || values[0].length >= 6 ? "certificate" : "number"),
    );
  if (!field) return null;
  const label = values.map((value) => `#${value}`).join(", ");
  return {
    length: match[0].length,
    token: {
      ...categoricalToken(field, values[0], match[0]),
      operator: "in" as const,
      values,
      label,
      compactLabel: label,
    },
  };
}

function readClause(
  input: string,
  dictionary: SearchDictionary,
): { length: number; token: QueryToken } | null {
  const negation = input.match(/^(?:not\s+|-(?=[\p{L}_]))/iu);
  if (negation) {
    const positive = readClause(input.slice(negation[0].length), dictionary);
    if (!positive || positive.token.operator === "sort") return null;
    const prefix = /^not/i.test(negation[0]) ? "not " : "-";
    return {
      length: negation[0].length + positive.length,
      token: {
        ...positive.token,
        negated: true,
        text: input.slice(0, negation[0].length + positive.length),
        label: `${prefix}${positive.token.label}`,
        compactLabel: `${prefix}${positive.token.compactLabel}`,
      },
    };
  }
  const sort = readSort(input, dictionary);
  if (sort) return sort;
  let explicit: SearchField | undefined;
  let prefix = "";
  const modifier = input.match(comparisonPrefix);
  const clauseInput = modifier ? input.slice(modifier[0].length) : input;
  const named = clauseInput.match(/^([\p{L}_]+)\s*:\s*/u);
  if (named) {
    explicit = dictionary.fields.find(
      (field) => field.key === normalize(named[1]) || field.aliases.includes(normalize(named[1])),
    );
    if (!explicit) return null;
    prefix = named[0];
  } else {
    const natural = clauseInput.match(/^([\p{L}_]+)\s+/u);
    if (natural) {
      explicit = dictionary.fields.find(
        (field) =>
          field.aliases.includes(normalize(natural[1])) || field.key === normalize(natural[1]),
      );
      if (explicit) prefix = natural[0];
    }
  }
  const rest = clauseInput.slice(prefix.length);
  if (!rest) return null;
  if (!modifier && (!explicit || explicit.kind === "identifier")) {
    const identifier = readIdentifier(rest, dictionary, explicit);
    if (identifier)
      return {
        length: prefix.length + identifier.length,
        token: { ...identifier.token, text: prefix + identifier.token.text },
      };
    if (explicit?.kind === "identifier") return null;
  }
  if (!explicit || explicit.kind === "number") {
    const numericInput = modifier ? modifier[0] + rest : rest;
    const numeric = readNumber(numericInput, dictionary, explicit);
    if (numeric)
      return {
        length: prefix.length + numeric.length,
        token: { ...numeric.token, text: input.slice(0, prefix.length + numeric.length) },
      };
    if (explicit?.kind === "number") return null;
  }
  if (modifier) return null;
  const normalized = normalize(rest);
  const entry = dictionary.entries.find(
    (entry) =>
      (!explicit || explicit.key === entry.field) &&
      (normalized === entry.normalized ||
        normalized.startsWith(`${entry.normalized} `) ||
        normalized.startsWith(`${entry.normalized},`)),
  );
  if (!entry) return null;
  const field = dictionary.fields.find((field) => field.key === entry.field)!;
  const raw = rest.slice(0, normalizedPrefixLength(rest, entry.normalized));
  return {
    length: prefix.length + raw.length,
    token: categoricalToken(field, entry.value, prefix + raw),
  };
}

export function parseQuery(query: string, dictionary: SearchDictionary): ParsedQuery {
  const tokens: QueryToken[] = [];
  let rest = query.trimStart();
  let offset = query.length - rest.length;
  while (rest) {
    const clause = readClause(rest, dictionary);
    if (!clause) break;
    const after = rest.slice(clause.length);
    if (after && !/^[\s,]/.test(after)) break;
    tokens.push({ ...clause.token, id: `${offset}:${clause.token.field}` });
    const separator = after.match(/^[\s,]*(?:and\s+)?/i)![0];
    offset += clause.length + separator.length;
    rest = after.slice(separator.length);
  }
  const normalized = normalize(rest);
  const prefix = rest.match(/^([\p{L}_]+)\s*[: ]\s*/u);
  const field = dictionary.fields.find((field) =>
    [field.key, ...field.aliases].includes(normalize(prefix?.[1] ?? normalized)),
  );
  const argument = prefix && field ? rest.slice(prefix[0].length).trim() : rest;
  const pendingArgument = argument.replace(/^(?:not\s+|-(?=[\p{L}_]))/iu, "");
  const numericTail = /^(?:(?:from|between)\s+)?\$?\d+(?:\.\d+)?\s*(?:[-–]|to|and)\s*\$?$/i.test(
    pendingArgument,
  );
  const pending =
    numericKeywords.some((keyword) => keyword.startsWith(normalize(pendingArgument))) ||
    dictionary.fields.some((field) =>
      Object.values(field.sortAliases ?? {})
        .flat()
        .some((alias) => normalize(alias).startsWith(normalized)),
    ) ||
    pendingComparison.test(pendingArgument) ||
    /^[<>=$#~]+$/.test(pendingArgument) ||
    numericTail ||
    (!!field && !argument);
  return { tokens, draft: rest, pending: !!rest && pending };
}

export function parseActiveQuery(
  query: string,
  dictionary: SearchDictionary,
  range: [number, number],
) {
  const pieces = [query.slice(0, range[0]), query.slice(...range), query.slice(range[1])].map(
    (piece) => parseQuery(piece, dictionary),
  );
  const drafts = pieces.filter((piece) => piece.draft);
  return {
    tokens: pieces.flatMap((piece) => piece.tokens),
    draft: drafts.map((piece) => piece.draft).join(" "),
    pending: drafts.length > 0 && drafts.every((piece) => piece.pending),
  };
}

export function splitDraft(draft: string, dictionary: SearchDictionary, commit = false) {
  const parsed = parseQuery(draft, dictionary);
  if (
    !commit &&
    dictionary.entries.some(
      (entry) =>
        entry.normalized.startsWith(`${normalize(draft)}`) && entry.normalized !== normalize(draft),
    )
  )
    return { tokens: [], draft };
  if (!commit && parsed.draft && parsed.tokens.length) {
    const continuation = parseQuery(parsed.draft, dictionary);
    if (!continuation.tokens.length && !continuation.pending) return { tokens: [], draft };
  }
  if (!commit && !parsed.draft && parsed.tokens.length) {
    const last = parsed.tokens.at(-1)!;
    return {
      tokens: parsed.tokens.slice(0, -1),
      draft: last.text + (/\s$/.test(draft) ? " " : ""),
    };
  }
  return { tokens: parsed.tokens, draft: parsed.draft };
}
