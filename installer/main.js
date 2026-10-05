/**
 * VEYA-AI Installer & Manager — Electron main process
 *
 * No arguments:          Window (install, or manage if already installed)
 * --uninstall:           Window opens straight on "Uninstall" (from Windows → Apps)
 * --repair-silent:       No window. On Windows startup, checks whether Discord is still
 *                        patched after an update, and repairs it if needed.
 * --update:              Started by VEYA inside Discord when a new version is out. Small progress
 *                        window: closes Discord, installs this version with the saved settings,
 *                        starts Discord again.
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const discord = require("./lib/discord");
const sys = require("./lib/system");
const { fs } = discord;

const ARGS = process.argv.slice(1);
const SILENT_REPAIR = ARGS.includes("--repair-silent");
const START_UNINSTALL = ARGS.includes("--uninstall");
const AUTO_UPDATE = ARGS.includes("--update");

// ─── Paths & version ─────────────────────────────────────────────────────────

/** Folder with the finished VEYA build (dist/) and the examples */
function payloadDir() {
    if (app.isPackaged) return path.join(process.resourcesPath, "payload");
    const local = path.join(__dirname, "payload");
    return fs.existsSync(local) ? local : path.join(__dirname, "..");
}

function payloadVersion() {
    try { return JSON.parse(fs.readFileSync(path.join(payloadDir(), "version.json"), "utf8").replace(/^\uFEFF/, "")).version; } catch { }
    try { return require(path.join(__dirname, "..", "package.json")).version; } catch { }
    return app.getVersion();
}

/**
 * Copy the manager (this program) into the install folder so that shortcuts,
 * auto-repair and uninstall work later.
 *  - portable .exe: a single file is enough
 *  - unpacked folder (e.g. win-unpacked): the whole folder is needed (ffmpeg.dll etc.)
 */
function installManager(installDir) {
    if (!app.isPackaged) return null;
    const portable = process.env.PORTABLE_EXECUTABLE_FILE;
    if (portable) {
        const dest = path.join(installDir, "VEYA-AI.exe");
        if (path.resolve(portable).toLowerCase() !== dest.toLowerCase()) fs.copyFileSync(portable, dest);
        return dest;
    }
    const appDir = path.dirname(process.execPath);
    const destDir = path.join(installDir, "app");
    if (path.resolve(appDir).toLowerCase() !== destDir.toLowerCase()) sys.copyDir(appDir, destDir);
    return path.join(destDir, path.basename(process.execPath));
}

/** Save the logo as a real .ico file (for shortcuts and Windows → Apps) */
function installIcon(installDir) {
    try {
        const ico = require("fs").readFileSync(path.join(__dirname, "assets", "veya-logo.ico"));
        const dest = path.join(installDir, "veya.ico");
        fs.writeFileSync(dest, ico);
        return dest;
    } catch { return null; }
}

// ─── Log ─────────────────────────────────────────────────────────────────────

let logFile = null;
function log(...parts) {
    const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
    try { if (logFile) fs.appendFileSync(logFile, line); } catch { }
    console.log(line.trim());
}

// ─── State for the UI ──────────────────────────────────────────────

function getState() {
    const rec = sys.readRecord();
    const installDir = rec?.installDir && fs.existsSync(path.join(rec.installDir, "dist", "patcher.js")) ? rec.installDir : null;
    return {
        installed: !!installDir,
        installedVersion: rec?.version ?? null,
        installDir: installDir ?? sys.DEFAULT_INSTALL_DIR,
        defaultDir: sys.DEFAULT_INSTALL_DIR,
        options: rec?.options ?? null,
        flavors: rec?.flavors ?? null,
        provider: rec?.provider ?? null,
        version: payloadVersion(),
        hasPayload: fs.existsSync(path.join(payloadDir(), "dist", "patcher.js")),
        discords: discord.detect().map(({ id, name, found, version, state }) => ({ id, name, found, version, state })),
        startPage: START_UNINSTALL ? "uninstall" : null,
        platformOk: process.platform === "win32",
    };
}

