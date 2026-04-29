import { markdownToText, truncateText } from "openclaw/plugin-sdk/agent-runtime";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  withTrustedWebToolsEndpoint,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-search";
import { logVerbose } from "openclaw/plugin-sdk/runtime-env";
import { wrapExternalContent, wrapWebContent } from "openclaw/plugin-sdk/security-runtime";
import {
  ensureBrightDataZoneExists,
  resetEnsuredBrightDataZones,
  type BrightDataZoneKind,
} from "./brightdata-zone-bootstrap.js";
import {
  type BrightDataPluginConfig,
  DEFAULT_BRIGHTDATA_BASE_URL,
  DEFAULT_BRIGHTDATA_UNLOCKER_ZONE,
  resolveBrightDataApiToken,
  resolveBrightDataBaseUrl,
  resolveBrightDataBrowserZone,
  resolveBrightDataPollingTimeoutSeconds,
  resolveBrightDataScrapeTimeoutSeconds,
  resolveBrightDataSerpZone,
  resolveBrightDataSearchTimeoutSeconds,
  resolveBrightDataUnlockerZone,
  resolveBrightDataYandexApiToken,
  resolveBrightDataYandexCustomerId,
  resolveBrightDataYandexSerpZone,
  resolveBrightDataYandexSearchTimeoutSeconds,
} from "./config.js";

const SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();
const SCRAPE_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();

const DEFAULT_SEARCH_COUNT = 5;
const DEFAULT_SCRAPE_MAX_CHARS = 50_000;
const DEFAULT_ERROR_MAX_BYTES = 64_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

const PENDING_WEB_DATA_STATUSES = new Set(["running", "building", "starting"]);
const READY_WEB_DATA_STATUS = "ready";
const FAILED_WEB_DATA_STATUS = "failed";
const ASYNC_SERP_PENDING_STATUS_CODES = new Set([202, 204]);

export type BrightDataSearchEngine = "google" | "bing" | "yandex";
export type BrightDataScrapeExtractMode = "markdown" | "text" | "html";

type BrightDataSearchItem = {
  title: string;
  url: string;
  description?: string;
  siteName?: string;
};

type CleanGoogleSearchPayload = {
  organic: Array<{
    link: string;
    title: string;
    description: string;
  }>;
};

export type BrightDataSearchParams = {
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig;
  query: string;
  engine?: BrightDataSearchEngine;
  count?: number;
  cursor?: string;
  geoLocation?: string;
  timeoutSeconds?: number;
};

export type BrightDataScrapeParams = {
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig;
  url: string;
  extractMode: BrightDataScrapeExtractMode;
  maxChars?: number;
  timeoutSeconds?: number;
};

export type BrightDataWebDataParams = {
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig;
  datasetId: string;
  input: Record<string, unknown>;
  fixedValues?: Record<string, unknown>;
  triggerParams?: Record<string, string | number | boolean>;
  toolName?: string;
  timeoutSeconds?: number;
  pollingTimeoutSeconds?: number;
  onPollAttempt?: (params: {
    attempt: number;
    total: number;
    snapshotId: string;
  }) => Promise<void> | void;
};

class BrightDataApiError extends Error {
  status: number;
  detail?: string;
  code?: string;

  constructor(message: string, params: { status: number; detail?: string; code?: string }) {
    super(message);
    this.name = "BrightDataApiError";
    this.status = params.status;
    this.detail = params.detail;
    this.code = params.code;
  }
}

function resolveEndpoint(baseUrl: string, pathname: string): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed || DEFAULT_BRIGHTDATA_BASE_URL);
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return new URL(pathname, DEFAULT_BRIGHTDATA_BASE_URL).toString();
  }
}

function appendQueryParams(
  urlRaw: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(urlRaw);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function resolveSiteName(urlRaw: string): string | undefined {
  try {
    const host = new URL(urlRaw).hostname.replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function normalizeSearchCount(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(10, Math.floor(value)));
  }
  return DEFAULT_SEARCH_COUNT;
}

function normalizePageIndex(cursor: string | undefined): number {
  if (typeof cursor !== "string" || !cursor.trim()) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeGeoLocation(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 2 ? trimmed : undefined;
}

export function buildBrightDataSearchUrl(params: {
  query: string;
  engine: BrightDataSearchEngine;
  cursor?: string;
  geoLocation?: string;
}): string {
  const encodedQuery = encodeURIComponent(params.query);
  const page = normalizePageIndex(params.cursor);
  const start = page * 10;
  if (params.engine === "yandex") {
    return `https://yandex.com/search/?text=${encodedQuery}&p=${page}`;
  }
  if (params.engine === "bing") {
    return `https://www.bing.com/search?q=${encodedQuery}&first=${start + 1}`;
  }
  const geoLocation = normalizeGeoLocation(params.geoLocation);
  const geoParam = geoLocation ? `&gl=${geoLocation}` : "";
  return `https://www.google.com/search?q=${encodedQuery}&start=${start}${geoParam}`;
}

function resolveResponseTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).text === "string"
  ) {
    return ((value as Record<string, unknown>).text as string).trim();
  }
  return "";
}

