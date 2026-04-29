import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing, runBrightDataSearch, runBrightDataSearchAsync } from "./brightdata-client.js";

const { withTrustedWebToolsEndpointMock } = vi.hoisted(() => ({
  withTrustedWebToolsEndpointMock: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/provider-web-search", async () => {
  const actual = await vi.importActual<typeof import("openclaw/plugin-sdk/provider-web-search")>(
    "openclaw/plugin-sdk/provider-web-search",
  );
  return {
    ...actual,
    withTrustedWebToolsEndpoint: withTrustedWebToolsEndpointMock,
  };
});

const ORIGINAL_ENV = {
  BRIGHTDATA_API_KEY: process.env.BRIGHTDATA_API_KEY,
  BRIGHTDATA_SERP_ZONE: process.env.BRIGHTDATA_SERP_ZONE,
  BRIGHTDATA_CUSTOMER_ID: process.env.BRIGHTDATA_CUSTOMER_ID,
  BRIGHTDATA_YANDEX_SERP_API_TOKEN: process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN,
  BRIGHTDATA_YANDEX_CUSTOMER_ID: process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID,
  BRIGHTDATA_YANDEX_SERP_ZONE: process.env.BRIGHTDATA_YANDEX_SERP_ZONE,
};

beforeEach(() => {
  withTrustedWebToolsEndpointMock.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  if (ORIGINAL_ENV.BRIGHTDATA_API_KEY === undefined) {
    delete process.env.BRIGHTDATA_API_KEY;
  } else {
    process.env.BRIGHTDATA_API_KEY = ORIGINAL_ENV.BRIGHTDATA_API_KEY;
  }
  if (ORIGINAL_ENV.BRIGHTDATA_SERP_ZONE === undefined) {
    delete process.env.BRIGHTDATA_SERP_ZONE;
  } else {
    process.env.BRIGHTDATA_SERP_ZONE = ORIGINAL_ENV.BRIGHTDATA_SERP_ZONE;
  }
  if (ORIGINAL_ENV.BRIGHTDATA_CUSTOMER_ID === undefined) {
    delete process.env.BRIGHTDATA_CUSTOMER_ID;
  } else {
    process.env.BRIGHTDATA_CUSTOMER_ID = ORIGINAL_ENV.BRIGHTDATA_CUSTOMER_ID;
  }
  if (ORIGINAL_ENV.BRIGHTDATA_YANDEX_SERP_API_TOKEN === undefined) {
    delete process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN;
  } else {
    process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN =
      ORIGINAL_ENV.BRIGHTDATA_YANDEX_SERP_API_TOKEN;
  }
  if (ORIGINAL_ENV.BRIGHTDATA_YANDEX_CUSTOMER_ID === undefined) {
    delete process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID;
  } else {
    process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID = ORIGINAL_ENV.BRIGHTDATA_YANDEX_CUSTOMER_ID;
  }
  if (ORIGINAL_ENV.BRIGHTDATA_YANDEX_SERP_ZONE === undefined) {
    delete process.env.BRIGHTDATA_YANDEX_SERP_ZONE;
  } else {
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = ORIGINAL_ENV.BRIGHTDATA_YANDEX_SERP_ZONE;
  }
  vi.useRealTimers();
});

describe("brightdata client helpers", () => {
  it("builds SERP request body with explicit serp zone", () => {
    expect(
      __testing.buildBrightDataSerpRequestBody({
        requestUrl: "https://www.google.com/search?q=openclaw&brd_json=1",
        serpZone: "my_serp_zone",
        engine: "google",
      }),
    ).toEqual({
      url: "https://www.google.com/search?q=openclaw&brd_json=1",
      zone: "my_serp_zone",
      format: "raw",
      data_format: "parsed_light",
    });
  });

  it("detects async-serp-disabled errors", () => {
    expect(
      __testing.isAsyncSerpDisabledError({
        detail: "Async mode is not enabled for this zone",
      }),
    ).toBe(true);
    expect(
      __testing.isAsyncSerpDisabledError({
        detail: "Some other validation error",
      }),
    ).toBe(false);
  });

  it("extracts dataset progress failure messages", () => {
    expect(__testing.readProgressFailureMessage({ error_message: "zone suspended" })).toBe(
      "zone suspended",
    );
    expect(__testing.readProgressFailureMessage({ message: "snapshot is empty" })).toBe(
      "snapshot is empty",
    );
    expect(__testing.readProgressFailureMessage({})).toBeUndefined();
  });

  it("fails search with a targeted error when no serp zone is configured", async () => {
    process.env.BRIGHTDATA_API_KEY = "key";
    delete process.env.BRIGHTDATA_SERP_ZONE;
    await expect(
      runBrightDataSearch({
        query: "test",
      }),
    ).rejects.toThrow("Bright Data search requires a SERP zone");
  });

  it("routes Yandex search through async submit and poll endpoints", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "generic-customer";
    process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN = "yandex-token";
    process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID = "yandex-customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; init?: RequestInit },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        if (url.pathname === "/serp/yandex/search") {
          expect(url.searchParams.get("customer")).toBe("yandex-customer");
          expect(url.searchParams.get("zone")).toBe("yandex-zone");
          expect(params.init?.headers).toMatchObject({ Authorization: "Bearer yandex-token" });
          expect(JSON.parse(String(params.init?.body ?? ""))).toEqual({
            country: "ru",
            query: { text: "lumber yandex async" },
          });
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-123" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          expect(url.searchParams.get("customer")).toBe("yandex-customer");
          expect(url.searchParams.get("zone")).toBe("yandex-zone");
          expect(url.searchParams.get("response_id")).toBe("response-123");
          return await run({
            response: new Response("[Result](https://example.com)\nSnippet", { status: 200 }),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const result = await runBrightDataSearch({
      query: "lumber yandex async",
      engine: "yandex",
      count: 5,
    });

    expect(result).toMatchObject({
      query: "lumber yandex async",
      provider: "brightdata",
      engine: "yandex",
      count: 1,
    });
    expect(withTrustedWebToolsEndpointMock).toHaveBeenCalledTimes(2);
  });

  it("uses geo location as the Yandex async country", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; init?: RequestInit },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        if (url.pathname === "/serp/yandex/search") {
          expect(JSON.parse(String(params.init?.body ?? ""))).toMatchObject({ country: "tr" });
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-geo" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          return await run({
            response: new Response("[Result](https://example.com)", { status: 200 }),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    await runBrightDataSearch({ query: "lumber geo", engine: "yandex", geoLocation: "tr" });
  });

  it("routes batch Yandex search through async submit and poll endpoints with generic token fallback", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";
    delete process.env.BRIGHTDATA_YANDEX_SERP_API_TOKEN;

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; init?: RequestInit },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        expect(params.init?.headers).toMatchObject({ Authorization: "Bearer default-token" });
        if (url.pathname === "/serp/yandex/search") {
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-batch" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          expect(url.searchParams.get("customer")).toBe("customer");
          expect(url.searchParams.get("zone")).toBe("yandex-zone");
          expect(url.searchParams.get("response_id")).toBe("response-batch");
          return await run({
            response: new Response("[Batch](https://example.com/batch)", { status: 200 }),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const result = await runBrightDataSearchAsync({
      query: "lumber batch",
      engine: "yandex",
    });

    expect(result).toMatchObject({
      query: "lumber batch",
      engine: "yandex",
      count: 1,
    });
    expect(withTrustedWebToolsEndpointMock).toHaveBeenCalledTimes(2);
  });

  it("throws when Yandex async submit omits x-response-id", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        return await run({
          response: new Response("accepted without id", { status: 200 }),
          finalUrl: params.url,
        });
      },
    );

    await expect(runBrightDataSearch({ query: "lumber no response id", engine: "yandex" })).rejects.toThrow(
      "x-response-id",
    );
  });

  it("continues Yandex polling on pending or blank responses", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";
    vi.useFakeTimers();

    const pollResponses = [
      new Response("", { status: 202 }),
      new Response("   ", { status: 200 }),
      new Response(null, { status: 204 }),
      new Response("[Result](https://example.com)", { status: 200 }),
    ];

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        if (url.pathname === "/serp/yandex/search") {
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-pending" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          return await run({
            response: pollResponses.shift() ?? new Response("[Result](https://example.com)"),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const resultPromise = runBrightDataSearch({
      query: "lumber pending",
      engine: "yandex",
      timeoutSeconds: 5,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({ count: 1 });
    expect(withTrustedWebToolsEndpointMock).toHaveBeenCalledTimes(5);
  });

  it("times out with response id while waiting for Yandex results", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";
    vi.useFakeTimers();

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        if (url.pathname === "/serp/yandex/search") {
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-timeout" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          return await run({
            response: new Response("", { status: 202 }),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const resultPromise = expect(
      runBrightDataSearch({ query: "lumber timeout", engine: "yandex", timeoutSeconds: 1 }),
    ).rejects.toThrow("response-timeout");
    await vi.runAllTimersAsync();
    await resultPromise;
  });

  it("requires customer id for Yandex async search", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";
    delete process.env.BRIGHTDATA_CUSTOMER_ID;
    delete process.env.BRIGHTDATA_YANDEX_CUSTOMER_ID;

    await expect(runBrightDataSearch({ query: "lumber missing customer", engine: "yandex" })).rejects.toThrow(
      "BRIGHTDATA_YANDEX_CUSTOMER_ID",
    );
  });

  it("filters Yandex ad login and search URLs from markdown results", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Ad](https://yabs.yandex.ru/count/abc)",
        "[Login](https://passport.yandex.com/auth)",
        "[Search](https://yandex.ru/search/?text=lumber)",
        "[Normal](https://example.com/path)",
      ].join("\n"),
    });

    expect(items).toEqual([
      {
        title: "Normal",
        url: "https://example.com/path",
        siteName: "example.com",
      },
    ]);
  });
});
