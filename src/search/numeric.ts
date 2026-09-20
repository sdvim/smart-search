import type { QueryToken, SearchDictionary, SearchField } from "./types.ts";

const amount = String.raw`\$?\d+(?:,\d{3})*(?:\.\d+)?`;
const rangePattern = new RegExp(
  `^(?:(from|between)\\s+)?(${amount})\\s*(?:[-–]|\\bto\\b|\\band\\b)\\s*(${amount})(?![\\d.])`,
  "i",
);
const comparisonPattern = new RegExp(
  `^(no less than|no more than|greater than|less than|more than|fewer than|higher than|lower than|at least|at most|earlier than|later than|prior to|before|after|under|below|over|above|up to|since|>=|<=|>|<|=)?\\s*(${amount})(\\+|<=|>=|<|>)?(?![\\d.])`,
  "i",
);
const operators = {
  "no less than": "gte",
  "no more than": "lte",
  "greater than": "gt",
  "at least": "gte",
  "at most": "lte",
  "more than": "gt",
  "less than": "lt",
  "fewer than": "lt",
  "higher than": "gt",
  "lower than": "lt",
  "earlier than": "lt",
  "later than": "gt",
  "prior to": "lt",
  before: "lt",
  under: "lt",
  below: "lt",
  after: "gt",
  over: "gt",
  above: "gt",
  "up to": "lte",
  since: "gt",
  ">=": "gte",
  "<=": "lte",
  ">": "gt",
  "<": "lt",
  "=": "eq",
} as const;
const suffixes = { "+": "gte", "<": "gt", ">": "lt", "<=": "gte", ">=": "lte" } as const;

export function numberValue(value: string) {
  return Number(value.replace(/[$,]/g, ""));
}

function inferField(value: string, dictionary: SearchDictionary) {
  const number = numberValue(value);
  const inference = value.includes("$")
    ? "price"
    : /^\d{4}$/.test(value)
      ? "year"
      : number >= 1 && number <= 10 && Number.isInteger(number * 2)
        ? "grade"
        : "price";
  return dictionary.fields.find((field) => field.inference === inference);
}

export function numericToken(
  field: SearchField,
  operator: QueryToken["operator"],
  values: number[],
  text: string,
  direction?: QueryToken["direction"],
): QueryToken {
  const format = (value: number) => `${field.currency ? "$" : ""}${value}`;
  const first = format(values[0]);
  const signs = { eq: "", lt: "<", lte: "≤", gt: ">", gte: "≥", range: "", in: "" };
  let compactLabel = `${signs[operator]}${first}`;
  if (operator === "gte" && !field.currency) compactLabel = `${first}+`;
  if (operator === "range") compactLabel = values.map(format).join("–");
  const words = {
    eq: "",
    lt: field.inference === "year" ? "before " : "under ",
    lte: "at most ",
    gt: field.inference === "year" ? "after " : "over ",
    gte: "at least ",
    range: "",
    in: "",
  };
  let label = `${words[operator]}${first}`;
  if (operator === "range") label = `from ${first} to ${format(values[1])}`;
  if (field.inference === "grade") label = `grade ${compactLabel}`;
  if (operator === "eq" && field.inference === "year") label = `year ${first}`;
  return {
    id: "",
    field: field.key,
    operator,
    values,
    text,
    label,
    compactLabel,
    ...(direction ? { direction } : {}),
  };
}

export function readNumber(input: string, dictionary: SearchDictionary, explicit?: SearchField) {
  const range = input.match(rangePattern);
  if (range) {
    const field = explicit ?? inferField(range[2], dictionary);
    if (!field) return null;
    const values = [numberValue(range[2]), numberValue(range[3])];
    return {
      length: range[0].length,
      token: numericToken(field, "range", values, range[0], values[0] > values[1] ? "desc" : "asc"),
    };
  }
  if (
    /^(from|between)\b/i.test(input) ||
    new RegExp(`^${amount}\\s*(?:[-–]|\\bto\\b|\\band\\b)\\s*$`, "i").test(input)
  )
    return null;
  const match = input.match(comparisonPattern);
  if (!match || (match[1] && match[3])) return null;
  const field = explicit ?? inferField(match[2], dictionary);
  if (!field) return null;
  const namedOperator = match[1]?.toLowerCase();
  if (
    ["before", "after", "earlier than", "later than", "prior to", "since"].includes(
      namedOperator ?? "",
    ) &&
    field.inference !== "year"
  )
    return null;
  const operator = match[3]
    ? suffixes[match[3] as keyof typeof suffixes]
    : (operators[match[1]?.toLowerCase() as keyof typeof operators] ?? "eq");
  return {
    length: match[0].length,
    token: numericToken(field, operator, [numberValue(match[2])], match[0]),
  };
}
