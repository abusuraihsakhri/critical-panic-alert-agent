"use strict";

/* End-to-end check against the PUBLISHED GitHub Pages Python application. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const {chromium} = require("playwright-core");

async function main() {
    const site = process.argv[2];
    if (!site || !/^https?:\/\//.test(site)) {
        throw new Error("Usage: node web/browser-smoke.cjs https://published-site/");
    }
    const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
    const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
    const errors = [];
    try {
        const page = await browser.newPage({acceptDownloads: true});
        page.on("pageerror", e => errors.push(e.message));
        page.on("console", m => {
            if (m.type() === "error") errors.push(m.text());
        });
        await page.goto(site, {waitUntil: "domcontentloaded", timeout: 60000});
        await page.waitForFunction(
            () => document.getElementById("runtime-status")?.textContent.includes("runtime ready"),
            null,
            {timeout: 180000}
        );
        assert.match(await page.locator("#mode-badge").innerText(), /Python/);

        // Enterprise uses the same portable Python rule implementation as the server.
        await page.locator("#run-audit").click();
        await page.waitForFunction(
            () => document.getElementById("outputConsole")?.textContent.includes('"runtime": "Python'),
            null,
            {timeout: 30000}
        );
        let dossier = JSON.parse(await page.locator("#outputConsole").innerText());
        assert.equal(dossier.total_alerts, 3);
        assert.equal(dossier.overall_urgency, "CRITICAL_STAT_PANIC");
        assert.equal(dossier.critical_alerts_count, 1);
        assert.equal(dossier.audit_hash, null);

        // Run original clinical Python classes with different thresholds.
        await page.locator("#engine-mode").selectOption("clinical");
        await page.locator("#is_critical").uncheck();
        await page.locator("#primary_metric").fill("24");
        await page.locator("#secondary_metric").fill("11");
        await page.locator("#status_descriptor").fill("EQUIVOCAL");
        await page.locator("#run-audit").click();
        await page.waitForFunction(
            () => document.getElementById("outputConsole")?.textContent.includes('"runtime": "Python (Pyodide; clinical package)"'),
            null,
            {timeout: 30000}
        );
        dossier = JSON.parse(await page.locator("#outputConsole").innerText());
        assert.equal(dossier.total_alerts, 3);
        assert.equal(dossier.overall_status, "DISCORDANCE_DETECTED");

        // Run the standalone Python coordinator unchanged.
        await page.locator("#engine-mode").selectOption("standalone");
        await page.locator("#status_descriptor").fill("SUSPICIOUS");
        await page.locator("#secondary_metric").fill("13");
        await page.locator("#run-audit").click();
        await page.waitForFunction(
            () => document.getElementById("outputConsole")?.textContent.includes('"runtime": "Python (Pyodide; standalone package)"'),
            null,
            {timeout: 30000}
        );
        dossier = JSON.parse(await page.locator("#outputConsole").innerText());
        assert.equal(dossier.total_alerts, 3);
        assert.equal(dossier.overall_status, "CRITICAL_ACTION_REQUIRED");

        // Genuine csv.DictReader processing and downloadable result.
        await page.locator("#engine-mode").selectOption("enterprise");
        await page.locator("#csv-file").setInputFiles({
            name: "synthetic.csv",
            mimeType: "text/csv",
            buffer: Buffer.from([
                "task_id,target_identifier,primary_metric,secondary_metric,status_descriptor,is_critical_flag",
                "SYN-001,SPECIMEN-001,28.5,14.2,DISCORDANT,true",
                "SYN-002,SPECIMEN-002,12,4,NOMINAL,false",
                "SYN-003,SPECIMEN-003,26,8,NOMINAL,false"
            ].join("\n"))
        });
        await page.locator("#run-batch").click();
        await page.waitForFunction(
            () => document.getElementById("outputConsole")?.textContent.includes('"processed": 3'),
            null,
            {timeout: 30000}
        );
        const summary = JSON.parse(await page.locator("#outputConsole").innerText());
        assert.equal(summary.processed, 3);
        assert.deepEqual(summary.errors, []);
        const downloadPromise = page.waitForEvent("download");
        await page.locator("#download-csv").click();
        const download = await downloadPromise;
        const downloadedCsv = await fs.readFile(await download.path(), "utf8");
        assert.match(downloadedCsv, /overall_status,total_alerts,critical_alerts,result_json/);
        assert.match(downloadedCsv, /SYN-001/);

        await page.locator("#primary_metric").fill("");
        await page.locator("#run-audit").click();
        assert.match(await page.locator("#outputConsole").innerText(), /Primary metric is required/);
        assert.equal(errors.length, 0, "Browser console errors: " + errors.join("; "));
        console.log("PASS: published Pyodide initialized and enterprise, clinical, standalone, CSV export, validation workflows completed");
    } finally {
        await browser.close();
    }
}

main().catch(err => {console.error(err); process.exitCode = 1;});
