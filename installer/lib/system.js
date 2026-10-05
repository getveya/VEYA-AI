/**
 * Windows integration: paths, Vencord settings, encrypted key handover,
 * shortcuts, autostart, entry under "Apps & Features".
 */

const { execFile } = require("child_process");
const path = require("path");
const { fs, run } = require("./discord");

const APPDATA = process.env.APPDATA || "";
const LOCALAPPDATA = process.env.LOCALAPPDATA || "";

const DEFAULT_INSTALL_DIR = path.join(LOCALAPPDATA, "VEYA-AI");
const DATA_DIR = path.join(APPDATA, "VEYA-AI");            // Keys (from the plugin) + install.json
const INSTALL_RECORD = path.join(DATA_DIR, "install.json");
const VENCORD_SETTINGS = path.join(APPDATA, "Vencord", "settings", "settings.json");
const UNINSTALL_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VEYA-AI";
const START_MENU_LNK = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "VEYA-AI.lnk");

// ─── Install record ─────────────────────────────────────────────────

function readRecord() {
    try { return JSON.parse(fs.readFileSync(INSTALL_RECORD, "utf8")); } catch { return null; }
}

function writeRecord(rec) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INSTALL_RECORD, JSON.stringify(rec, null, 2));
}

function removeRecord() {
    try { fs.unlinkSync(INSTALL_RECORD); } catch { }
}

/** Checks whether a folder is writable (without admin rights) */
function canWrite(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        const probe = path.join(dir, `.veya-probe-${process.pid}`);
        fs.writeFileSync(probe, "ok");
        fs.unlinkSync(probe);
        return true;
    } catch { return false; }
}

function copyDir(src, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

// ─── Vencord settings ───────────────────────────────────────────────────

/** Enable the VEYA plugin and set provider/models – existing settings are kept */
function writeVencordSettings({ provider, models }) {
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(VENCORD_SETTINGS, "utf8")) || {}; } catch { }
    settings.plugins = settings.plugins || {};
    const veya = settings.plugins["VEYA-AI"] || {};
    veya.enabled = true;
    if (provider) veya.aiProvider = provider;
    const map = { claude: "modelClaude", openai: "modelOpenAI", gemini: "modelGemini", deepseek: "modelDeepSeek", xai: "modelXai", mistral: "modelMistral", groq: "modelGroq", openrouter: "modelOpenRouter" };
    for (const [p, key] of Object.entries(map)) if (models && models[p]) veya[key] = models[p];
    veya.modelsMigrated = true;
    // Never store old plain-text keys here
    delete veya.apiKeyClaud; delete veya.apiKeyOpenAI; delete veya.apiKeyGemini; delete veya.apiKeyDeepSeek;
    settings.plugins["VEYA-AI"] = veya;
    fs.mkdirSync(path.dirname(VENCORD_SETTINGS), { recursive: true });
    fs.writeFileSync(VENCORD_SETTINGS, JSON.stringify(settings, null, 4));
}

function removeVencordPluginSettings() {
    try {
        const settings = JSON.parse(fs.readFileSync(VENCORD_SETTINGS, "utf8"));
        if (settings?.plugins?.["VEYA-AI"]) {
            delete settings.plugins["VEYA-AI"];
            fs.writeFileSync(VENCORD_SETTINGS, JSON.stringify(settings, null, 4));
        }
    } catch { }
}

// ─── Securely hand API keys to the plugin (Windows DPAPI) ───────────────────

const PROTECT_PS = [
    "Add-Type -AssemblyName System.Security;",
    "$in = [Console]::In.ReadToEnd();",
    "$obj = $in | ConvertFrom-Json;",
    "$out = @{};",
    "foreach ($p in $obj.PSObject.Properties) {",
    "  if ($p.Value) {",
    "    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$p.Value);",
    "    $out[$p.Name] = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser'))",
    "  }",
    "}",
    "$out | ConvertTo-Json -Compress",
].join(" ");

/**
 * Writes the keys DPAPI-encrypted (only this Windows account can read them) into the install folder.
 * On the next Discord start the plugin moves them into its own encrypted storage and deletes the file.
 */