// ─── Install / repair ───────────────────────────────────────────────

async function install(event, opts) {
    const send = (step, pct, msg) => event.sender.send("install-progress", { step, pct, msg });
    const installDir = path.resolve(opts.installDir || sys.DEFAULT_INSTALL_DIR);
    const repair = !!opts.repair;
    const record = sys.readRecord() || {};
    const options = repair ? (record.options || {}) : (opts.options || {});
    const flavorIds = repair ? (record.flavors || []) : (opts.flavors || []);
    const launched = [];

    try {
        if (process.platform !== "win32") throw new Error("VEYA-AI only supports Windows.");
        if (!sys.canWrite(installDir)) throw new Error(`Can't write to "${installDir}". Pick a folder in your user directory.`);
        logFile = path.join(installDir, "install.log");
        log(repair ? "Repair started" : "Installation started", "→", installDir);

        // 1. Find Discord
        send("ps1", 6, "Looking for Discord…");
        const all = discord.detect();
        const targets = all.filter(d => d.found && flavorIds.includes(d.id));
        if (!targets.length) throw new Error("None of the selected Discord installations were found. Is Discord installed?");
        log("Targets:", targets.map(t => `${t.name} ${t.version} (${t.state})`).join(", "));
        send("ps1", 12, `${targets.map(t => t.name).join(", ")} found`);

        // 2. Close Discord
        send("ps2", 16, "Closing Discord…");
        for (const t of targets) if (await discord.kill(t)) launched.push(t.id);
        send("ps2", 24, launched.length ? "Discord closed" : "Discord wasn't running");

        // 3. Copy files
        send("ps3", 28, "Copying VEYA files…");
        const payload = payloadDir();
        if (!fs.existsSync(path.join(payload, "dist", "patcher.js")))
            throw new Error("The VEYA build is missing from the installer. Please rebuild with build-installer.ps1.");
        sys.copyDir(path.join(payload, "dist"), path.join(installDir, "dist"));
        const exDir = path.join(installDir, "examples");
        if (options.examples && fs.existsSync(path.join(payload, "examples"))) sys.copyDir(path.join(payload, "examples"), exDir);
        else fs.rmSync(exDir, { recursive: true, force: true });

        const managerExe = installManager(installDir);
        const iconFile = installIcon(installDir);
        const version = payloadVersion();
        fs.writeFileSync(path.join(installDir, "veya.json"), JSON.stringify({ version, installedAt: Date.now() }, null, 2));
        send("ps3", 48, "Files copied");

        // 4. Patch Discord
        send("ps4", 52, "Connecting to Discord…");
        const patcher = path.join(installDir, "dist", "patcher.js");
        for (const t of targets) {
            if (t.state === "other") log(`${t.name}: another mod (e.g. Vencord) found – replacing it with VEYA`);
            discord.patch(t, patcher);
            log(`${t.name} patched`);
        }
        send("ps4", 66, "Connected to Discord");

        // 5. Settings & keys
        send("ps5", 70, "Saving settings…");
        if (!repair) {
            sys.writeVencordSettings({ provider: opts.provider, models: opts.models });
            if (await sys.writePendingKeys(installDir, opts.apiKeys)) log("API keys handed over encrypted");
        }
        await sys.removeLegacyRegistry();
        send("ps5", 80, "Settings saved");

        // 6. Shortcuts & autostart
        send("ps6", 84, "Creating shortcuts…");
        if (managerExe) {
            sys.setShortcuts(app, shell, managerExe, options, iconFile);
            sys.setAutostart(app, managerExe, options.autostart);
            await sys.registerUninstall({ managerExe, installDir, version, iconFile });
        }
        sys.writeRecord({
            installDir, version, installedAt: Date.now(), managerExe,
            flavors: targets.map(t => t.id), options,
            provider: repair ? record.provider : opts.provider,
        });
        send("ps6", 94, managerExe ? "Shortcuts created" : "Developer mode – no shortcuts");

        send("ps7", 100, "Done!");
        log("Completed successfully");
        return { ok: true, wasRunning: launched };
    } catch (err) {
        log("ERROR:", err?.stack || err);
        return { ok: false, error: String(err?.message || err), log: logFile, wasRunning: launched };
    }
}

