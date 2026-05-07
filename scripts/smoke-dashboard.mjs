const baseUrl = process.env.APP_URL || "http://localhost:3000";

function decodeHtml(value) {
  return value.replaceAll("&quot;", "\"").replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/login`);
  const loginHtml = await loginResponse.text();
  const formData = new FormData();

  for (const match of loginHtml.matchAll(/<input[^>]+>/g)) {
    const input = match[0];
    const name = input.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const value = decodeHtml(input.match(/value="([^"]*)"/)?.[1] || "");
    formData.append(name, value);
  }

  formData.set("email", process.env.APP_USER_EMAIL || "admin@siama.local");
  formData.set("password", process.env.APP_USER_PASSWORD || "admin");

  const postResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    body: formData,
    redirect: "manual"
  });

  const setCookie = postResponse.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Login failed: status ${postResponse.status}`);
  }

  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: setCookie.split(";")[0] }
  });
  const dashboardHtml = await dashboardResponse.text();
  const firstAoHref = [...dashboardHtml.matchAll(/href="(\/ao\/(?!NC(?:\/|"))[^"]+)"/g)]?.[0]?.[1];
  const detailResponse = firstAoHref
    ? await fetch(`${baseUrl}${firstAoHref}`, { headers: { cookie: setCookie.split(";")[0] } })
    : null;
  const settingsResponse = await fetch(`${baseUrl}/settings`, { headers: { cookie: setCookie.split(";")[0] } });
  const auditResponse = await fetch(`${baseUrl}/audit`, { headers: { cookie: setCookie.split(";")[0] } });
  const rulesResponse = await fetch(`${baseUrl}/rules`, { headers: { cookie: setCookie.split(";")[0] } });

  const result = {
    loginStatus: postResponse.status,
    dashboardStatus: dashboardResponse.status,
    detailStatus: detailResponse?.status ?? "no-ao-link",
    settingsStatus: settingsResponse.status,
    auditStatus: auditResponse.status,
    rulesStatus: rulesResponse.status,
    hasDashboard: dashboardHtml.includes("Qualification et pipeline"),
    hasOptorg: dashboardHtml.toLowerCase().includes("optorg"),
    hasGoogleError: dashboardHtml.includes("Connexion Google à finaliser"),
    hasConfigError: dashboardHtml.includes("Configuration Google requise"),
    hasTotals: dashboardHtml.includes("Total AOs suivis")
  };

  console.log(JSON.stringify(result, null, 2));

  if (
    !result.hasDashboard ||
    !result.hasOptorg ||
    result.hasGoogleError ||
    result.hasConfigError ||
    result.settingsStatus !== 200 ||
    result.auditStatus !== 200 ||
    result.rulesStatus !== 200 ||
    result.detailStatus === 500
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
