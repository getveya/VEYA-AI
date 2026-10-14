/**
 * VEYA-AI Installer — local AI (Ollama)
 * Downloads + installs Ollama for the current user (no admin), starts it and downloads a model.
 * Everything runs on the user's PC afterwards – no API key, nothing is sent to the internet.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const API = "http://127.0.0.1:11434";
const SETUP_URL = "https://ollama.com/download/OllamaSetup.exe";
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Ollama", "ollama.exe");

const MODELS = [
    { id: "llama3.2:3b", label: "Light – Llama 3.2 3B", gb: 2.0, ram: 8 },
    { id: "gemma3:4b", label: "Recommended – Gemma 3 4B (also understands images)", gb: 3.3, ram: 8 },
    { id: "qwen2.5:7b", label: "Strong – Qwen 2.5 7B", gb: 4.7, ram: 16 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(pathname, opts = {}, timeout = 2500) {
    const res = await fetch(API + pathname, { ...opts, signal: AbortSignal.timeout(timeout) });
    return res.json();
}

/** { running, installed, version, models: [names] } */
async function status() {
    const installed = fs.existsSync(OLLAMA_EXE);
    try {
        const [ver, tags] = await Promise.all([api("/api/version"), api("/api/tags")]);
        return { running: true, installed: true, version: ver?.version || "", models: (tags?.models || []).map(m => m.name) };
    } catch {
        return { running: false, installed, version: "", models: [] };
    }
}

/** Download a file with progress (follows redirects) */
function download(url, dest, onProgress, redirects = 0) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "VEYA-AI-Installer" } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 8) {
                res.resume();
                return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Download failed (HTTP ${res.statusCode})`)); }
            const total = Number(res.headers["content-length"]) || 0;
            let done = 0, last = 0;
            const out = fs.createWriteStream(dest);
            res.on("data", c => {
                done += c.length;
                if (Date.now() - last > 250) { last = Date.now(); onProgress(done, total); }
            });
            res.pipe(out);
            out.on("finish", () => out.close(() => { onProgress(done, total); resolve(); }));
            out.on("error", reject);
            res.on("error", reject);
        }).on("error", reject);
    });
}

async function waitForApi(seconds) {
    for (let i = 0; i < seconds; i++) {
        try { await api("/api/version", {}, 1500); return true; } catch { }
        await sleep(1000);
    }
    return false;
}

/** Start the Ollama server if it isn't running yet */
async function ensureRunning() {
    if (await waitForApi(1)) return true;
    if (!fs.existsSync(OLLAMA_EXE)) return false;
    // "ollama app.exe" is the tray app (no console window) and starts the server itself.
    // ollama.exe is a console program – started detached it would open a terminal window.
    const tray = path.join(path.dirname(OLLAMA_EXE), "ollama app.exe");
    if (fs.existsSync(tray)) spawn(tray, [], { detached: true, stdio: "ignore" }).unref();
    else {
        const vbs = path.join(os.tmpdir(), "veya-ollama-serve.vbs");
        fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run """${OLLAMA_EXE}"" serve", 0, False\r\n`);
        spawn("wscript.exe", ["//B", "//Nologo", vbs], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    }
    return waitForApi(40);
}

/**
 * Installs Ollama (if needed) and downloads the model.
 * progress(pct 0-100, message) – the caller maps this into its own progress bar.
 */
async function setup(model, progress, log = () => { }) {
    if (!MODELS.some(m => m.id === model)) model = "gemma3:4b";
    const mb = b => (b / 1048576).toFixed(0);
    const gb = b => (b / 1073741824).toFixed(1);

    // 0 · enough disk space? (models are stored in %USERPROFILE%\.ollama)
    const info = MODELS.find(m => m.id === model);
    try {
        const fsStat = fs.statfsSync(os.homedir());
        const freeGb = fsStat.bavail * fsStat.bsize / 1073741824;
        const needGb = info.gb + 1.5;
        log(`Free disk space: ${freeGb.toFixed(1)} GB, needed ~${needGb.toFixed(1)} GB`);
        if (freeGb < needGb) throw new Error(`Not enough disk space: ${model} needs about ${needGb.toFixed(1)} GB, only ${freeGb.toFixed(1)} GB are free.`);
    } catch (e) { if (/disk space/.test(e.message)) throw e; }

    // 1 · Ollama itself
    let st = await status();
    if (!st.running && !st.installed) {
        const tmp = path.join(os.tmpdir(), "veya-ollama");
        fs.mkdirSync(tmp, { recursive: true });
        const exe = path.join(tmp, "OllamaSetup.exe");
        log("Downloading Ollama from", SETUP_URL);
        await download(SETUP_URL, exe, (d, t) => progress(t ? Math.round(d / t * 30) : 5, `Downloading Ollama… ${mb(d)}${t ? " / " + mb(t) : ""} MB`));
        progress(31, "Installing Ollama… (this can take a minute)");
        log("Running OllamaSetup.exe silently");
        await new Promise((resolve, reject) => {
            const p = spawn(exe, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"], { windowsHide: true });
            p.on("error", reject);
            p.on("exit", code => code === 0 ? resolve() : reject(new Error(`Ollama setup ended with code ${code}`)));
        });
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
    }
    progress(35, "Starting Ollama…");
    if (!(await ensureRunning())) throw new Error("Ollama was installed but doesn't start. Restart your PC and run VEYA-AI → Local AI again.");

    // 2 · the model
    st = await status();
    if (st.models.some(n => n === model || n === model + ":latest")) {
        progress(100, `${model} is already installed`);
        return { model, alreadyThere: true };
    }
    log("Pulling model", model);
    const res = await fetch(API + "/api/pull", { method: "POST", body: JSON.stringify({ model, stream: true }) });
    if (!res.ok || !res.body) throw new Error(`Ollama couldn't start the download (HTTP ${res.status})`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let last = 0;
    for (; ;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const l of lines) {
            if (!l.trim()) continue;
            const j = JSON.parse(l);
            if (j.error) throw new Error(j.error);
            if (j.total && Date.now() - last > 300) {
                last = Date.now();
                progress(36 + Math.round((j.completed || 0) / j.total * 63), `Downloading ${model}… ${gb(j.completed || 0)} / ${gb(j.total)} GB`);
            } else if (!j.total && j.status) progress(null, j.status);
        }
    }
    progress(100, `${model} is ready`);
    return { model, alreadyThere: false };
}

module.exports = { MODELS, status, setup, OLLAMA_EXE };