// ─── Uninstall ──────────────────────────────────────────────────────────

async function uninstall(event, { removeData }) {
    const send = (pct, msg) => event.sender.send("uninstall-progress", { pct, msg });
    try {
        const rec = sys.readRecord();
        send(10, "Closing Discord…");
        const all = discord.detect().filter(d => d.found);
        for (const d of all) await discord.kill(d);

        send(35, "Restoring Discord…");
        for (const d of discord.detect()) {
            // Only remove VEYA – another mod (e.g. regular Vencord) is left untouched
            if (d.state === "veya" || (d.found && rec?.flavors?.includes(d.id) && d.state !== "other")) discord.unpatch(d);
        }

        send(60, "Removing shortcuts & autostart…");
        sys.removeShortcuts(app);
        app.setLoginItemSettings({ openAtLogin: false, path: rec?.managerExe || process.execPath, args: ["--repair-silent"], name: "VEYA-AI" });
        await sys.unregisterUninstall();
        await sys.removeLegacyRegistry();

        if (removeData) {
            send(75, "Deleting settings & keys…");
            sys.removeVencordPluginSettings();
            fs.rmSync(sys.DATA_DIR, { recursive: true, force: true });
        } else {
            sys.removeRecord();
        }

        send(90, "Removing files…");
        const dir = rec?.installDir;
        // Safety net: only delete a real VEYA folder
        if (dir && path.basename(dir).toLowerCase() === "veya-ai" && fs.existsSync(path.join(dir, "veya.json"))) {
            for (const entry of fs.readdirSync(dir)) {
                // If the manager is running from here it can't delete itself → deleteAfterExit handles it
                if (entry.toLowerCase() === "veya-ai.exe" || (entry.toLowerCase() === "app" && process.execPath.toLowerCase().startsWith(path.join(dir, "app").toLowerCase()))) continue;
                fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
            }
            sys.deleteAfterExit(dir);
        }
        send(100, "VEYA-AI has been removed.");
        return { ok: true };
    } catch (err) {
        return { ok: false, error: String(err?.message || err) };
    }
}

// ─── Silent repair on Windows startup ─────────────────────────────────────

async function silentRepair() {
    const rec = sys.readRecord();
    if (!rec?.installDir) return;
    logFile = path.join(rec.installDir, "repair.log");
    const patcher = path.join(rec.installDir, "dist", "patcher.js");
    if (!fs.existsSync(patcher)) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        const broken = discord.detect().filter(d => d.found && rec.flavors?.includes(d.id) && d.state !== "veya");
        if (!broken.length) return;
        for (const d of broken) {
            try {
                discord.patch(d, patcher);
                log(`Auto-repair: ${d.name} ${d.version} reconnected`);
            } catch (e) {
                log(`Auto-repair attempt ${attempt} for ${d.name} failed:`, e.message);
            }
        }
        await new Promise(r => setTimeout(r, 20_000));
    }
}

// ─── Update mode (started from VEYA inside Discord) ────────────────────────────

