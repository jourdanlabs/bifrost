export interface BifrostConfig {
  endpoint: string;
  enabled: boolean;
}

export const DEFAULT_CONFIG: BifrostConfig = {
  endpoint: "http://localhost:8787/verify",
  enabled: true,
};

const KEY = "bifrost-config";

export async function loadConfig(): Promise<BifrostConfig> {
  const got = await chrome.storage.sync.get(KEY);
  const stored = got[KEY] as Partial<BifrostConfig> | undefined;
  return { ...DEFAULT_CONFIG, ...(stored ?? {}) };
}

export async function saveConfig(cfg: Partial<BifrostConfig>): Promise<void> {
  const merged = { ...(await loadConfig()), ...cfg };
  await chrome.storage.sync.set({ [KEY]: merged });
}
