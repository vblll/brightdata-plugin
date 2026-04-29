import fs from "node:fs";
import { describe, expect, it } from "vitest";

type BrightDataManifest = {
  uiHints?: Record<
    string,
    {
      label?: string;
      help?: string;
      tags?: string[];
      advanced?: boolean;
      sensitive?: boolean;
      placeholder?: string;
    }
  >;
  configSchema?: Record<string, unknown>;
};

function lookupManifestConfigSchema(
  manifest: BrightDataManifest,
  path: string,
):
  | {
      path: string;
      hint?: {
        label?: string;
        help?: string;
        tags?: string[];
        advanced?: boolean;
        sensitive?: boolean;
        placeholder?: string;
      };
      schema?: Record<string, unknown>;
    }
  | undefined {
  const prefix = "plugins.entries.brightdata.config.";
  if (!path.startsWith(prefix)) {
    return undefined;
  }
  const localPath = path.slice(prefix.length);
  const segments = localPath.split(".");
  let schema: unknown = manifest.configSchema;

  for (const segment of segments) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return undefined;
    }
    const properties = (schema as { properties?: Record<string, unknown> }).properties;
    if (!properties || !(segment in properties)) {
      return undefined;
    }
    schema = properties[segment];
  }

  return {
    path,
    hint: manifest.uiHints?.[localPath],
    schema:
      schema && typeof schema === "object" && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : undefined,
  };
}

function readBrightDataManifest(): BrightDataManifest {
  return JSON.parse(
    fs.readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"),
  ) as BrightDataManifest;
}

describe("brightdata manifest schema surfaces", () => {
  it("exposes the full shared webSearch config surface", () => {
    const manifest = readBrightDataManifest();
    const configSchema = manifest.configSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    const webSearch = configSchema?.properties?.webSearch as
      | { properties?: Record<string, unknown> }
      | undefined;
    const properties = webSearch?.properties ?? {};

    expect(properties.apiKey).toBeTruthy();
    expect(properties.baseUrl).toMatchObject({ type: "string" });
    expect(properties.serpZone).toMatchObject({ type: "string" });
    expect(properties.customerId).toMatchObject({ type: "string" });
    expect(properties.yandexApiKey).toMatchObject({ type: ["string", "object"] });
    expect(properties.yandexCustomerId).toMatchObject({ type: "string" });
    expect(properties.yandexSerpZone).toMatchObject({ type: "string" });
    expect(properties.unlockerZone).toMatchObject({ type: "string" });
    expect(properties.browserZone).toMatchObject({ type: "string" });
    expect(properties.timeoutSeconds).toMatchObject({ type: "integer", minimum: 1 });
    expect(properties.pollingTimeoutSeconds).toMatchObject({ type: "integer", minimum: 1 });
  });

  it("supports config schema lookup for browser zone paths", () => {
    const manifest = readBrightDataManifest();
    const lookup = lookupManifestConfigSchema(
      manifest,
      "plugins.entries.brightdata.config.webSearch.browserZone",
    );
    expect(lookup?.path).toBe("plugins.entries.brightdata.config.webSearch.browserZone");
    expect(lookup?.hint?.label).toBe("Bright Data Browser Zone");
    expect(lookup?.schema).toMatchObject({ type: "string" });
  });

  it("supports config schema lookup for Yandex SERP zone paths", () => {
    const manifest = readBrightDataManifest();
    const lookup = lookupManifestConfigSchema(
      manifest,
      "plugins.entries.brightdata.config.webSearch.yandexSerpZone",
    );
    expect(lookup?.path).toBe("plugins.entries.brightdata.config.webSearch.yandexSerpZone");
    expect(lookup?.hint?.label).toBe("Bright Data Yandex SERP Zone");
    expect(lookup?.schema).toMatchObject({ type: "string" });
  });
});
