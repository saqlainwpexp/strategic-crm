// Whenever you sign in to LinkedIn (or LinkedIn refreshes your session), send the
// linkedin.com cookies to the CRM running on this PC. Nothing is sent anywhere else.

const CRM = "http://localhost:3000";

async function sync() {
  const cookies = await chrome.cookies.getAll({ domain: "linkedin.com" });
  if (!cookies.some((c) => c.name === "li_at")) {
    await chrome.storage.local.set({ status: { ok: false, message: "Not signed in to LinkedIn yet.", at: Date.now() } });
    return;
  }
  let status;
  try {
    const res = await fetch(`${CRM}/api/linkedin/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies, userAgent: navigator.userAgent }),
      redirect: "manual",
    });
    const data = res.type === "opaqueredirect" ? { error: "Sign in to the CRM in this browser first." } : await res.json().catch(() => ({}));
    status = res.ok ? { ok: true, message: `Connected to ${data.account || "CRM"}`, at: Date.now() } : { ok: false, message: data.error || `CRM error ${res.status}`, at: Date.now() };
  } catch {
    status = { ok: false, message: "CRM isn't running on localhost:3000.", at: Date.now() };
  }
  await chrome.storage.local.set({ status });
}

let timer;
chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (removed || cookie.name !== "li_at" || !cookie.domain.endsWith("linkedin.com")) return;
  clearTimeout(timer);
  timer = setTimeout(sync, 1500); // let the other login cookies land too
});
chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === "sync") sync().then(() => reply(true));
  return true;
});