const UPDATE_HTML = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#050505;color:#f4f7ec;font:14px "Segoe UI",sans-serif;display:flex;flex-direction:column;justify-content:center;height:100vh;padding:0 28px;box-sizing:border-box;-webkit-app-region:drag;border:1px solid #2a3313}
h1{font-size:17px;margin:0 0 4px} p{margin:0 0 14px;color:#9aa190;min-height:18px}
.bar{height:8px;border-radius:4px;background:#1b1e16;overflow:hidden}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5fc400,#ccff00);transition:width .3s}
</style><h1>Updating VEYA AI…</h1><p id="m">Starting…</p><div class="bar"><i id="b"></i></div>
<script>window.set=(p,m)=>{document.getElementById("b").style.width=p+"%";document.getElementById("m").textContent=m}</script>`;

async function autoUpdate() {
    const rec = sys.readRecord();
    if (!rec?.installDir) { createWindow(); return; } // not installed yet → normal setup window
    const w = new BrowserWindow({ width: 440, height: 170, frame: false, resizable: false, alwaysOnTop: true, backgroundColor: "#050505", icon: path.join(__dirname, "assets", "veya-logo.ico"), webPreferences: { sandbox: true, contextIsolation: true } });
    await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(UPDATE_HTML));
    const set = (pct, msg) => w.webContents.executeJavaScript(`window.set(${Number(pct) || 0}, ${JSON.stringify(String(msg))})`).catch(() => { });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(1500); // give Discord a moment so the update button's request can finish
    const res = await install({ sender: { send: (_ch, p) => set(p.pct, p.msg) } }, { repair: true, installDir: rec.installDir });
    if (res.ok) {
        set(100, "Done – starting Discord…");
        const ids = res.wasRunning?.length ? res.wasRunning : (rec.flavors || []);
        for (const d of discord.detect().filter(x => x.found && ids.includes(x.id))) { try { discord.launch(d); } catch { } }
        await wait(2500);
    } else {
        set(100, `Update failed: ${res.error}`);
        log("Update failed:", res.error);
        await wait(8000);
    }
    app.quit();
}

// ─── Window ─────────────────────────────────────────────────────────────────

let win = null;

function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 520,
        resizable: false,
        maximizable: false,
        frame: false,
        backgroundColor: "#050505",
        icon: path.join(__dirname, "assets", "veya-logo.ico"),
        title: "VEYA-AI Setup",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        show: false,
    });
    win.loadFile("installer.html");
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", e => e.preventDefault());
    win.once("ready-to-show", () => win.show());
}

if (SILENT_REPAIR) {
    app.whenReady().then(silentRepair).finally(() => app.quit());
} else if (AUTO_UPDATE) {
    if (!app.requestSingleInstanceLock()) app.quit();
    app.whenReady().then(autoUpdate).catch(e => { log("Update error:", e?.stack || e); app.quit(); });
    app.on("window-all-closed", () => app.quit());
} else {
    if (!app.requestSingleInstanceLock()) app.quit();
    app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
    app.whenReady().then(createWindow);
    app.on("window-all-closed", () => app.quit());
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.on("win-close", () => win?.close());
ipcMain.on("win-minimize", () => win?.minimize());
ipcMain.on("open-external", (_e, url) => {
    if (typeof url === "string" && url.startsWith("https://")) shell.openExternal(url);
});

ipcMain.handle("get-state", () => getState());
ipcMain.handle("run-install", (e, opts) => install(e, opts || {}));
ipcMain.handle("run-repair", e => install(e, { repair: true, installDir: sys.readRecord()?.installDir }));
ipcMain.handle("run-uninstall", (e, opts) => uninstall(e, opts || {}));

ipcMain.handle("choose-dir", async (_e, current) => {
    const res = await dialog.showOpenDialog(win, {
        title: "Choose install folder",
        defaultPath: current || sys.DEFAULT_INSTALL_DIR,
        properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    let dir = res.filePaths[0];
    // Always use a dedicated subfolder – so uninstalling never deletes anything else
    if (path.basename(dir).toLowerCase() !== "veya-ai") dir = path.join(dir, "VEYA-AI");
    return { dir, writable: sys.canWrite(path.dirname(dir)) };
});

ipcMain.handle("launch-discord", (_e, ids) => {
    const list = discord.detect().filter(d => d.found && (!ids?.length || ids.includes(d.id)));
    const target = list[0];
    return target ? discord.launch(target) : false;
});

ipcMain.handle("open-log", (_e, file) => {
    if (typeof file === "string" && file.endsWith(".log") && fs.existsSync(file)) shell.openPath(file);
});

ipcMain.handle("quit-after-uninstall", () => app.quit());
