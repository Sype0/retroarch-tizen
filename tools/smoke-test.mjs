// Headless smoke test: drive the launcher with "remote" keys the way a TV
// would, boot cores and make sure RetroArch renders without errors.
//
// Usage: node smoke-test.mjs <site url> <rom folder url> [tizenbrew-like url]
//   - scenario "menu": boot the first core straight into the RetroArch menu
//   - scenario "rom":  load a ROM through the network-folder browser
//   - scenario "remote-assets": served from 127.0.0.1 like TizenBrew, so
//     cores and the bundle come cross-origin from GitHub Pages
import { chromium } from "playwright";

const [siteUrl, romUrl, tbUrl] = process.argv.slice(2);
const browser = await chromium.launch();
let failed = false;

async function scenario(name, url, steps) {
   const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
   const logs = [];
   page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
   page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
   const shot = (n) => page.screenshot({ path: `shot-${name}-${n}.png` });
   try {
      await page.goto(url);
      await page.waitForSelector(".tile.focused");
      await steps(page, shot);
      const errors = await page.$eval("#errors", (e) => e.textContent);
      if (errors.trim()) throw new Error("on-screen errors:\n" + errors);
      if (!logs.some((l) => /\[INFO\] RetroArch/.test(l))) throw new Error("RetroArch did not start");
      console.log(`PASS ${name}`);
   } catch (e) {
      failed = true;
      console.error(`FAIL ${name}: ${e.stack || e}`);
      await shot("error").catch(() => {});
   }
   console.log(`--- ${name} log (tail) ---\n` + logs.slice(-40).join("\n"));
   await page.close();
}

async function bootMenu(page, shot) {
   await shot("1-home");
   await page.keyboard.press("Enter"); // first system (FCEUmm)
   await page.waitForSelector("#screen-source.active");
   for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown"); // last entry: menu
   await page.keyboard.press("Enter");
   await page.waitForSelector("body.playing", { timeout: 180000 });
   await page.waitForTimeout(8000);
   await shot("2-menu");
   await page.keyboard.press("ArrowDown");
   await page.waitForTimeout(300);
   await page.keyboard.press("ArrowDown");
   await page.waitForTimeout(1000);
   await shot("3-menu-nav");
}

await scenario("menu", siteUrl, bootMenu);

await scenario("rom", siteUrl, async (page, shot) => {
   await page.keyboard.press("Enter"); // FCEUmm
   await page.waitForSelector("#screen-source.active");
   await page.keyboard.press("Enter"); // network folder (first entry without USB)
   await page.waitForSelector("#screen-url.active");
   await page.fill("#url-input", romUrl);
   await page.keyboard.press("Enter");
   await page.waitForSelector("#screen-browser.active .item.focused");
   await shot("1-browser");
   await page.keyboard.press("Enter"); // first ROM
   await page.waitForSelector("body.playing", { timeout: 180000 });
   await page.waitForTimeout(6000);
   await shot("2-game");
   // Red key on the remote opens the RetroArch menu
   await page.evaluate(() => {
      for (const type of ["keydown", "keyup"]) {
         const e = new KeyboardEvent(type, { bubbles: true });
         Object.defineProperty(e, "keyCode", { get: () => 403 });
         window.dispatchEvent(e);
      }
   });
   await page.waitForTimeout(1500);
   await shot("3-quickmenu");
});

if (tbUrl) await scenario("remote-assets", tbUrl, bootMenu);

await browser.close();
process.exit(failed ? 1 : 0);
