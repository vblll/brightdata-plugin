<p align="center">
  <img src="assets/brightdata-logo.png" height="48" alt="Bright Data" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/openclaw-logo.png" height="108" alt="OpenClaw" />
</p>

<h1 align="center">Bright Data Plugin for OpenClaw</h1>

<p align="center">
  <strong>Web search · Scraping · Browser automation · 50+ structured data tools</strong><br/>
  Powered by <a href="https://brightdata.com">Bright Data</a> — the world's leading web data platform
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@brightdata/brightdata-plugin"><img src="https://img.shields.io/npm/v/@brightdata/brightdata-plugin?color=0066CC&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@brightdata/brightdata-plugin"><img src="https://img.shields.io/npm/dm/@brightdata/brightdata-plugin?color=0066CC" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" /></a>
  <a href="https://brightdata.com"><img src="https://img.shields.io/badge/Bright%20Data-Powered-orange" alt="Bright Data Powered" /></a>
</p>

---

## What This Plugin Does

This plugin brings the full power of Bright Data's infrastructure directly into your OpenClaw agent — no manual API wiring, no proxies to configure. Install once, and your agent gains:

- **Real-time web search** via Google, Bing, and Yandex with geo-targeting
- **Bot-bypass scraping** through Bright Data Web Unlocker — handles CAPTCHAs, JS rendering, and rate limits automatically
- **Full browser automation** via a real Chromium instance routed through Bright Data's residential proxy network
- **50+ structured data tools** for Amazon, LinkedIn, Instagram, TikTok, YouTube, Reddit, and more — no parsing required

---

## Install

```bash
openclaw plugins install @brightdata/brightdata-plugin
```

---

## Configure

