import { afterEach, describe, expect, it } from "vitest";
import {
  resolveBrightDataApiToken,
  resolveBrightDataCustomerId,
  resolveBrightDataSerpZone,
  resolveBrightDataYandexApiToken,
  resolveBrightDataYandexCustomerId,
  resolveBrightDataYandexSerpZone,
} from "./config.js";

const ENV_KEYS = [
  "BRIGHTDATA_API_KEY",
  "BRIGHTDATA_API_TOKEN",
  "BRIGHTDATA_SERP_ZONE",
  "BRIGHTDATA_CUSTOMER_ID",
  "BRIGHTDATA_YANDEX_SERP_API_TOKEN",
  "BRIGHTDATA_YANDEX_CUSTOMER_ID",
  "BRIGHTDATA_YANDEX_SERP_ZONE",
] as const;

const ORIGINAL_ENV: Record<(typeof ENV_KEYS)[number], string | undefined> = {
  BRIGHTDATA_API_KEY: process.env.BRIGHTDATA_API_KEY,
  BRIGHTDATA_API_TOKEN: process.env.BRIGHTDATA_API_TOKEN,
  BRIGHTDATA_SERP_ZONE: process.env.BRIGHTDATA_SERP_ZONE,
  BRIGHTDATA_CUSTOMER_ID: process.env.BRIGHTDATA_CUSTOMER_ID,
  BRIGHTDATA_YANDEX_SERP_API_TOKEN: process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN,
  BRIGHTDATA_YANDEX_CUSTOMER_ID: process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID,
  BRIGHTDATA_YANDEX_SERP_ZONE: process.env.BRIGHTDATA_YANDEX_SERP_ZONE,
};

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
});

describe("config resolution", () => {
  it("prefers BRIGHTDATA_API_KEY over BRIGHTDATA_API_TOKEN", () => {
    process.env.BRIGHTDATA_API_KEY = "key-preferred";
    process.env.BRIGHTDATA_API_TOKEN = "token-fallback";
    expect(resolveBrightDataApiToken(undefined)).toBe("key-preferred");
  });

  it("uses configured apiKey before environment variables", () => {
    process.env.BRIGHTDATA_API_KEY = "env-key";
    const config = {
      webSearch: {
        apiKey: "configured-secret",
      },
    };
    expect(resolveBrightDataApiToken(config)).toBe("configured-secret");
  });

  it("resolves serp zone from config and falls back to BRIGHTDATA_SERP_ZONE", () => {
    process.env.BRIGHTDATA_SERP_ZONE = "env-serp";
    expect(resolveBrightDataSerpZone(undefined)).toBe("env-serp");
    expect(resolveBrightDataSerpZone({ webSearch: { serpZone: "config-serp" } })).toBe(
      "config-serp",
    );
  });

  it("resolves customer id from config and falls back to BRIGHTDATA_CUSTOMER_ID", () => {
    process.env.BRIGHTDATA_CUSTOMER_ID = "env-customer";
    expect(resolveBrightDataCustomerId(undefined)).toBe("env-customer");
    expect(resolveBrightDataCustomerId({ webSearch: { customerId: "config-customer" } })).toBe(
      "config-customer",
    );
  });

  it("prefers Yandex-specific config over env and generic fallback", () => {
    process.env.BRIGHTDATA_API_KEY = "env-api";
    process.env.BRIGHTDATA_CUSTOMER_ID = "env-customer";
    process.env.BRIGHTDATA_SERP_ZONE = "env-serp";
    process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN = "env-yandex-api";
    process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID = "env-yandex-customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "env-yandex-serp";

    const config = {
      webSearch: {
        apiKey: "config-api",
        customerId: "config-customer",
        serpZone: "config-serp",
        yandexApiKey: "config-yandex-api",
        yandexCustomerId: "config-yandex-customer",
        yandexSerpZone: "config-yandex-serp",
      },
    };

    expect(resolveBrightDataYandexApiToken(config)).toBe("config-yandex-api");
    expect(resolveBrightDataYandexCustomerId(config)).toBe("config-yandex-customer");
    expect(resolveBrightDataYandexSerpZone(config)).toBe("config-yandex-serp");
  });

  it("falls back from Yandex config to Yandex env and generic config", () => {
    process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN = "env-yandex-api";
    process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID = "env-yandex-customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "env-yandex-serp";

    expect(resolveBrightDataYandexApiToken({ webSearch: { apiKey: "config-api" } })).toBe(
      "env-yandex-api",
    );
    expect(
      resolveBrightDataYandexCustomerId({ webSearch: { customerId: "config-customer" } }),
    ).toBe("env-yandex-customer");
    expect(resolveBrightDataYandexSerpZone({ webSearch: { serpZone: "config-serp" } })).toBe(
      "env-yandex-serp",
    );
  });

  it("falls back from Yandex env to generic values", () => {
    expect(resolveBrightDataYandexApiToken({ webSearch: { apiKey: "config-api" } })).toBe(
      "config-api",
    );
    expect(
      resolveBrightDataYandexCustomerId({ webSearch: { customerId: "config-customer" } }),
    ).toBe("config-customer");
    expect(resolveBrightDataYandexSerpZone({ webSearch: { serpZone: "config-serp" } })).toBe(
      "config-serp",
    );
  });
});
