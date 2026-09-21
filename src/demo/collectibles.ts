import type { SearchField, SearchRecord } from "../search/types.ts";

export type Collectible = SearchRecord & {
  title: string;
  category: string;
  subject: string;
  set_number: string;
  set_name: string;
  language: string;
  year: number;
  grader: string;
  grade: number;
  grader_label: string;
  grader_cert_id?: string;
  fair_market_value?: number;
  listed_value?: number;
  properties: string[];
  image_url?: string;
  lqip_base64?: string;
  source_urls: string[];
};

export const collectibleFields: SearchField[] = [
  { key: "category", aliases: ["category", "c"], kind: "category", priority: 8 },
  { key: "subject", aliases: ["subject"], kind: "category", match: "family", priority: 0 },
  {
    key: "price",
    aliases: ["price", "p"],
    kind: "number",
    inference: "price",
    currency: true,
    fallbackKeys: ["listed_value", "fair_market_value"],
    sortAliases: {
      asc: ["cheapest", "low to high"],
      desc: ["most expensive", "high to low"],
    },
    priority: 1,
  },
  { key: "grade", aliases: ["grade", "g"], kind: "number", inference: "grade", priority: 2 },
  { key: "year", aliases: ["year", "y"], kind: "number", inference: "year", priority: 3 },
  {
    key: "properties",
    aliases: ["is", "property", "properties"],
    kind: "category",
    match: "all",
    prefix: "is",
    priority: 4,
  },
  {
    key: "set_name",
    aliases: ["in", "set", "set_name"],
    kind: "category",
    prefix: "in",
    priority: 5,
  },
  { key: "grader", aliases: ["grader"], kind: "category", priority: 6 },
  {
    key: "language",
    aliases: ["language", "lang"],
    valueAliases: { japanese: "jp", english: "en" },
    kind: "category",
    priority: 7,
  },
  {
    key: "set_number",
    aliases: ["number", "set_number"],
    kind: "identifier",
    inference: "number",
    priority: 9,
  },
  {
    key: "grader_cert_id",
    aliases: ["cert", "grader_cert_id"],
    kind: "identifier",
    inference: "certificate",
    priority: 10,
  },
  { key: "ownership", aliases: ["ownership"], kind: "category", priority: 11 },
  {
    key: "listing",
    aliases: ["listing"],
    kind: "category",
    priority: 12,
    presenceKeys: ["listed_value"],
    presenceValues: ["listed", "for sale"],
  },
];

export const demoUser = { wallet_balance: 398.28 };

export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
