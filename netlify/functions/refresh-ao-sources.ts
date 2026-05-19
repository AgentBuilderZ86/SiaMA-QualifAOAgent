const SITE_URL = process.env.URL || process.env.DEPLOY_URL || "http://localhost:3000";

export default async () => {
  const endpoint = new URL("/api/refresh-ao-sources", SITE_URL);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-ao-refresh-secret": process.env.AO_REFRESH_SECRET || "",
      "user-agent": "siama-ao-scheduled-refresh"
    }
  });

  const body = await response.text();
  if (!response.ok) {
    console.error("[scheduled-refresh-ao-sources]", response.status, body);
    return new Response(body || "Refresh failed", { status: response.status });
  }

  console.log("[scheduled-refresh-ao-sources]", body);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