function isAsyncSerpDisabledError(params: { detail: string; code?: string }): boolean {
  const normalized = `${params.code ?? ""} ${params.detail}`.toLowerCase();
  return (
    normalized.includes("async") &&
    (normalized.includes("not enabled") ||
      normalized.includes("enable async") ||
      normalized.includes("isn't enabled") ||
      normalized.includes("not available") ||
      normalized.includes("unsupported"))
  );
}

function throwBrightDataApiError(params: {
  errorLabel: string;
  status: number;
  statusText: string;
  detail: string;
  code?: string;
  unlockerZone?: string;
  serpZone?: string;
  asyncSerp?: boolean;
}): never {
  if (params.code === "client_10100" && params.unlockerZone === DEFAULT_BRIGHTDATA_UNLOCKER_ZONE) {
    throw new BrightDataApiError(
      "Bright Data free-tier usage limit reached for the default mcp_unlocker zone. Create a new Web Unlocker zone and configure BRIGHTDATA_UNLOCKER_ZONE or the Bright Data plugin unlocker zone setting before retrying.",
      {
        status: params.status,
        detail: params.detail || params.statusText,
        code: params.code,
      },
    );
  }
  if (
    params.asyncSerp &&
    params.serpZone &&
    isAsyncSerpDisabledError({ detail: params.detail, code: params.code })
  ) {
    throw new BrightDataApiError(
      `Bright Data SERP zone "${params.serpZone}" does not have async search enabled. Enable async requests in the SERP zone settings, or use a SERP zone that supports async.`,
      {
        status: params.status,
        detail: params.detail || params.statusText,
        code: params.code,
      },
    );
  }
  throw new BrightDataApiError(
    `${params.errorLabel} API error (${params.status}): ${params.detail || params.statusText}`,
    {
      status: params.status,
      detail: params.detail || params.statusText,
      code: params.code,
    },
  );
}

function buildRequestInit(params: {
  method: "GET" | "POST";
  apiToken: string;
  body?: unknown;
  accept?: string;
}): RequestInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiToken}`,
  };
  if (params.accept) {
    headers.Accept = params.accept;
  }
  if (params.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return {
    method: params.method,
    headers,
    ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
  };
}

async function requestBrightDataText(params: {
  baseUrl: string;
  pathname: string;
  apiToken: string;
  timeoutSeconds: number;
  errorLabel: string;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean | undefined>;
  unlockerZone?: string;
  serpZone?: string;
  asyncSerp?: boolean;
}): Promise<string> {
  const response = await requestBrightDataRaw(params);
  return response.text;
}

async function requestBrightDataRaw(params: {
  baseUrl: string;
  pathname: string;
  apiToken: string;
  timeoutSeconds: number;
  errorLabel: string;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean | undefined>;
  unlockerZone?: string;
  serpZone?: string;
  asyncSerp?: boolean;
  accept?: string;
}): Promise<{ text: string; status: number; headers: Headers }> {
  const endpoint = appendQueryParams(
    resolveEndpoint(params.baseUrl, params.pathname),
    params.queryParams,
  );
  return await withTrustedWebToolsEndpoint(
    {
      url: endpoint,
      timeoutSeconds: params.timeoutSeconds,
      init: buildRequestInit({
        method: params.body === undefined ? "GET" : "POST",
        apiToken: params.apiToken,
        body: params.body,
        accept: params.accept ?? "text/plain, text/html, application/json;q=0.8, */*;q=0.5",
      }),
    },
    async ({ response }) => {
      if (response.ok) {
        return {
          text: await response.text(),
          status: response.status,
          headers: response.headers,
        };
      }

      const detail = resolveResponseTextValue(
        await readResponseText(response, { maxBytes: DEFAULT_ERROR_MAX_BYTES }),
      );
      const code = response.headers.get("x-brd-err-code") ?? undefined;
      throwBrightDataApiError({
        errorLabel: params.errorLabel,
        status: response.status,
        statusText: response.statusText,
        detail,
        code,
        unlockerZone: params.unlockerZone,
        serpZone: params.serpZone,
        asyncSerp: params.asyncSerp,
      });
    },
  );
}

async function requestBrightDataJson(params: {
  baseUrl: string;
  pathname: string;
  apiToken: string;
  timeoutSeconds: number;
  errorLabel: string;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean | undefined>;
  unlockerZone?: string;
  serpZone?: string;
  asyncSerp?: boolean;
}): Promise<unknown> {
  const response = await requestBrightDataRaw({
    ...params,
    accept: "application/json",
  });
  if (!response.text.trim()) {
    return null;
  }
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new Error(`${params.errorLabel} API returned invalid JSON.`);
  }
}

async function ensureConfiguredBrightDataZoneExists(params: {
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig;
  kind: BrightDataZoneKind;
  timeoutSeconds?: number;
}): Promise<boolean> {
  const apiToken = resolveBrightDataApiToken(params.pluginConfig);
  if (!apiToken) {
    return false;
  }
  const baseUrl = resolveBrightDataBaseUrl(params.pluginConfig);
  const zoneName =
    params.kind === "browser"
      ? resolveBrightDataBrowserZone(params.pluginConfig)
      : resolveBrightDataUnlockerZone(params.pluginConfig);
  const timeoutSeconds = resolveBrightDataSearchTimeoutSeconds(params.timeoutSeconds);
  return await ensureBrightDataZoneExists({
    requestEndpoint: withTrustedWebToolsEndpoint,
    apiToken,
    baseUrl,
    zoneName,
    kind: params.kind,
    timeoutSeconds,
    onError: (error) => {
      logVerbose(
        `[brightdata] Zone bootstrap failed (${params.kind}/${zoneName}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  });
}

