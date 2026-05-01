import { loadConfig, saveConfig } from "./config";

async function init() {
  const input = document.getElementById("endpoint") as HTMLInputElement;
  const button = document.getElementById("save") as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLDivElement;
  const cfg = await loadConfig();
  input.value = cfg.endpoint;
  button.addEventListener("click", async () => {
    const endpoint = input.value.trim();
    if (!endpoint) {
      status.className = "err";
      status.textContent = "endpoint cannot be empty";
      return;
    }
    await saveConfig({ endpoint });
    status.className = "ok";
    status.textContent = "saved";
  });
}

init();
