const baseUrl = process.env.APP_URL || "http://localhost:3000";

function decodeHtml(value) {
  return value.replaceAll("&quot;", "\"").replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
}

async function getWithCookie(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, html: await response.text() };
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
  const cookie = setCookie.split(";")[0];

  const dashboard = await getWithCookie("/dashboard", cookie);
  const firstAoHref = [...dashboard.html.matchAll(/href="(\/ao\/(?!NC(?:\/|"))[^"]+)"/g)]?.[0]?.[1];
  const detail = firstAoHref ? await getWithCookie(firstAoHref, cookie) : { status: "no-ao-link", html: "" };
  const detailFichePath = firstAoHref ? `${firstAoHref.split("?")[0]}/qualification/fiche.html` : null;
  const fiche = detailFichePath ? await getWithCookie(detailFichePath, cookie) : { status: "no-ao-link", html: "" };
  const settings = await getWithCookie("/settings", cookie);
  const audit = await getWithCookie("/audit", cookie);
  const rules = await getWithCookie("/rules", cookie);
  const chat = await getWithCookie("/chat", cookie);

  const dashboardHtml = dashboard.html;
  const hasNewShell = dashboardHtml.includes("topbar") && dashboardHtml.includes("SiaGPT");
  const hasNewTokens = dashboardHtml.includes("Pipeline AO") || dashboardHtml.includes("kpi-strip");
  const hasGoogleError = dashboardHtml.includes("Connexion Google à finaliser");
  const hasConfigError = dashboardHtml.includes("Aucune source AO chargée");

  const result = {
    loginStatus: postResponse.status,
    dashboardStatus: dashboard.status,
    detailStatus: detail.status,
    ficheStatus: fiche.status,
    settingsStatus: settings.status,
    auditStatus: audit.status,
    rulesStatus: rules.status,
    chatStatus: chat.status,
    chatHasComposer: chat.html.includes("composer"),
    chatHasBubble: chat.html.includes("bubble"),
    ficheHasInterTight: fiche.html.includes("Inter Tight"),
    hasNewShell,
    hasNewTokens,
    hasGoogleError,
    hasConfigError
  };

  console.log(JSON.stringify(result, null, 2));

  const failures = [];
  if (result.dashboardStatus !== 200) failures.push("dashboard not 200");
  if (!hasNewShell) failures.push("dashboard missing topbar/SiaGPT shell");
  if (!hasNewTokens) failures.push("dashboard missing new tokens (Pipeline AO / kpi-strip)");
  if (result.settingsStatus !== 200) failures.push("settings not 200");
  if (result.auditStatus !== 200) failures.push("audit not 200");
  if (result.rulesStatus !== 200) failures.push("rules not 200");
  if (result.chatStatus !== 200) failures.push("chat not 200");
  if (!result.chatHasComposer) failures.push("chat missing composer");
  if (typeof result.detailStatus === "number" && result.detailStatus === 500) failures.push("AO detail 500");
  if (typeof result.ficheStatus === "number" && result.ficheStatus === 500) failures.push("Fiche HTML 500");

  if (failures.length) {
    console.error("Smoke check failed:", failures.join(" · "));
    process.exitCode = 1;
  } else {
    console.log("Smoke check OK");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