Get your API key at [brightdata.com](https://brightdata.com) → Account → API Token.

```bash
# Option A — environment variables
export BRIGHTDATA_API_KEY=your_api_key_here              # preferred
export BRIGHTDATA_SERP_ZONE=your_existing_serp_zone      # required for search tools

# Option B — OpenClaw config (recommended for persistent setups)
openclaw config set plugins.entries.brightdata.config.webSearch.apiKey your_api_key_here
openclaw config set plugins.entries.brightdata.config.webSearch.serpZone your_existing_serp_zone
```

> `brightdata_search` and `brightdata_search_batch` require a configured SERP zone. The plugin does not auto-create SERP zones.
> Unlocker (`mcp_unlocker`) and browser (`mcp_browser`) zones are still auto-created on first use if missing.

To use existing zones instead:

```bash
export BRIGHTDATA_UNLOCKER_ZONE=my_existing_zone
export BRIGHTDATA_BROWSER_ZONE=my_existing_browser_zone
export BROWSER_AUTH='brd-customer-<customer>-zone-<zone>:<password>'  # optional browser fast-path
```

---

## Tools Overview

**66 tools** across five categories:

| Category | Count | What it does |
|----------|------:|-------------|
| [Search](#-search) | 2 | Real-time SERP results from Google, Bing, Yandex |
| [Scrape](#-scrape) | 1 | Full-page extraction with bot bypass |
| [Batch](#-batch-operations) | 2 | Parallel search and scrape up to 5 at a time |
| [Browser](#-browser-automation) | 14 | Full browser control via residential proxies |
| [Web Data](#-web-data--50-platforms) | 47 | Structured data from 47 platforms |

---

## Search

The plugin registers automatically as an OpenClaw **web search provider** — it appears alongside other providers in the search provider selection UI.

### `brightdata_search`

Search Google, Bing, or Yandex and get structured results back.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | **Required.** Search query |
| `engine` | `"google" \| "bing" \| "yandex"` | Search engine (default: `google`) |
| `count` | `number` | Results to return, 1–10 |
| `cursor` | `string` | Pagination cursor for next page |
| `geo_location` | `string` | 2-letter ISO country code (e.g. `"us"`, `"de"`) |
| `timeoutSeconds` | `number` | Request timeout override; Yandex defaults to 120s because async SERP responses can take 40s+ |

Yandex results are normalized from Bright Data markdown: Yandex tracker/search/login URLs are filtered or best-effort unwrapped, and useful links nested inside long SERP snippets are expanded into standard results.

### `brightdata_search_batch`

Run up to 5 search queries in parallel via async SERP (`async=1` submit + `serp/get_result` polling). Partial failures are returned inline without failing the whole batch.

---

## Scrape

### `brightdata_scrape`

Fetch any page through Bright Data Web Unlocker. Works on bot-protected sites, JavaScript-rendered pages, and geo-restricted content.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | **Required.** HTTP/HTTPS URL to scrape |
| `extractMode` | `"markdown" \| "text" \| "html"` | Output format (default: `markdown`) |
| `maxChars` | `number` | Maximum characters to return (min: 100) |
| `timeoutSeconds` | `number` | Request timeout override |

### `brightdata_scrape_batch`

Scrape up to 5 URLs in parallel with the same extraction options.

---

## Browser Automation

Full Chromium browser control routed through Bright Data's residential proxy network. Sessions are automatically scoped per user context and idle-timeout after 5 minutes. Each `brightdata_browser_navigate` call starts a fresh scoped session and closes any previous one for that scope.

| Tool | Description |
|------|-------------|
| `brightdata_browser_navigate` | Navigate to a URL (optional country routing) |
| `brightdata_browser_snapshot` | Capture an ARIA snapshot with interactive element refs |
| `brightdata_browser_click` | Click an element by its snapshot ref |
| `brightdata_browser_type` | Type into a field by ref (optional Enter to submit) |
| `brightdata_browser_fill_form` | Fill multiple form fields in a single operation |
| `brightdata_browser_screenshot` | Take a screenshot (viewport or full page) |
| `brightdata_browser_get_html` | Get current page HTML |
| `brightdata_browser_get_text` | Get current page text content |
| `brightdata_browser_scroll` | Scroll to bottom of page |
| `brightdata_browser_scroll_to` | Scroll to a specific element by ref |
| `brightdata_browser_wait_for` | Wait for an element to become visible |
| `brightdata_browser_network_requests` | List network requests since page load |
| `brightdata_browser_go_back` | Compatibility stub: returns unsupported-operation guidance |
| `brightdata_browser_go_forward` | Compatibility stub: returns unsupported-operation guidance |

---

## Web Data — 50+ Platforms

Structured data from real pages via Bright Data datasets. Each tool accepts a `url` or `keyword` and returns clean, typed JSON — no scraping, no parsing.

<details>
<summary><strong>E-commerce (10 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_amazon_product` | Product details, pricing, specs |
| `brightdata_amazon_product_reviews` | Customer reviews and ratings |
| `brightdata_amazon_product_search` | Search results with rankings |
| `brightdata_walmart_product` | Product details and availability |
| `brightdata_walmart_seller` | Seller profile and metrics |
| `brightdata_ebay_product` | Listing details and bids |
| `brightdata_homedepot_products` | Product catalog and pricing |
| `brightdata_zara_products` | Fashion catalog data |
| `brightdata_etsy_products` | Handmade and vintage listings |
| `brightdata_bestbuy_products` | Electronics catalog and deals |

</details>

<details>
<summary><strong>Professional Networks (7 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_linkedin_person_profile` | Full person profile |
| `brightdata_linkedin_company_profile` | Company overview and stats |
| `brightdata_linkedin_job_listings` | Open positions with details |
| `brightdata_linkedin_posts` | Post content and engagement |
| `brightdata_linkedin_people_search` | People search results |
| `brightdata_crunchbase_company` | Funding, investors, founders |
| `brightdata_zoominfo_company_profile` | Company intelligence data |

</details>

<details>
<summary><strong>Social Media (17 tools)</strong></summary>

**Instagram**
| Tool | Data |
|------|------|
| `brightdata_instagram_profiles` | Profile stats and bio |
| `brightdata_instagram_posts` | Post content and engagement |
| `brightdata_instagram_reels` | Reel metadata and views |
| `brightdata_instagram_comments` | Comment threads |

**Facebook**
| Tool | Data |
|------|------|
| `brightdata_facebook_posts` | Post content and reactions |
| `brightdata_facebook_marketplace_listings` | Marketplace items |
| `brightdata_facebook_company_reviews` | Page reviews and ratings |
| `brightdata_facebook_events` | Event details and attendance |

**TikTok**
| Tool | Data |
|------|------|
| `brightdata_tiktok_profiles` | Creator profile and stats |
| `brightdata_tiktok_posts` | Video content and metrics |
| `brightdata_tiktok_shop` | TikTok Shop product data |
| `brightdata_tiktok_comments` | Comment threads |

**X (Twitter)**
| Tool | Data |
|------|------|
| `brightdata_x_posts` | Post content and metrics |
| `brightdata_x_profile_posts` | Profile post history |

**YouTube & Reddit**
| Tool | Data |
|------|------|
| `brightdata_youtube_profiles` | Channel stats and info |
| `brightdata_youtube_videos` | Video details and metrics |
| `brightdata_youtube_comments` | Comment threads |
| `brightdata_reddit_posts` | Post content and scores |

</details>

<details>
<summary><strong>Maps, Shopping & Apps (4 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_google_maps_reviews` | Location reviews and ratings |
| `brightdata_google_shopping` | Shopping results and prices |
| `brightdata_google_play_store` | App details and reviews |
| `brightdata_apple_app_store` | App details and reviews |

</details>

<details>
<summary><strong>Finance, News & Code (3 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_reuter_news` | Reuters news articles |
| `brightdata_yahoo_finance_business` | Company financials and news |
| `brightdata_github_repository_file` | Repository file contents |

</details>

<details>
<summary><strong>Real Estate & Travel (2 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_zillow_properties_listing` | Property listings and estimates |
| `brightdata_booking_hotel_listings` | Hotel listings and pricing |

</details>

<details>
<summary><strong>AI Insights (3 tools)</strong></summary>

| Tool | Data |
|------|------|
| `brightdata_chatgpt_ai_insights` | ChatGPT responses |
| `brightdata_grok_ai_insights` | Grok responses |
| `brightdata_perplexity_ai_insights` | Perplexity responses |

</details>

---

## Configuration Reference

All settings can be provided via OpenClaw config and environment variables.

| Setting | Environment Variable | Config Path | Default |
|---------|---------------------|-------------|---------|
| API Key | `BRIGHTDATA_API_KEY` or `BRIGHTDATA_API_TOKEN` | `...webSearch.apiKey` | **required** (`BRIGHTDATA_API_KEY` preferred when both env vars are set) |
| Base URL | `BRIGHTDATA_BASE_URL` | `...webSearch.baseUrl` | `https://api.brightdata.com` |
| SERP Zone | `BRIGHTDATA_SERP_ZONE` | `...webSearch.serpZone` | **required for search** |
| Customer ID | `BRIGHTDATA_CUSTOMER_ID` | `...webSearch.customerId` | optional |
| Yandex API Key | `BRIGHTDATA_YANDEX_SERP_API_TOKEN` | `...webSearch.yandexApiKey` | generic API key |
| Yandex Customer ID | `BRIGHTDATA_YANDEX_CUSTOMER_ID` | `...webSearch.yandexCustomerId` | generic customer ID |
| Yandex SERP Zone | `BRIGHTDATA_YANDEX_SERP_ZONE` | `...webSearch.yandexSerpZone` | generic SERP zone |
| Unlocker Zone | `BRIGHTDATA_UNLOCKER_ZONE` | `...webSearch.unlockerZone` | `mcp_unlocker` |
| Browser Zone | `BRIGHTDATA_BROWSER_ZONE` | `...webSearch.browserZone` | `mcp_browser` (ignored if `BROWSER_AUTH` is set) |
| Browser Auth Override | `BROWSER_AUTH` | — | unset |
| Request Timeout | — | `...webSearch.timeoutSeconds` | `30s` Google/Bing search, `120s` Yandex search, `60s` scrape |
| Polling Timeout | — | `...webSearch.pollingTimeoutSeconds` | `600s` |

> Config paths are prefixed with `plugins.entries.brightdata.config`.

---

## Plugin Management

```bash
# Install
openclaw plugins install @brightdata/brightdata-plugin

# Verify installation and loaded tools
openclaw plugins inspect brightdata

# Update to latest version
openclaw plugins update brightdata

# Temporarily disable
openclaw plugins disable brightdata

# Re-enable
openclaw plugins enable brightdata

# Uninstall
openclaw plugins uninstall brightdata
```

---

## Requirements

- OpenClaw installed and running
- A [Bright Data account](https://brightdata.com) with API key
- Node.js 22+ (managed by OpenClaw)

---

## License

MIT © [Bright Data](https://brightdata.com)
