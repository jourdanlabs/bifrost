import { loadConfig, saveConfig } from "./config";

async function init() {
  const input = document.getElementById("endpoint") as HTMLInputElement;
  const save = document.getElementById("save") as HTMLButtonElement;
  const test = document.getElementById("test") as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLSpanElement;

  const cfg = await loadConfig();
  input.value = cfg.endpoint;

  save.addEventListener("click", async () => {
    await saveConfig({ endpoint: input.value.trim() });
    status.className = "ok";
    status.textContent = "saved";
  });

  test.addEventListener("click", async () => {
    status.textContent = "testing...";
    status.className = "";
    try {
      const res = await fetch(input.value.trim(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ output: "ping" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      status.className = "ok";
      status.textContent = `ok (verdict=${json.verdict})`;
    } catch (e) {
      status.className = "err";
      status.textContent = `failed: ${(e as Error).message}`;
    }
  });
}

init();
