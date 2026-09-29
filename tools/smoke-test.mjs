// Headless smoke test: drive the launcher with "remote" keys, boot a core into
// the RetroArch menu and make sure it renders without errors.
// Usage: node tools/smoke-test.mjs http://localhost:8000/
import { chromium } from "playwright";

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

let failed = false;
try {
   await page.goto(url);
   await page.waitForSelector(".tile.focused");
   await page.screenshot({ path: "shot-1-home.png" });

   await page.keyboard.press("Enter"); // first system
   await page.waitForSelector("#screen-source.active");
   // "RetroArch menüsünü aç" is the last entry
   for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
   await page.screenshot({ path: "shot-2-source.png" });
   await page.keyboard.press("Enter");

   await page.waitForSelector("body.playing", { timeout: 120000 });
   await page.waitForTimeout(8000);
   await page.screenshot({ path: "shot-3-menu.png" });

   // Remote: down twice, OK -> should navigate RGUI
   await page.keyboard.press("ArrowDown");
   await page.waitForTimeout(300);
   await page.keyboard.press("ArrowDown");
   await page.waitForTimeout(1000);
   await page.screenshot({ path: "shot-4-menu-nav.png" });

   const errors = await page.$eval("#errors", (e) => e.textContent);
   if (errors.trim()) {
      console.error("On-screen errors:\n" + errors);
      failed = true;
   }
   const started = logs.some((l) => /RetroArch|\[INFO\]/.test(l));
   if (!started) {
      console.error("No RetroArch log output seen");
      failed = true;
   }
} catch (e) {
   console.error(e);
   failed = true;
   await page.screenshot({ path: "shot-error.png" }).catch(() => {});
}
console.log(logs.slice(-80).join("\n"));
await browser.close();
process.exit(failed ? 1 : 0);
