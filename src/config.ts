import { normalizeSecretInput } from "openclaw/plugin-sdk/provider-auth";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";

export const DEFAULT_BRIGHTDATA_BASE_URL = "https://api.brightdata.com";
export const DEFAULT_BRIGHTDATA_UNLOCKER_ZONE = "mcp_unlocker";
export const DEFAULT_BRIGHTDATA_BROWSER_ZONE = "mcp_browser";
export const DEFAULT_BRIGHTDATA_SEARCH_TIMEOUT_SECONDS = 30;
export const DEFAULT_BRIGHTDATA_SCRAPE_TIMEOUT_SECONDS = 60;
export const DEFAULT_BRIGHTDATA_POLLING_TIMEOUT_SECONDS = 600;

export type BrightDataPluginConfig = {
  webSearch?: {
    apiKey?: unknown;
    baseUrl?: string;
    serpZone?: string;
    customerId?: string;
    yandexApiKey?: unknown;
    yandexCustomerId?: string;
    yandexSerpZone?: string;
    unlockerZone?: string;
    browserZone?: string;
    timeoutSeconds?: number;
    pollingTimeoutSeconds?: number;
  };
};

type BrightDataWebSearchConfig = BrightDataPluginConfig["webSearch"];

function resolvePluginConfig(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): BrightDataPluginConfig | undefined {
  if (!pluginConfig || typeof pluginConfig !== "object" || Array.isArray(pluginConfig)) {
    return undefined;
  }
  return pluginConfig as BrightDataPluginConfig;
}

export function resolveBrightDataSearchConfig(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): BrightDataWebSearchConfig {
  const webSearch = resolvePluginConfig(pluginConfig)?.webSearch;
  if (!webSearch || typeof webSearch !== "object" || Array.isArray(webSearch)) {
    return undefined;
  }
  return webSearch;
}

function normalizeConfiguredSecret(value: unknown, path: string): string | undefined {
  return normalizeSecretInput(
    normalizeResolvedSecretInputString({
      value,
      path,
    }),
  );
}

function readConfiguredString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveBrightDataApiToken(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  return (
    normalizeConfiguredSecret(search?.apiKey, "plugins.entries.brightdata.config.webSearch.apiKey") ||
    normalizeSecretInput(process.env.BRIGHTDATA_API_KEY) ||
    normalizeSecretInput(process.env.BRIGHTDATA_API_TOKEN) ||
    undefined
  );
}

export function resolveBrightDataBaseUrl(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.baseUrl) ||
    normalizeSecretInput(process.env.BRIGHTDATA_BASE_URL) ||
    "";
  return configured || DEFAULT_BRIGHTDATA_BASE_URL;
}

export function resolveBrightDataUnlockerZone(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.unlockerZone) ||
    normalizeSecretInput(process.env.BRIGHTDATA_UNLOCKER_ZONE) ||
    "";
  return configured || DEFAULT_BRIGHTDATA_UNLOCKER_ZONE;
}

export function resolveBrightDataSerpZone(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.serpZone) ||
    normalizeSecretInput(process.env.BRIGHTDATA_SERP_ZONE) ||
    "";
  return configured || undefined;
}

export function resolveBrightDataCustomerId(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.customerId) ||
    normalizeSecretInput(process.env.BRIGHTDATA_CUSTOMER_ID) ||
    "";
  return configured || undefined;
}

export function resolveBrightDataYandexApiToken(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  return (
    normalizeConfiguredSecret(
      search?.yandexApiKey,
      "plugins.entries.brightdata.config.webSearch.yandexApiKey",
    ) ||
    normalizeSecretInput(process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN) ||
    resolveBrightDataApiToken(pluginConfig)
  );
}

export function resolveBrightDataYandexCustomerId(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.yandexCustomerId) ||
    normalizeSecretInput(process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID) ||
    "";
  return configured || resolveBrightDataCustomerId(pluginConfig);
}

export function resolveBrightDataYandexSerpZone(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string | undefined {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.yandexSerpZone) ||
    normalizeSecretInput(process.env.BRIGHTDATA_YANDEX_SERP_ZONE) ||
    "";
  return configured || resolveBrightDataSerpZone(pluginConfig);
}

export function resolveBrightDataBrowserZone(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): string {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  const configured =
    readConfiguredString(search?.browserZone) ||
    normalizeSecretInput(process.env.BRIGHTDATA_BROWSER_ZONE) ||
    "";
  return configured || DEFAULT_BRIGHTDATA_BROWSER_ZONE;
}

export function resolveBrightDataSearchTimeoutSeconds(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  return DEFAULT_BRIGHTDATA_SEARCH_TIMEOUT_SECONDS;
}

export function resolveBrightDataBrowserTimeoutSeconds(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const search = resolveBrightDataSearchConfig(pluginConfig);
  if (
    typeof search?.timeoutSeconds === "number" &&
    Number.isFinite(search.timeoutSeconds) &&
    search.timeoutSeconds > 0
  ) {
    return Math.floor(search.timeoutSeconds);
  }
  return DEFAULT_BRIGHTDATA_SEARCH_TIMEOUT_SECONDS;
}

export function resolveBrightDataScrapeTimeoutSeconds(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const search = resolveBrightDataSearchConfig(pluginConfig);
  if (
    typeof search?.timeoutSeconds === "number" &&
    Number.isFinite(search.timeoutSeconds) &&
    search.timeoutSeconds > 0
  ) {
    return Math.floor(search.timeoutSeconds);
  }
  return DEFAULT_BRIGHTDATA_SCRAPE_TIMEOUT_SECONDS;
}

export function resolveBrightDataPollingTimeoutSeconds(
  pluginConfig?: Record<string, unknown> | BrightDataPluginConfig,
): number {
  const search = resolveBrightDataSearchConfig(pluginConfig);
  if (
    typeof search?.pollingTimeoutSeconds === "number" &&
    Number.isFinite(search.pollingTimeoutSeconds) &&
    search.pollingTimeoutSeconds > 0
  ) {
    return Math.floor(search.pollingTimeoutSeconds);
  }
  return DEFAULT_BRIGHTDATA_POLLING_TIMEOUT_SECONDS;
}
