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

const YANDEX_NESTED_SERP_MARKDOWN = [
  "[](https://simferopol.1cbit.ru/vacancy/) Simferopol.1cbit.ru simferopol.1cbit.ru › vacancy",
  "[ ## Работа в it-компании и **вакансии** **1****С** в Симферополе от... ](https://simferopol.1cbit.ru/vacancy/)",
  "Требуются сотрудники на постоянную работу как в офисе г. Симферополь, так и удаленно.",
  "[](https://it-vacancies.ru/vacancies/303796/) It-vacancies.ru it-vacancies.ru › vacancies",
  "[ ## **Вакансия** программист **1****с**:**упп**, **1****с**:бух, **1****с**:зиуп в городе... ](https://it-vacancies.ru/vacancies/303796/)",
  "Требуется программист **1****с**:**упп**, **1****с**:бух, **1****с**:зиуп для работы в «SPETZ» в городе Симферополь.",
  "[](https://dzhankoy.cataloxy.ru/rabota/vacancy1096430410_programmist-1s-erp-upp.htm) Dzhankoy.Cataloxy.ru dzhankoy.cataloxy.ru › rabota › vacancy1096430410",
  "[ ## Работа Программист **1****С** (ERP, **УПП**) в Джанкое в компании... ](https://dzhankoy.cataloxy.ru/rabota/vacancy1096430410_programmist-1s-erp-upp.htm)",
  "**Вакансия** в архиве. Завод молочной продукции «НОВАТОР» - ключевая компания в **Крыму** и надежный работодатель.",
  "[](https://sevastopol.gorodrabot.ru/%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%BC%D0%B8%D1%81%D1%82_1%D1%81%D0%B7%D1%83%D0%BF) Sevastopol.Gorodrabot.ru sevastopol.gorodrabot.ru › программист\\_1сзуп",
  "[ ## Работа программистом 1с:зуп в Севастополе — 47 свежих... ](https://sevastopol.gorodrabot.ru/%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%BC%D0%B8%D1%81%D1%82_1%D1%81%D0%B7%D1%83%D0%BF)",
  "**РЕМКОР**. ... сопровождение конфигураций 1С (**УПП** 1.3, БП КОРП 3.0, ЗУП КОРП ... существующего кода",
  "[](https://sevastopol.mjobs.ru/vacancy/490727/) Sevastopol.Mjobs.ru sevastopol.mjobs.ru › vacancy",
  "[ ## Вакансия Программист 1С работа в Севастополе зарплата... ](https://sevastopol.mjobs.ru/vacancy/490727/)",
  'Крупная производственная компания СФ ООО "**РЕМКОР**", специализирующаяся в области судоремонтного производства.',
].join(" ");

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
        params: { url: string; init?: RequestInit; timeoutSeconds?: number },
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

  it("uses a 120 second default timeout for Yandex async search", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; timeoutSeconds?: number },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        expect(params.timeoutSeconds).toBe(120);
        const url = new URL(params.url);
        if (url.pathname === "/serp/yandex/search") {
          return await run({
            response: new Response("", {
              status: 200,
              headers: { "x-response-id": "response-default-timeout" },
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

    await runBrightDataSearch({ query: "lumber yandex default timeout", engine: "yandex" });
  });

  it("keeps the 30 second default timeout for Google search", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_SERP_ZONE = "serp-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; timeoutSeconds?: number },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        expect(params.timeoutSeconds).toBe(30);
        return await run({
          response: new Response(JSON.stringify({ organic: [] }), { status: 200 }),
          finalUrl: params.url,
        });
      },
    );

    await runBrightDataSearch({ query: "lumber google default timeout", engine: "google" });
  });

  it("lets Yandex polling complete after the old 30 second timeout", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";
    vi.useFakeTimers();
    let pollCount = 0;

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
              headers: { "x-response-id": "response-slow-yandex" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          pollCount += 1;
          return await run({
            response:
              pollCount < 35
                ? new Response("", { status: 202 })
                : new Response("[Slow Result](https://example.com/slow)", { status: 200 }),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const resultPromise = runBrightDataSearch({
      query: "lumber yandex slow default",
      engine: "yandex",
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({ count: 1 });
    expect(pollCount).toBe(35);
  });

  it("uses geo location as the Yandex async country", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

    withTrustedWebToolsEndpointMock.mockImplementation(
      async (
        params: { url: string; init?: RequestInit; timeoutSeconds?: number },
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
        params: { url: string; init?: RequestInit; timeoutSeconds?: number },
        run: (result: { response: Response; finalUrl: string }) => Promise<unknown>,
      ) => {
        const url = new URL(params.url);
        expect(params.init?.headers).toMatchObject({ Authorization: "Bearer default-token" });
        expect(params.timeoutSeconds).toBe(120);
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

  it("unwraps Yandex tracker URLs and filters unresolvable tracker noise", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Tracker](https://yandex.kz/an/count/abc?url=https%3A%2F%2Fsupplier.example%2Fcatalog)",
        "[Noise](https://yandex.kz/an/count/empty)",
        "[Search Redirect](https://yandex.kz/an/count/redirect?url=https%3A%2F%2Fyandex.kz%2Fsearch%2F%3Ftext%3Dlumber)",
      ].join("\n"),
    });

    expect(items).toEqual([
      {
        title: "Tracker",
        url: "https://supplier.example/catalog",
        siteName: "supplier.example",
      },
    ]);
  });

  it("removes Yandex ad tracker blocks from descriptions while keeping useful links", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Useful aggregate](https://jobrun.ru/company/remkor) -",
        "[](https://yabs.yandex.kz/count/WmyejI_zOo?mirror-type=1&mirror-doc-pos=-1)",
        "Wazzup24.ru wazzup24.ru › Интеграция-Whatsapp...",
        "[ ## Wazzup - сервис для интеграции WhatsApp с 1С ](https://wazzup24.ru/)",
        "Реклама Wazzup - это сервис для управления продажами в Ватсап из 1С.",
        "Полезная ссылка: [РЕМКОР](https://sevastopol.mjobs.ru/vacancy/490727/) Крупная производственная компания.",
      ].join(" "),
    });

    const aggregate = items.find((item) => item.url === "https://jobrun.ru/company/remkor");
    const remkor = items.find((item) => item.url === "https://sevastopol.mjobs.ru/vacancy/490727/");

    expect(aggregate?.description).toContain("Полезная ссылка");
    expect(aggregate?.description).not.toContain("yabs.yandex");
    expect(aggregate?.description).not.toContain("Реклама");
    expect(aggregate?.description).not.toContain("mirror-type");
    expect(remkor?.title).toBe("РЕМКОР");
  });

  it("removes Yandex internal JSON fragments from descriptions", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Useful aggregate](https://finder.work/company/remkor)",
        '{"1_lsog0":{"state":{"query":"\\"1С:УПП\\" \\"Крым\\" компания","backendUrl":"https://yandex.kz/neuralsearch/api?rdrnd=392692","encryptedCalleeContext":"secret","globalStoreProps":{"advChatParams":{"text":"Реклама"}}},"type":"futuris-search-tab"}}',
        '"feedbackBaseProps":{"metaFields":{"userTestids":"1543013","queryText":"\\"1С:УПП\\"","pageUrl":"https://yandex.kz/search/?text=test"},"featureName":"Футурис серп"}',
        "Обычный полезный сниппет про компанию РЕМКОР.",
      ].join("\n"),
    });

    const aggregate = items.find((item) => item.url === "https://finder.work/company/remkor");

    expect(aggregate?.description).toContain("Обычный полезный сниппет");
    expect(aggregate?.description).not.toContain("backendUrl");
    expect(aggregate?.description).not.toContain("encryptedCalleeContext");
    expect(aggregate?.description).not.toContain("globalStoreProps");
    expect(aggregate?.description).not.toContain("feedbackBaseProps");
    expect(aggregate?.description).not.toContain("userTestids");
    expect(aggregate?.description).not.toContain("futuris-search-tab");
  });

  it("drops remaining Yandex tracker login footer and promo results", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[решения 1С для бизнеса](https://yabs.yandex.kz/count/WhiejI_zOoVX2LbC0cqL01FfdBxMbd029s1Ee8fFWEiD4z2RIy)",
        "[Войти](https://passport.yandex.kz/auth?retpath=https%3A%2F%2Fyandex.kz%2Fsearch)",
        "[Google](//www.google.com/search?q=test)[Bing](//www.bing.com/search?q=test) Сообщить об ошибке Настройки [О компании](https://company.yandex.ru/)",
        "[Сделайте Яндекс основным поиском](https://yandex.kz/search/?text=test)",
        "[Useful](https://finder.work/company/remkor)",
      ].join("\n"),
    });

    expect(items).toEqual([
      {
        title: "Useful",
        url: "https://finder.work/company/remkor",
        siteName: "finder.work",
      },
    ]);
  });

  it("keeps useful Yandex results with business-like settings titles", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Настройки 1С УПП для производства](https://example.com/upp-settings)",
        "Полезный сниппет про внедрение УПП.",
        "[О компании НОВАТОР](https://novator.example/about)",
        "Завод молочной продукции НОВАТОР использует 1С.",
      ].join("\n"),
    });

    expect(items).toEqual([
      {
        title: "Настройки 1С УПП для производства",
        url: "https://example.com/upp-settings",
        description: "Полезный сниппет про внедрение УПП.",
        siteName: "example.com",
      },
      {
        title: "О компании НОВАТОР",
        url: "https://novator.example/about",
        description: "Завод молочной продукции НОВАТОР использует 1С.",
        siteName: "novator.example",
      },
    ]);
  });

  it("drops Yandex tabbar navigation results and not-found search decorations", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[ПоискПоиск](https://yandex.kz/?source=tabbar)",
        "[Карты](https://yandex.kz/maps/?text=upp&source=serp_navig)",
        "[Переводчик](https://translate.yandex.kz/?text=upp&from=tabbar)",
        "[Все](https://yandex.kz/all?text=upp&from=tabbar)",
        "[Useful](https://astral.ru/aj/elem/otlichiya-1s-upp-ot-1s-erp/)",
        "Сравниваем 1С:УПП и 1С:ERP. Не найдено: [крым](/search/?text=%D0%BA%D1%80%D1%8B%D0%BC)",
      ].join("\n"),
    });

    expect(items).toEqual([
      {
        title: "Useful",
        url: "https://astral.ru/aj/elem/otlichiya-1s-upp-ot-1s-erp/",
        description: "Сравниваем 1С:УПП и 1С:ERP.",
        siteName: "astral.ru",
      },
    ]);
  });

  it("drops noisy Yandex tracker parents even when they contain useful nested blocks", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Режим энергосбережения](https://yabs.yandex.kz/count/WkeejI_zOo?etext=2202&q=test) -",
        "[](https://dzen.ru/a/aXdg6ta9h0gSSzd5) Dzen.ru dzen.ru › aXdg6ta9h0gSSzd5",
        "[ ## Крымский парадокс: почему крупные российские... | Дзен ](https://dzen.ru/a/aXdg6ta9h0gSSzd5)",
        "**Яндекс**: присутствие без присутствия. Офис **Яндекса** в Симферополе работает с 2006 года.",
      ].join(" "),
    });

    expect(items).toEqual([
      {
        title: "Крымский парадокс: почему крупные российские... | Дзен",
        url: "https://dzen.ru/a/aXdg6ta9h0gSSzd5",
        description:
          "Яндекс: присутствие без присутствия. Офис Яндекса в Симферополе работает с 2006 года.",
        siteName: "dzen.ru",
      },
    ]);
  });

  it("removes truncated Yandex JSON tails from descriptions", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Useful aggregate](https://sevastopol.jobrun.ru/company/remkor)",
        'Ищете работу программистом 1с 8 в Крыму? Компания РЕМКОР в Севастополе срочно ищет сотрудников... {"1_c0xa0":',
        'Еще полезный текст про вакансию. {"1_3gye0":',
      ].join("\n"),
    });

    const aggregate = items.find(
      (item) => item.url === "https://sevastopol.jobrun.ru/company/remkor",
    );

    expect(aggregate?.description).toContain("Компания РЕМКОР");
    expect(aggregate?.description).toContain("Еще полезный текст");
    expect(aggregate?.description).not.toContain('{"1_c0xa0":');
    expect(aggregate?.description).not.toContain('{"1_3gye0":');
  });

  it("removes the full unbalanced Yandex JSON tail from descriptions", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Useful aggregate](https://sevastopol.jobrun.ru/company/remkor)",
        'Компания РЕМКОР в Севастополе использует УПП 1.3. {"1_mdtv0":{"state":{"foo":"bar"',
      ].join("\n"),
    });

    const aggregate = items.find(
      (item) => item.url === "https://sevastopol.jobrun.ru/company/remkor",
    );

    expect(aggregate?.description).toBe("Компания РЕМКОР в Севастополе использует УПП 1.3.");
  });

  it("expands useful Yandex description links into additional results", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Yandex aggregate](https://yandex.kz/search/?text=lumber)",
        "Каталог поставщиков: [Supplier One](https://supplier-one.example/catalog) продает доску.",
        "Еще вариант: [Supplier Two](https://yandex.kz/an/count/abc?url=https%3A%2F%2Fsupplier-two.example%2Fwood).",
      ].join("\n"),
    });

    expect(items).toMatchObject([
      {
        title: "Supplier One",
        url: "https://supplier-one.example/catalog",
        siteName: "supplier-one.example",
      },
      {
        title: "Supplier Two",
        url: "https://supplier-two.example/wood",
        siteName: "supplier-two.example",
      },
    ]);
    expect(items[0]?.description).toContain("Yandex aggregate");
  });

  it("keeps embedded organic blocks when an earlier Yandex ad marker is closed later", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Yandex aggregate](https://yandex.kz/search/?text=1c)",
        "[](https://yabs.yandex.kz/count/ad?mirror-type=1&mirror-doc-pos=-1)",
        "Wazzup24.ru wazzup24.ru › Интеграция-Whatsapp",
        "[ ## Wazzup - сервис для интеграции WhatsApp с 1С ](https://wazzup24.ru/)",
        "[](https://it-vacancies.ru/vacancies/303796/) It-vacancies.ru it-vacancies.ru › vacancies",
        "[ ## Вакансия программист 1с:упп, 1с:бух, 1с:зиуп в городе... ](https://it-vacancies.ru/vacancies/303796/)",
        "Требуется программист 1с:упп для работы в «SPETZ» в городе Симферополь.",
        "Реклама Wazzup - это сервис для управления продажами в Ватсап из 1С.",
      ].join(" "),
    });

    const spetz = items.find((item) => item.url === "https://it-vacancies.ru/vacancies/303796/");

    expect(spetz?.description).toContain("SPETZ");
    expect(items.some((item) => item.url.includes("yabs.yandex."))).toBe(false);
    expect(items.some((item) => item.url === "https://wazzup24.ru/")).toBe(false);
  });

  it("prioritizes embedded Yandex organic blocks before the aggregate fallback", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: `[Yandex aggregate](https://yandex.kz/search/?text=1c) - ${YANDEX_NESTED_SERP_MARKDOWN}`,
    });

    expect(items[0]?.url).not.toContain("yandex.kz/search");
    expect(items.findIndex((item) => item.url === "https://it-vacancies.ru/vacancies/303796/")).toBeLessThan(
      items.findIndex((item) => item.url === "https://yandex.kz/search/?text=1c"),
    );
  });

  it("drops obvious Yandex video carousel items while keeping vacancy results", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: [
        "[Компания РЕМКОР](https://dreamjob.ru/employers/123)",
        "Отзывы сотрудников о РЕМКОР.",
        "[Видео по запросу РЕМКОР УПП](https://rutube.ru/video/123)",
        "Видео-карусель Яндекса.",
        "[РЕМКОР УПП смотреть онлайн](https://www.youtube.com/watch?v=123)",
        "Видео с результатами поиска.",
        "[Программист 1С РЕМКОР](https://finder.work/vacancies/25059869)",
        "Сопровождение УПП 1.3.",
      ].join("\n"),
    });

    expect(items.map((item) => item.url)).toEqual([
      "https://dreamjob.ru/employers/123",
      "https://finder.work/vacancies/25059869",
    ]);
  });

  it("prioritizes embedded Yandex lead links when count limits the payload", async () => {
    process.env.BRIGHTDATA_API_KEY = "default-token";
    process.env.BRIGHTDATA_CUSTOMER_ID = "customer";
    process.env.BRIGHTDATA_YANDEX_SERP_ZONE = "yandex-zone";

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
              headers: { "x-response-id": "response-aggregate-description" },
            }),
            finalUrl: params.url,
          });
        }
        if (url.pathname === "/serp/get_result") {
          return await run({
            response: new Response(
              `[Yandex aggregate](https://yandex.kz/search/?text=1c) - ${YANDEX_NESTED_SERP_MARKDOWN}`,
              { status: 200 },
            ),
            finalUrl: params.url,
          });
        }
        throw new Error(`Unexpected URL in test mock: ${params.url}`);
      },
    );

    const result = await runBrightDataSearch({
      query: "1c crimea leads",
      engine: "yandex",
      count: 1,
    });
    const results = result.results as Array<{ description?: string; url?: string }>;

    expect(results).toHaveLength(1);
    expect(results[0]?.url).not.toContain("yandex.kz/search");
    expect(results[0]?.description).toContain("Симферополь");
  });

  it("extracts Yandex nested SERP blocks with block-specific descriptions", () => {
    const items = __testing.resolveBrightDataSearchItems({
      engine: "yandex",
      body: `[Yandex aggregate](https://yandex.kz/search/?text=1c) - ${YANDEX_NESTED_SERP_MARKDOWN}`,
    });

    const spetz = items.find((item) => item.url === "https://it-vacancies.ru/vacancies/303796/");
    const novator = items.find((item) =>
      item.url.includes("dzhankoy.cataloxy.ru/rabota/vacancy1096430410"),
    );
    const remkor = items.find((item) =>
      item.url.includes("sevastopol.gorodrabot.ru/%D0%BF%D1%80%D0%BE%D0%B3"),
    );

    expect(spetz?.description).toContain("SPETZ");
    expect(spetz?.description).not.toContain("НОВАТОР");
    expect(novator?.description).toContain("НОВАТОР");
    expect(novator?.description).not.toContain("SPETZ");
    expect(remkor?.description).toContain("РЕМКОР");
    expect(remkor?.description).not.toContain("НОВАТОР");
  });
});
