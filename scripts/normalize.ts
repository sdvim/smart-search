import type { Collectible } from "../src/demo/collectibles.ts";

export type SourceRecord = Partial<Collectible> & {
  id: string;
  title: string;
  source_urls: string[];
  attributes?: { name: string; value: string }[];
};

const subjectPattern = /\b(slaking|pikachu|alakazam)(?:\s+(ex|vmax|vstar|v|gx))?\b/i;
const subjectPatternGlobal = new RegExp(subjectPattern.source, "ig");
const graderPattern =
  /\b(PSA|CGC|SGC|BGS|AGS|TAG|HGA|CSG|GMA|VGA|ACE|KSA|MNT|Beckett)\s+(\d+(?:\.\d+)?)\b\s*([^)]*)/i;

export function inferProperties(title: string) {
  const properties: string[] = [];
  const patterns: [RegExp, string][] = [
    [/reverse holo/i, "reverse holo"],
    [/cosmos holo/i, "cosmos holo"],
    [/(?:1st|first) edition/i, "first edition"],
    [/ultra rare/i, "ultra rare"],
    [/super rare/i, "super rare"],
    [/secret rare/i, "secret rare"],
    [/full art/i, "full art"],
  ];
  for (const [pattern, property] of patterns) if (pattern.test(title)) properties.push(property);
  if (/\bholo\b/i.test(title) && !properties.some((property) => property.includes("holo")))
    properties.push("holo");
  return properties;
}

export function normalizeRecord(source: SourceRecord): Collectible | null {
  const attributes = Object.fromEntries(
    (source.attributes ?? []).map((attribute) => [attribute.name, attribute.value]),
  );
  const titleMatches = [...source.title.matchAll(subjectPatternGlobal)];
  const titleSubjectMatch = titleMatches.at(-1);
  const subjectMatch = attributes["Title/Subject"]?.match(subjectPattern) ?? titleSubjectMatch;
  if (!subjectMatch || /\bseaking\b/i.test(source.title)) return null;
  if (subjectMatch[1].toLowerCase() === "pikachu" && /\bdetective pikachu\b/i.test(source.title)) {
    const cardNumber = source.title.match(/#(?=[A-Za-z0-9])[^\s)]+/);
    const matchEnd = (titleSubjectMatch?.index ?? -1) + (titleSubjectMatch?.[0].length ?? 0);
    const distance = cardNumber?.index !== undefined ? cardNumber.index - matchEnd : 0;
    if (distance > 10) return null;
  }
  const grading = source.title.match(graderPattern);
  const grade = source.grade ?? Number.parseFloat(attributes.Grade ?? grading?.[2] ?? "");
  const grader = source.grader ?? attributes.Grader ?? grading?.[1];
  if (!grader || !Number.isFinite(grade) || grade < 1 || grade > 10) return null;
  const subjectName = subjectMatch[1].toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
  const variant = subjectMatch[2]?.toLowerCase();
  const subject = `${subjectName}${variant ? ` ${variant === "ex" ? variant : variant.toUpperCase()}` : ""}`;
  const year =
    source.year ?? Number(attributes.Year ?? source.title.match(/\b(?:19|20)\d{2}\b/)?.[0]);
  if (!Number.isFinite(year)) return null;
  const setName =
    (attributes.Set ?? source.set_name ?? source.title.slice(0, subjectMatch.index ?? 0))
      .replace(/^\d{4}\s+/, "")
      .replace(/^Pok[eé]mon\s+/i, "")
      .replace(/^Japanese\s+/i, "")
      .replace(/^(?:Scarlet & Violet|Sword & Shield|Sun & Moon|Black & White|DP|SV|EX)\s+/i, "")
      .replace(
        /\s+(?:(?:1st|first) Edition|Reverse Holo|Holo|Ultra Rare|Full Art|Super Rare|Triple Whammy Tin).*$/i,
        "",
      )
      .replace(/\s+-\s+.*$/, "")
      .trim() || "Unknown set";
  const record: Collectible = {
    id: source.id,
    title: source.title,
    category: "Pokémon",
    subject,
    set_number:
      source.set_number ?? attributes["Card Number"] ?? source.title.match(/#([\d/]+)/)?.[1] ?? "",
    set_name: setName,
    language: /japanese/i.test(attributes.Language ?? source.title) ? "jp" : "en",
    year,
    grader: grader.toUpperCase(),
    grade,
    grader_label:
      source.grader_label ??
      (attributes.Grade ?? grading?.[0] ?? "")
        .replace(/^(?:[A-Za-z]+)?\s*\d+(?:\.\d+)?\s*/i, "")
        .trim(),
    properties: source.properties ?? inferProperties(`${source.title} ${attributes[""] ?? ""}`),
    source_urls: source.source_urls,
  };
  const cert = source.grader_cert_id ?? attributes.Serial;
  if (cert) record.grader_cert_id = cert;
  if (typeof source.fair_market_value === "number")
    record.fair_market_value = source.fair_market_value;
  if (typeof source.listed_value === "number") record.listed_value = source.listed_value;
  if (source.image_url) record.image_url = source.image_url;
  return record;
}

export function deduplicate(records: Collectible[]) {
  const unique = new Map<string, Collectible>();
  for (const record of records) {
    const key = record.grader_cert_id
      ? `${record.grader}:${record.grader_cert_id}`
      : (record.image_url ?? record.id);
    const previous = unique.get(key);
    if (!previous) unique.set(key, record);
    else
      unique.set(key, {
        ...record,
        ...previous,
        listed_value: previous.listed_value ?? record.listed_value,
        fair_market_value: previous.fair_market_value ?? record.fair_market_value,
        source_urls: [...new Set([...previous.source_urls, ...record.source_urls])],
      });
  }
  return [...unique.values()];
}
