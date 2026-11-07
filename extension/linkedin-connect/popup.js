const box = document.getElementById("status");

async function show() {
  const { status } = await chrome.storage.local.get("status");
  if (!status) return (box.textContent = "Not synced yet.");
  box.textContent = status.message;
  box.className = status.ok ? "ok" : "bad";
}

document.getElementById("sync").onclick = async () => {
  box.textContent = "Syncing…";
  box.className = "";
  await chrome.runtime.sendMessage("sync");
  show();
};
show();
