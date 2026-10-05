/**
 * Find, patch, unpatch, close and launch Discord.
 * Uses "original-fs" so Electron doesn't treat .asar files as folders.
 */

const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = (() => { try { return require("original-fs"); } catch { return require("fs"); } })();
const { createAsar, readAsar } = require("./asar");

const MARKER = "VEYA-AI";

const FLAVORS = [
    { id: "stable", name: "Discord", dir: "Discord", exe: "Discord.exe" },
    { id: "ptb", name: "Discord PTB", dir: "DiscordPTB", exe: "DiscordPTB.exe" },
    { id: "canary", name: "Discord Canary", dir: "DiscordCanary", exe: "DiscordCanary.exe" },
];

function compareVersions(a, b) {
    const pa = a.replace(/^app-/, "").split(".").map(Number);
    const pb = b.replace(/^app-/, "").split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

function appDirs(base) {
    try {
        return fs.readdirSync(base)
            .filter(d => /^app-\d+(\.\d+)*$/.test(d))
            .sort(compareVersions);
    } catch { return []; }
}

function readPatchTarget(asarPath) {
    try {
        const files = readAsar(fs.readFileSync(asarPath));
        return files["index.js"] || "";
    } catch { return ""; }
}

/** Status of all Discord flavors */
function detect() {
    const lad = process.env.LOCALAPPDATA || "";
    return FLAVORS.map(f => {
        const base = path.join(lad, f.dir);
        const apps = appDirs(base);
        const latest = apps[apps.length - 1];
        const resources = latest ? path.join(base, latest, "resources") : null;
        const found = !!resources && (fs.existsSync(path.join(resources, "app.asar")) || fs.existsSync(path.join(resources, "_app.asar")));
        let state = "missing";
        if (found) {
            const backup = fs.existsSync(path.join(resources, "_app.asar"));
            if (!backup) state = "clean";
            else state = readPatchTarget(path.join(resources, "app.asar")).includes(MARKER) ? "veya" : "other";
        }
        return {
            id: f.id, name: f.name, exe: f.exe, base, found,
            version: latest ? latest.replace(/^app-/, "") : null,
            resources, state,
        };
    });
}

function patcherAsar(patcherPath) {
    return createAsar({
        "index.js": `// ${MARKER} – redirects Discord to the VEYA patcher\nrequire(${JSON.stringify(patcherPath)});\n`,
        "package.json": JSON.stringify({ name: "discord", main: "index.js" }),
    });
}

/** Patch the latest version of a Discord flavor */
function patch(flavor, patcherPath) {
    const { resources } = flavor;
    if (!resources) throw new Error(`${flavor.name} was not found.`);
    const appAsar = path.join(resources, "app.asar");
    const backup = path.join(resources, "_app.asar");

    if (!fs.existsSync(backup)) {
        if (!fs.existsSync(appAsar)) throw new Error(`${flavor.name}: app.asar is missing – is Discord fully installed?`);
        fs.renameSync(appAsar, backup);
    }
    fs.writeFileSync(appAsar, patcherAsar(patcherPath));
}

/** Restore all versions of a Discord flavor */
function unpatch(flavor) {
    let restored = 0;
    for (const dir of appDirs(flavor.base)) {
        const resources = path.join(flavor.base, dir, "resources");
        const appAsar = path.join(resources, "app.asar");
        const backup = path.join(resources, "_app.asar");
        if (!fs.existsSync(backup)) continue;
        try { fs.unlinkSync(appAsar); } catch { }
        fs.renameSync(backup, appAsar);
        restored++;
    }
    return restored;
}

function run(cmd, args, opts = {}) {
    return new Promise(resolve => {
        execFile(cmd, args, { windowsHide: true, timeout: 30_000, ...opts }, (err, stdout, stderr) =>
            resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || ""), err }));
    });
}

async function isRunning(exe) {
    const r = await run("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/NH"]);
    return r.stdout.toLowerCase().includes(exe.toLowerCase());
}

/** Close Discord. Returns whether it was running. */
async function kill(flavor) {
    const was = await isRunning(flavor.exe);
    if (!was) return false;
    await run("taskkill", ["/F", "/T", "/IM", flavor.exe]);
    // Windows needs a moment to release the files
    for (let i = 0; i < 20 && await isRunning(flavor.exe); i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 600));
    return true;
}

function launch(flavor) {
    const updater = path.join(flavor.base, "Update.exe");
    if (fs.existsSync(updater)) {
        spawn(updater, ["--processStart", flavor.exe], { detached: true, stdio: "ignore", windowsHide: false }).unref();
        return true;
    }
    const direct = flavor.resources && path.join(flavor.resources, "..", flavor.exe);
    if (direct && fs.existsSync(direct)) {
        spawn(direct, [], { detached: true, stdio: "ignore" }).unref();
        return true;
    }
    return false;
}

module.exports = { FLAVORS, detect, patch, unpatch, kill, launch, isRunning, run, MARKER, fs };