export async function ensureBrightDataUnlockerZoneExists(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
  timeoutSeconds?: number,
): Promise<boolean> {
  return await ensureConfiguredBrightDataZoneExists({
    pluginConfig,
    kind: "unlocker",
    timeoutSeconds,
  });
}

export async function ensureBrightDataBrowserZoneExists(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
  timeoutSeconds?: number,
): Promise<boolean> {
  return await ensureConfiguredBrightDataZoneExists({
    pluginConfig,
    kind: "browser",
    timeoutSeconds,
  });
}

export function cleanGoogleSearchPayload(rawData: unknown): CleanGoogleSearchPayload {
  const data =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};
  const organicRaw = Array.isArray(data.organic) ? data.organic : [];
  const organic = organicRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return undefined;
      }
      const record = entry as Record<string, unknown>;
      const link = typeof record.link === "string" ? record.link.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";
      if (!link || !title) {
        return undefined;
      }
      return { link, title, description };
    })
    .filter((entry): entry is { link: string; title: string; description: string } => !!entry);
  return { organic };
}

function resolveGoogleSearchItems(rawData: unknown): BrightDataSearchItem[] {
  return cleanGoogleSearchPayload(rawData).organic.map((entry) => ({
    title: entry.title,
    url: entry.link,
    description: entry.description || undefined,
    siteName: resolveSiteName(entry.link),
  }));
}

const RESULT_LINK_LINE_RE =
  /^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)?(?:\*\*|__)?\[(.+?)\]\((https?:\/\/[^\s)]+)\)(?:\*\*|__)?(?:\s*(?:[-:|]|[–—])\s*(.+))?$/;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function normalizeMarkdownLine(value: string): string {
  return value
    .replace(/^\s*>\s?/, "")
    .replace(/^(?:[-*+]\s+|\d+\.\s+)/, "")
    .trim();
}

function finalizeMarkdownSearchItem(
  item:
    | {
        title: string;
        url: string;
        descriptionLines: string[];
      }
    | undefined,
): BrightDataSearchItem | undefined {
  if (!item) {
    return undefined;
  }
  const description = item.descriptionLines
    .map((line) => normalizeMarkdownLine(line))
    .filter((line) => !!line && line !== item.url && line !== `<${item.url}>`)
    .join(" ")
    .trim();
  return {
    title: item.title,
    url: item.url,
    description: description || undefined,
    siteName: resolveSiteName(item.url),
  };
}