function writePendingKeys(installDir, keys) {
    const clean = {};
    for (const [p, v] of Object.entries(keys || {})) if (typeof v === "string" && v.trim()) clean[p] = v.trim();
    if (!Object.keys(clean).length) return Promise.resolve(false);

    return new Promise((resolve, reject) => {
        const child = execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PROTECT_PS],
            { windowsHide: true, timeout: 30_000 },
            (err, stdout) => {
                if (err) return reject(new Error("Couldn't encrypt the keys: " + err.message));
                try {
                    const protectedKeys = JSON.parse(stdout.trim() || "{}");
                    fs.writeFileSync(path.join(installDir, "pending-keys.json"), JSON.stringify(protectedKeys));
                    resolve(true);
                } catch (e) { reject(e); }
            }
        );
        child.stdin.end(JSON.stringify(clean));
    });
}

// ─── Shortcuts, autostart, Apps & Features ───────────────────────────────────

function createShortcut(shell, lnkPath, target, args = "", icon = null) {
    fs.mkdirSync(path.dirname(lnkPath), { recursive: true });
    return shell.writeShortcutLink(lnkPath, "create", {
        target,
        args,
        description: "Manage VEYA-AI – repair, update, uninstall",
        icon: icon || target,
        iconIndex: 0,
    });
}

function desktopLnk(app) { return path.join(app.getPath("desktop"), "VEYA-AI.lnk"); }

function setShortcuts(app, shell, managerExe, { desktop, startmenu }, iconFile = null) {
    const results = [];
    for (const [want, lnk] of [[desktop, desktopLnk(app)], [startmenu, START_MENU_LNK]]) {
        if (want && managerExe) results.push(createShortcut(shell, lnk, managerExe, "", iconFile));
        else try { fs.unlinkSync(lnk); } catch { }
    }
    return results.every(Boolean);
}

function removeShortcuts(app) {
    for (const lnk of [desktopLnk(app), START_MENU_LNK]) try { fs.unlinkSync(lnk); } catch { }
}

function setAutostart(app, managerExe, enabled) {
    app.setLoginItemSettings({
        openAtLogin: !!enabled && !!managerExe,
        path: managerExe || process.execPath,
        args: ["--repair-silent"],
        name: "VEYA-AI",
    });
}

async function registerUninstall({ managerExe, installDir, version, iconFile }) {
    if (!managerExe) return;
    const add = (name, type, data) => run("reg", ["add", UNINSTALL_KEY, "/v", name, "/t", type, "/d", String(data), "/f"]);
    let sizeKb = 0;
    try {
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else sizeKb += fs.statSync(p).size / 1024;
        });
        walk(installDir);
    } catch { }
    await add("DisplayName", "REG_SZ", "VEYA-AI");
    await add("DisplayVersion", "REG_SZ", version);
    await add("Publisher", "REG_SZ", "VEYA-AI");
    await add("DisplayIcon", "REG_SZ", iconFile || managerExe);
    await add("InstallLocation", "REG_SZ", installDir);
    await add("UninstallString", "REG_SZ", `"${managerExe}" --uninstall`);
    await add("ModifyPath", "REG_SZ", `"${managerExe}"`);
    await add("NoRepair", "REG_DWORD", 1);
    await add("EstimatedSize", "REG_DWORD", Math.round(sizeKb));
}

async function unregisterUninstall() {
    await run("reg", ["delete", UNINSTALL_KEY, "/f"]);
}

/** Old installer versions wrote the key to the registry in plain text → remove it */
async function removeLegacyRegistry() {
    await run("reg", ["delete", "HKCU\\Software\\VEYA-AI", "/f"]);
}

/** Delete the folder after this program exits (the running .exe can't delete itself) */
function deleteAfterExit(dir) {
    const { spawn } = require("child_process");
    const cmd = `ping 127.0.0.1 -n 8 > nul & rmdir /s /q "${dir.replace(/"/g, "")}"`;
    spawn("cmd.exe", ["/c", cmd], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

module.exports = {
    DEFAULT_INSTALL_DIR, DATA_DIR, VENCORD_SETTINGS,
    readRecord, writeRecord, removeRecord, canWrite, copyDir,
    writeVencordSettings, removeVencordPluginSettings, writePendingKeys,
    setShortcuts, removeShortcuts, setAutostart, registerUninstall, unregisterUninstall,
    removeLegacyRegistry, deleteAfterExit,
};
