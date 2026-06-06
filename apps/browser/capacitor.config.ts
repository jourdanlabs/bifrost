import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jourdanlabs.bifrost.browser",
  appName: "BIFROST Browser",
  webDir: "dist",
  bundledWebRuntime: false,
  ios: {
    scheme: "BIFROSTBrowser",
  },
  server: {
    cleartext: false,
  },
};

export default config;