function dedupeSearchItems(items: BrightDataSearchItem[]): BrightDataSearchItem[] {
  const seen = new Set<string>();
  const deduped: BrightDataSearchItem[] = [];
  for (const item of items) {
    const key = `${item.url}\n${item.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export function resolveMarkdownSearchItems(markdown: string): BrightDataSearchItem[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const items: BrightDataSearchItem[] = [];
  let current:
    | {
        title: string;
        url: string;
        descriptionLines: string[];
      }
    | undefined;

  // Bright Data returns markdown for Bing/Yandex; treat link lines as result boundaries
  // and fold the following text into a single snippet until the next result starts.
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = line.match(RESULT_LINK_LINE_RE);
    if (match) {
      const finalized = finalizeMarkdownSearchItem(current);
      if (finalized) {
        items.push(finalized);
      }
      current = {
        title: match[1].trim(),
        url: match[2].trim(),
        descriptionLines: match[3] ? [match[3].trim()] : [],
      };
      continue;
    }
    if (current) {
      current.descriptionLines.push(rawLine);
    }
  }

  const finalized = finalizeMarkdownSearchItem(current);
  if (finalized) {
    items.push(finalized);
  }
  if (items.length > 0) {
    return dedupeSearchItems(items);
  }

  const fallbackMatches = Array.from(markdown.matchAll(MARKDOWN_LINK_RE));
  const fallbackItems: BrightDataSearchItem[] = [];
  for (const match of fallbackMatches) {
    const title = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    if (!title || !url) {
      continue;
    }
    const siteName = resolveSiteName(url);
    fallbackItems.push(siteName ? { title, url, siteName } : { title, url });
  }
  return dedupeSearchItems(fallbackItems);
}

export function resolveBrightDataSearchItems(params: {
  engine: BrightDataSearchEngine;
  body: string;
}): BrightDataSearchItem[] {
  if (params.engine === "google") {
    try {
      return resolveGoogleSearchItems(JSON.parse(params.body) as unknown);
    } catch {
      return [];
    }
  }
  const items = resolveMarkdownSearchItems(params.body);
  if (params.engine === "yandex") {
    return resolveYandexSearchItems(items);
  }
  return items;
}

function shouldSkipYandexSearchUrl(urlRaw: string): boolean {
  return !resolveYandexSearchUrl(urlRaw);
}

function isYandexHost(host: string): boolean {
  return /(^|\.)yandex\./.test(host.toLowerCase());
}

function isYandexNoiseUrl(urlRaw: string): boolean {
  const lowered = urlRaw.trim().toLowerCase();
  if (!lowered) {
    return true;
  }
  if (lowered.includes("yabs.yandex.") || lowered.includes("passport.yandex.")) {
    return true;
  }
  try {
    const url = new URL(urlRaw);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    if (!isYandexHost(host)) {
      return false;
    }
    return pathname.includes("/search") || /\/(?:an|ad)\/count(?:\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

const YANDEX_REDIRECT_TARGET_PARAMS = [
  "url",
  "u",
  "target",
  "to",
  "redir",
  "redirect",
  "href",
  "cl4url",
];

function decodeUrlCandidate(value: string): string[] {
  const candidates = [value.trim()];
  let current = value.trim();
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current).trim();
      if (!decoded || decoded === current) {
        break;
      }
      candidates.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return candidates;
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function resolveYandexRedirectTarget(url: URL): string | undefined {
  for (const param of YANDEX_REDIRECT_TARGET_PARAMS) {
    const value = url.searchParams.get(param);
    if (!value) {
      continue;
    }
    for (const candidate of decodeUrlCandidate(value)) {
      const normalized = normalizeHttpUrl(candidate);
      if (normalized && !isYandexNoiseUrl(normalized)) {
        return normalized;
      }
    }
  }
  return undefined;
}

function resolveYandexSearchUrl(urlRaw: string): string | undefined {
  const normalized = normalizeHttpUrl(urlRaw);
  if (!normalized) {
    return undefined;
  }
  if (!isYandexNoiseUrl(normalized)) {
    return normalized;
  }
  try {
    return resolveYandexRedirectTarget(new URL(normalized));
  } catch {
    return undefined;
  }
}

function normalizeYandexSearchItem(item: BrightDataSearchItem): BrightDataSearchItem | undefined {
  const url = resolveYandexSearchUrl(item.url);
  if (!url) {
    return undefined;
  }
  return {
    ...item,
    url,
    siteName: resolveSiteName(url),
  };
}

function buildNestedYandexDescription(parent: BrightDataSearchItem, title: string): string {
  const context = (parent.description ?? "")
    .replace(MARKDOWN_LINK_RE, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const description = [parent.title, context].filter((value) => !!value && value !== title).join(": ");
  return description || parent.title;
}

function extractNestedYandexDescriptionItems(parent: BrightDataSearchItem): BrightDataSearchItem[] {
  if (!parent.description) {
    return [];
  }
  const nested: BrightDataSearchItem[] = [];
  for (const match of parent.description.matchAll(MARKDOWN_LINK_RE)) {
    const title = match[1]?.trim() ?? "";
    const rawUrl = match[2]?.trim() ?? "";
    const url = resolveYandexSearchUrl(rawUrl);
    if (!title || !url) {
      continue;
    }
    nested.push({
      title,
      url,
      description: buildNestedYandexDescription(parent, title),
      siteName: resolveSiteName(url),
    });
  }
  return nested;
}

function dedupeYandexSearchItemsByUrl(items: BrightDataSearchItem[]): BrightDataSearchItem[] {
  const seen = new Set<string>();
  const deduped: BrightDataSearchItem[] = [];
  for (const item of items) {
    const key = item.url.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function resolveYandexSearchItems(items: BrightDataSearchItem[]): BrightDataSearchItem[] {
  const expanded: BrightDataSearchItem[] = [];
  for (const item of items) {
    const normalized = normalizeYandexSearchItem(item);
    if (normalized) {
      expanded.push(normalized);
    }
    expanded.push(...extractNestedYandexDescriptionItems(item));
  }
  return dedupeYandexSearchItemsByUrl(expanded);
}

function buildSearchPayload(params: {
  query: string;
  engine: BrightDataSearchEngine;
  cursor?: string;
  geoLocation?: string;
  items: BrightDataSearchItem[];
  tookMs: number;
}): Record<string, unknown> {
  const page = normalizePageIndex(params.cursor);
  return {
    query: params.query,
    provider: "brightdata",
    engine: params.engine,
    count: params.items.length,
    tookMs: params.tookMs,
    cursor: String(page),
    nextCursor: String(page + 1),
    ...(params.geoLocation ? { geoLocation: normalizeGeoLocation(params.geoLocation) } : {}),
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "brightdata",
      wrapped: true,
    },
    results: params.items.map((entry) => ({
      title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
      url: entry.url,
      description: entry.description ? wrapWebContent(entry.description, "web_search") : "",
      ...(entry.siteName ? { siteName: entry.siteName } : {}),
    })),
  };
}

function resolveApiKeyMissingMessage(toolName: string): string {
  return `${toolName} needs a Bright Data API key. Set BRIGHTDATA_API_KEY (preferred) or BRIGHTDATA_API_TOKEN in the Gateway environment, or configure plugins.entries.brightdata.config.webSearch.apiKey.`;
}

function resolveYandexCustomerIdRequired(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const customerId = resolveBrightDataYandexCustomerId(pluginConfig);
  if (!customerId) {
    throw new Error(
      "Bright Data Yandex async search requires a customer ID. Set BRIGHTDATA_YANDEX_CUSTOMER_ID or BRIGHTDATA_CUSTOMER_ID in the environment, or configure plugins.entries.brightdata.config.webSearch.yandexCustomerId.",
    );
  }
  return customerId;
}

function resolveYandexSerpZoneRequired(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const serpZone = resolveBrightDataYandexSerpZone(pluginConfig);
  if (!serpZone) {
    throw new Error(
      "Bright Data Yandex async search requires a SERP zone. Set BRIGHTDATA_YANDEX_SERP_ZONE or BRIGHTDATA_SERP_ZONE in the environment, or configure plugins.entries.brightdata.config.webSearch.yandexSerpZone.",
    );
  }
  return serpZone;
}

function resolveSerpZoneRequired(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const serpZone = resolveBrightDataSerpZone(pluginConfig);
  if (!serpZone) {
    throw new Error(
      "Bright Data search requires a SERP zone. Set BRIGHTDATA_SERP_ZONE in the environment, or configure plugins.entries.brightdata.config.webSearch.serpZone.",
    );
  }
  return serpZone;
}

function buildBrightDataSerpRequestUrl(params: {
  query: string;
  engine: BrightDataSearchEngine;
  cursor?: string;
  geoLocation?: string;
}): string {
  const requestUrlBase = buildBrightDataSearchUrl({
    query: params.query,
    engine: params.engine,
    cursor: params.cursor,
    geoLocation: params.geoLocation,
  });
  return params.engine === "google"
    ? `${requestUrlBase}${requestUrlBase.includes("?") ? "&" : "?"}brd_json=1`
    : requestUrlBase;
}

function buildBrightDataSerpRequestBody(params: {
  requestUrl: string;
  serpZone: string;
  engine: BrightDataSearchEngine;
}): Record<string, unknown> {
  return {
    url: params.requestUrl,
    zone: params.serpZone,
    format: "raw",
    ...(params.engine === "google" ? { data_format: "parsed_light" } : { data_format: "markdown" }),
  };
}

async function runBrightDataYandexAsyncSearch(
  params: BrightDataSearchParams & {
    count: number;
    timeoutSeconds: number;
    baseUrl: string;
    geoLocation?: string;
  },
): Promise<Record<string, unknown>> {
  const apiToken = resolveBrightDataYandexApiToken(params.pluginConfig);
  if (!apiToken) {
    throw new Error(resolveApiKeyMissingMessage("web_search (brightdata)"));
  }
  const customerId = resolveYandexCustomerIdRequired(params.pluginConfig);
  const serpZone = resolveYandexSerpZoneRequired(params.pluginConfig);
  const startedAt = Date.now();

  const submitResponse = await requestBrightDataRaw({
    baseUrl: params.baseUrl,
    pathname: "/serp/yandex/search",
    apiToken,
    timeoutSeconds: params.timeoutSeconds,
    errorLabel: "Bright Data Yandex async submit",
    queryParams: { customer: customerId, zone: serpZone },
    serpZone,
    asyncSerp: true,
    body: {
      country: normalizeGeoLocation(params.geoLocation) ?? "ru",
      query: { text: params.query },
    },
  });
  const responseId = submitResponse.headers.get("x-response-id")?.trim();
  if (!responseId) {
    throw new Error(
      `Bright Data async Yandex search did not return x-response-id for SERP zone "${serpZone}". Ensure async is enabled for that zone and retry.`,
    );
  }

  while (Date.now() - startedAt < params.timeoutSeconds * 1_000) {
    const pollResponse = await requestBrightDataRaw({
      baseUrl: params.baseUrl,
      pathname: "/serp/get_result",
      apiToken,
      timeoutSeconds: params.timeoutSeconds,
      errorLabel: "Bright Data Yandex async result",
      queryParams: { customer: customerId, zone: serpZone, response_id: responseId },
      serpZone,
      asyncSerp: true,
    });
    if (ASYNC_SERP_PENDING_STATUS_CODES.has(pollResponse.status) || !pollResponse.text.trim()) {
      await sleep(DEFAULT_POLL_INTERVAL_MS);
      continue;
    }

    return buildSearchPayload({
      query: params.query,
      engine: "yandex",
      cursor: params.cursor,
      geoLocation: params.geoLocation,
      items: resolveBrightDataSearchItems({ engine: "yandex", body: pollResponse.text }).slice(
        0,
        params.count,
      ),
      tookMs: Date.now() - startedAt,
    });
  }

  throw new Error(
    `Timeout after ${params.timeoutSeconds} seconds waiting for Bright Data async Yandex SERP response (${responseId}).`,
  );
}

export async function runBrightDataSearch(
  params: BrightDataSearchParams,
): Promise<Record<string, unknown>> {
  const engine = params.engine ?? "google";
  const count = normalizeSearchCount(params.count);
  const timeoutSeconds =
    engine === "yandex"
      ? resolveBrightDataYandexSearchTimeoutSeconds(params.timeoutSeconds)
      : resolveBrightDataSearchTimeoutSeconds(params.timeoutSeconds);
  const baseUrl = resolveBrightDataBaseUrl(params.pluginConfig);
  const geoLocation = normalizeGeoLocation(params.geoLocation);

  if (engine === "yandex") {
    const yandexApiToken = resolveBrightDataYandexApiToken(params.pluginConfig);
    if (!yandexApiToken) {
      throw new Error(resolveApiKeyMissingMessage("web_search (brightdata)"));
    }
    const customerId = resolveYandexCustomerIdRequired(params.pluginConfig);
    const serpZone = resolveYandexSerpZoneRequired(params.pluginConfig);
    const cacheKey = normalizeCacheKey(
      JSON.stringify({
        type: "brightdata-search-yandex-async",
        query: params.query,
        engine,
        count,
        cursor: params.cursor ?? "",
        geoLocation: geoLocation ?? "",
        baseUrl,
        customerId,
        serpZone,
      }),
    );
    const cached = readCache(SEARCH_CACHE, cacheKey);
    if (cached) {
      return { ...cached.value, cached: true };
    }
    const result = await runBrightDataYandexAsyncSearch({
      ...params,
      count,
      timeoutSeconds,
      baseUrl,
      geoLocation,
    });
    writeCache(
      SEARCH_CACHE,
      cacheKey,
      result,
      resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES),
    );
    return result;
  }

  const apiToken = resolveBrightDataApiToken(params.pluginConfig);
  if (!apiToken) {
    throw new Error(resolveApiKeyMissingMessage("web_search (brightdata)"));
  }
  const serpZone = resolveSerpZoneRequired(params.pluginConfig);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({
      type: "brightdata-search",
      query: params.query,
      engine,
      count,
      cursor: params.cursor ?? "",
      geoLocation: geoLocation ?? "",
      baseUrl,
      serpZone,
    }),
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }
  const requestUrl = buildBrightDataSerpRequestUrl({
    query: params.query,
    engine,
    cursor: params.cursor,
    geoLocation,
  });
  const startedAt = Date.now();
  const body = await requestBrightDataText({
    baseUrl,
    pathname: "/request",
    apiToken,
    timeoutSeconds,
    errorLabel: "Bright Data Search",
    serpZone,
    body: buildBrightDataSerpRequestBody({
      requestUrl,
      serpZone,
      engine,
    }),
  });
  const result = buildSearchPayload({
    query: params.query,
    engine,
    cursor: params.cursor,
    geoLocation,
    items: resolveBrightDataSearchItems({ engine, body }).slice(0, count),
    tookMs: Date.now() - startedAt,
  });
  writeCache(
    SEARCH_CACHE,
    cacheKey,
    result,
    resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES),
  );
  return result;
}

export async function runBrightDataSearchAsync(
  params: BrightDataSearchParams,
): Promise<Record<string, unknown>> {
  const engine = params.engine ?? "google";
  const count = normalizeSearchCount(params.count);
  const timeoutSeconds =
    engine === "yandex"
      ? resolveBrightDataYandexSearchTimeoutSeconds(params.timeoutSeconds)
      : resolveBrightDataSearchTimeoutSeconds(params.timeoutSeconds);
  const baseUrl = resolveBrightDataBaseUrl(params.pluginConfig);
  const geoLocation = normalizeGeoLocation(params.geoLocation);

  if (engine === "yandex") {
    return await runBrightDataYandexAsyncSearch({
      ...params,
      count,
      timeoutSeconds,
      baseUrl,
      geoLocation,
    });
  }

  const apiToken = resolveBrightDataApiToken(params.pluginConfig);
  if (!apiToken) {
    throw new Error(resolveApiKeyMissingMessage("brightdata_search_batch"));
  }
  const serpZone = resolveSerpZoneRequired(params.pluginConfig);
  const requestUrl = buildBrightDataSerpRequestUrl({
    query: params.query,
    engine,
    cursor: params.cursor,
    geoLocation,
  });
  const startedAt = Date.now();

  const submitResponse = await requestBrightDataRaw({
    baseUrl,
    pathname: "/request",
    apiToken,
    timeoutSeconds,
    errorLabel: "Bright Data Search async submit",
    queryParams: { async: 1 },
    serpZone,
    asyncSerp: true,
    body: buildBrightDataSerpRequestBody({
      requestUrl,
      serpZone,
      engine,
    }),
  });
  const responseId = submitResponse.headers.get("x-response-id")?.trim();
  if (!responseId) {
    throw new Error(
      `Bright Data async search did not return x-response-id for SERP zone "${serpZone}". Ensure async is enabled for that zone and retry.`,
    );
  }

  while (Date.now() - startedAt < timeoutSeconds * 1_000) {
    const pollResponse = await requestBrightDataRaw({
      baseUrl,
      pathname: "/serp/get_result",
      apiToken,
      timeoutSeconds,
      errorLabel: "Bright Data Search async result",
      queryParams: { response_id: responseId },
      serpZone,
      asyncSerp: true,
    });
    if (ASYNC_SERP_PENDING_STATUS_CODES.has(pollResponse.status) || !pollResponse.text.trim()) {
      await sleep(DEFAULT_POLL_INTERVAL_MS);
      continue;
    }

    return buildSearchPayload({
      query: params.query,
      engine,
      cursor: params.cursor,
      geoLocation,
      items: resolveBrightDataSearchItems({ engine, body: pollResponse.text }).slice(0, count),
      tookMs: Date.now() - startedAt,
    });
  }

  throw new Error(
    `Timeout after ${timeoutSeconds} seconds waiting for Bright Data async SERP response (${responseId}).`,
  );
}

function normalizeMarkdownContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseBrightDataScrapeBody(params: {
  body: string;
  url: string;
  extractMode: BrightDataScrapeExtractMode;
  maxChars: number;
}): Record<string, unknown> {
  const normalizedInput =
    params.extractMode === "html" ? params.body.trim() : normalizeMarkdownContent(params.body);
  if (!normalizedInput) {
    throw new Error("Bright Data scrape returned no content.");
  }
  const rawText =
    params.extractMode === "text" ? markdownToText(normalizedInput).trim() : normalizedInput;
  const truncated = truncateText(rawText, params.maxChars);
  const wrappedText = wrapExternalContent(truncated.text, {
    source: "web_fetch",
    includeWarning: false,
  });
  return {
    url: params.url,
    finalUrl: params.url,
    extractor: "brightdata",
    extractMode: params.extractMode,
    externalContent: {
      untrusted: true,
      source: "web_fetch",
      wrapped: true,
    },
    truncated: truncated.truncated,
    rawLength: rawText.length,
    wrappedLength: wrappedText.length,
    text: wrappedText,
  };
}

export async function runBrightDataScrape(
  params: BrightDataScrapeParams,
): Promise<Record<string, unknown>> {
  const apiToken = resolveBrightDataApiToken(params.pluginConfig);
  if (!apiToken) {
    throw new Error(resolveApiKeyMissingMessage("brightdata_scrape"));
  }
  const baseUrl = resolveBrightDataBaseUrl(params.pluginConfig);
  const unlockerZone = resolveBrightDataUnlockerZone(params.pluginConfig);
  const timeoutSeconds = resolveBrightDataScrapeTimeoutSeconds(
    params.pluginConfig,
    params.timeoutSeconds,
  );
  const maxChars = normalizePositiveInteger(params.maxChars, DEFAULT_SCRAPE_MAX_CHARS);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({
      type: "brightdata-scrape",
      url: params.url,
      extractMode: params.extractMode,
      baseUrl,
      unlockerZone,
      maxChars,
    }),
  );
  const cached = readCache(SCRAPE_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }
  await ensureBrightDataUnlockerZoneExists(params.pluginConfig, timeoutSeconds);

  const body = await requestBrightDataText({
    baseUrl,
    pathname: "/request",
    apiToken,
    timeoutSeconds,
    errorLabel: "Bright Data Scrape",
    unlockerZone,
    body: {
      url: params.url,
      zone: unlockerZone,
      format: "raw",
      ...(params.extractMode === "html" ? {} : { data_format: "markdown" }),
    },
  });
  const result = parseBrightDataScrapeBody({
    body,
    url: params.url,
    extractMode: params.extractMode,
    maxChars,
  });
  writeCache(
    SCRAPE_CACHE,
    cacheKey,
    result,
    resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES),
  );
  return result;
}

function stripNullish(value: unknown): unknown {
  if (value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripNullish(entry)).filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = stripNullish(entry);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }
    return result;
  }
  return value;
}

function readSnapshotStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" && status.trim() ? status.trim().toLowerCase() : undefined;
}

function readProgressFailureMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const errorMessage = record.error_message;
  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return errorMessage.trim();
  }
  const message = record.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  return undefined;
}

export function normalizeBrightDataWebDataPayload(params: {
  datasetId: string;
  snapshotId: string;
  payload: unknown;
}): Record<string, unknown> {
  const cleaned = stripNullish(params.payload);
  if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) {
    const record = { ...(cleaned as Record<string, unknown>) };
    if (record.snapshotId === undefined && record.snapshot_id === undefined) {
      record.snapshotId = params.snapshotId;
    }
    if (record.datasetId === undefined && record.dataset_id === undefined) {
      record.datasetId = params.datasetId;
    }
    return record;
  }
  return {
    datasetId: params.datasetId,
    snapshotId: params.snapshotId,
    data: cleaned,
  };
}

function isRetryablePollingError(error: unknown): boolean {
  if (error instanceof BrightDataApiError && error.status === 400) {
    return false;
  }
  if (error instanceof Error && error.message.startsWith("Bright Data dataset run failed")) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBrightDataWebData(
  params: BrightDataWebDataParams,
): Promise<Record<string, unknown>> {
  const apiToken = resolveBrightDataApiToken(params.pluginConfig);
  if (!apiToken) {
    throw new Error(resolveApiKeyMissingMessage("Bright Data web_data tools"));
  }
  const baseUrl = resolveBrightDataBaseUrl(params.pluginConfig);
  const timeoutSeconds = resolveBrightDataSearchTimeoutSeconds(params.timeoutSeconds);
  const pollingTimeoutSeconds = normalizePositiveInteger(
    params.pollingTimeoutSeconds,
    resolveBrightDataPollingTimeoutSeconds(params.pluginConfig),
  );
  const toolName = params.toolName?.trim() || `brightdata_${params.datasetId}`;
  const input = { ...params.input, ...(params.fixedValues ?? {}) };
  const triggerPayload = await requestBrightDataJson({
    baseUrl,
    pathname: "/datasets/v3/trigger",
    apiToken,
    timeoutSeconds,
    errorLabel: `${toolName} trigger`,
    queryParams: {
      dataset_id: params.datasetId,
      include_errors: true,
      ...(params.triggerParams ?? {}),
    },
    body: { input: [input] },
  });

  const snapshotId =
    triggerPayload &&
    typeof triggerPayload === "object" &&
    !Array.isArray(triggerPayload) &&
    typeof (triggerPayload as Record<string, unknown>).snapshot_id === "string"
      ? ((triggerPayload as Record<string, unknown>).snapshot_id as string)
      : "";
  if (!snapshotId) {
    throw new Error("Bright Data dataset trigger returned no snapshot ID.");
  }

  let attempts = 0;
  let lastError: unknown;
  while (attempts < pollingTimeoutSeconds) {
    if (params.onPollAttempt) {
      await params.onPollAttempt({
        attempt: attempts + 1,
        total: pollingTimeoutSeconds,
        snapshotId,
      });
    }
    try {
      const progressPayload = await requestBrightDataJson({
        baseUrl,
        pathname: `/datasets/v3/progress/${encodeURIComponent(snapshotId)}`,
        apiToken,
        timeoutSeconds,
        errorLabel: `${toolName} progress`,
      });
      const status = readSnapshotStatus(progressPayload);
      if (status === FAILED_WEB_DATA_STATUS) {
        const failureMessage = readProgressFailureMessage(progressPayload);
        throw new Error(
          failureMessage
            ? `Bright Data dataset run failed: ${failureMessage}`
            : "Bright Data dataset run failed.",
        );
      }
      if (status !== READY_WEB_DATA_STATUS) {
        if (!status || PENDING_WEB_DATA_STATUSES.has(status)) {
          attempts++;
          await sleep(DEFAULT_POLL_INTERVAL_MS);
          continue;
        }
        attempts++;
        await sleep(DEFAULT_POLL_INTERVAL_MS);
        continue;
      }

      const snapshotPayload = await requestBrightDataJson({
        baseUrl,
        pathname: `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}`,
        apiToken,
        timeoutSeconds,
        errorLabel: `${toolName} snapshot`,
        queryParams: { format: "json" },
      });
      return normalizeBrightDataWebDataPayload({
        datasetId: params.datasetId,
        snapshotId,
        payload: snapshotPayload,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryablePollingError(error)) {
        throw error;
      }
      attempts++;
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
  }

  if (lastError instanceof Error && lastError.message) {
    throw new Error(
      `Timeout after ${pollingTimeoutSeconds} seconds waiting for Bright Data dataset results: ${lastError.message}`,
    );
  }
  throw new Error(
    `Timeout after ${pollingTimeoutSeconds} seconds waiting for Bright Data dataset results.`,
  );
}

export const __testing = {
  ASYNC_SERP_PENDING_STATUS_CODES,
  BrightDataApiError,
  buildBrightDataSerpRequestBody,
  buildBrightDataSerpRequestUrl,
  buildBrightDataSearchUrl,
  cleanGoogleSearchPayload,
  ensureBrightDataBrowserZoneExists,
  ensureBrightDataUnlockerZoneExists,
  isAsyncSerpDisabledError,
  normalizeBrightDataWebDataPayload,
  parseBrightDataScrapeBody,
  readProgressFailureMessage,
  resolveApiKeyMissingMessage,
  resetEnsuredBrightDataZones: () => {
    resetEnsuredBrightDataZones();
  },
  resolveBrightDataSearchItems,
  resolveMarkdownSearchItems,
  resolveYandexSearchUrl,
  shouldSkipYandexSearchUrl,
};
