type BrightDataFormat = "html" | "markdown";

type BrightDataScrapeOptions = {
  dataFormat?: BrightDataFormat;
  country?: string;
};

type FetchLike = typeof fetch;

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function getBrightDataConfigStatus() {
  const token = readEnv("BRIGHT_DATA_API_TOKEN") || readEnv("API_TOKEN");
  const unlockerZone = readEnv("BRIGHT_DATA_UNLOCKER_ZONE") || readEnv("WEB_UNLOCKER_ZONE");
  return {
    configured: Boolean(token && unlockerZone),
    missing: [
      token ? "" : "BRIGHT_DATA_API_TOKEN",
      unlockerZone ? "" : "BRIGHT_DATA_UNLOCKER_ZONE"
    ].filter(Boolean),
    unlockerZone
  };
}

export class BrightDataWebUnlockerClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async scrapeUrl(url: string, options: BrightDataScrapeOptions = {}) {
    const token = readEnv("BRIGHT_DATA_API_TOKEN") || readEnv("API_TOKEN");
    const zone = readEnv("BRIGHT_DATA_UNLOCKER_ZONE") || readEnv("WEB_UNLOCKER_ZONE");
    if (!token || !zone) {
      throw new Error(`Configuration Bright Data incomplète : ${getBrightDataConfigStatus().missing.join(", ")}`);
    }

    const response = await this.fetcher(BRIGHT_DATA_REQUEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        zone,
        url,
        format: "raw",
        data_format: options.dataFormat || "markdown",
        ...(options.country ? { country: options.country } : {})
      })
    });

    if (!response.ok) {
      throw new Error(`Bright Data Web Unlocker HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const payload = (await response.json()) as { body?: string };
    return String(payload.body || "");
  }
}
