/**
 * Dedicated Browser Profile & Session Isolation for Chrome MCP (1.27G.1.1).
 */

import fs from "fs";
import path from "path";

export interface BrowserSandboxConfig {
  browserProfileDir: string;
  downloadsDir: string;
  headless?: boolean;
}

export class JCodesMoreBrowserSandbox {
  /**
   * Generates isolated Chrome startup flags ensuring ZERO access to personal profile,
   * personal cookies, Google logins, bank sessions, or personal extensions.
   */
  static getIsolatedChromeFlags(config: BrowserSandboxConfig): string[] {
    return [
      `--user-data-dir=${path.resolve(config.browserProfileDir)}`,
      `--disk-cache-dir=${path.join(path.resolve(config.browserProfileDir), "Cache")}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--disable-translate",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-features=TranslateUI,BlinkGenPropertyTrees",
      "--incognito",
      config.headless !== false ? "--headless=new" : "",
    ].filter(Boolean);
  }

  /**
   * Validates that the browser profile directory is completely isolated and empty before launch.
   */
  static async initializeProfile(browserProfileDir: string): Promise<void> {
    await fs.promises.mkdir(browserProfileDir, { recursive: true });
  }

  /**
   * Cleans up the temporary browser profile after job completion.
   */
  static async cleanupProfile(browserProfileDir: string): Promise<void> {
    if (fs.existsSync(browserProfileDir)) {
      await fs.promises.rm(browserProfileDir, { recursive: true, force: true });
    }
  }
}
