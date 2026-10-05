/*
 * VEYA-AI – native.ts
 * Runs in the Discord main process (not in the browser part):
 *  - Store API keys encrypted (OS encryption via Electron safeStorage)
 *  - Read the keys handed over by the installer (DPAPI-protected)
 *  - AI requests to Claude, OpenAI, Gemini, DeepSeek, Grok, Mistral, Groq & OpenRouter – streaming + automatic model fallback
 *  - Load the online Store & example plugins
 *  - Check GitHub for a new VEYA release and run its installer in update mode
 *
 * The keys never leave this process – the Discord renderer only gets "key present: yes/no".
 */

import { execFile, spawn } from "child_process";
import { app, IpcMainInvokeEvent, safeStorage } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

export type Provider = "claude" | "openai" | "gemini" | "deepseek" | "xai" | "mistral" | "groq" | "openrouter";
const PROVIDERS: Provider[] = ["claude", "openai", "gemini", "deepseek", "xai", "mistral", "groq", "openrouter"];

/** OpenAI-compatible APIs */
const COMPAT_BASE: Partial<Record<Provider, string>> = {
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com",
    xai: "https://api.x.ai/v1",
    mistral: "https://api.mistral.ai/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
};

export type Part =
    | { type: "text"; text: string; }
    | { type: "image"; mime: string; data: string; }
    | { type: "audio"; mime: string; data: string; };

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string | Part[]; }
export interface ChatRequest {
    provider: Provider;
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    /** Models of all providers – for switching automatically when the active provider can't handle something */
    models?: Partial<Record<Provider, string>>;
}

/** What each provider can process */
const CAPS: Record<Provider, Array<"image" | "audio">> = {
    claude: ["image"],
    openai: ["image"],
    gemini: ["image", "audio"],
    deepseek: [],
    xai: ["image"],
    mistral: ["image"],
    groq: [],
    openrouter: ["image"],
};

// patcher.js lives in <install folder>/dist → one level up is the install folder
const INSTALL_DIR = join(__dirname, "..");
const DATA_DIR = join(app.getPath("appData"), "VEYA-AI");
const KEYS_FILE = join(DATA_DIR, "keys.json");
const PENDING_FILE = join(INSTALL_DIR, "pending-keys.json");

// ─── Keystore ────────────────────────────────────────────────────────────────

interface KeyFile { version: 1; encrypted: boolean; keys: Partial<Record<Provider, string>>; }

let cache: Partial<Record<Provider, string>> | null = null;

function canEncrypt() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function readKeys(): Partial<Record<Provider, string>> {
    if (cache) return cache;
    cache = {};
    try {
        const file: KeyFile = JSON.parse(readFileSync(KEYS_FILE, "utf8"));
        for (const p of PROVIDERS) {
            const v = file.keys?.[p];
            if (!v) continue;
            cache[p] = file.encrypted
                ? safeStorage.decryptString(Buffer.from(v, "base64"))
                : Buffer.from(v, "base64").toString("utf8");
        }
    } catch { /* no keys yet */ }
    return cache;
}

function writeKeys(keys: Partial<Record<Provider, string>>) {
    const encrypted = canEncrypt();
    const out: KeyFile = { version: 1, encrypted, keys: {} };
    for (const p of PROVIDERS) {
        const v = keys[p];
        if (!v) continue;
        out.keys[p] = encrypted
            ? safeStorage.encryptString(v).toString("base64")
            : Buffer.from(v, "utf8").toString("base64");
    }
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(KEYS_FILE, JSON.stringify(out, null, 2));
    cache = { ...keys };
}

function storeKey(provider: Provider, key: string) {
    if (!PROVIDERS.includes(provider)) throw new Error("Unknown provider");
    const keys = { ...readKeys() };
    const clean = (key ?? "").trim();
    if (clean) keys[provider] = clean; else delete keys[provider];
    writeKeys(keys);
}

// ─── Handover from the installer (Windows DPAPI, readable only by this Windows user) ───────

const UNPROTECT_PS = [
    "Add-Type -AssemblyName System.Security;",
    "$in = [Console]::In.ReadToEnd();",
    "$obj = $in | ConvertFrom-Json;",
    "$out = @{};",
    "foreach ($p in $obj.PSObject.Properties) {",
    "  $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($p.Value), $null, 'CurrentUser');",
    "  $out[$p.Name] = [Text.Encoding]::UTF8.GetString($bytes)",
    "}",
    "$out | ConvertTo-Json -Compress",
].join(" ");

function dpapiUnprotect(json: string): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
        const child = execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", UNPROTECT_PS],
            { windowsHide: true, timeout: 20_000 },
            (err, stdout) => {
                if (err) return reject(err);
                try { resolve(JSON.parse(stdout.trim() || "{}")); } catch (e) { reject(e); }
            }
        );
        child.stdin?.end(json);
    });
}

const pendingImport: Promise<void> = (async () => {
    if (process.platform !== "win32" || !existsSync(PENDING_FILE)) return;
    try {
        const plain = await dpapiUnprotect(readFileSync(PENDING_FILE, "utf8"));
        const keys = { ...readKeys() };
        for (const p of PROVIDERS) if (plain[p]?.trim()) keys[p] = plain[p].trim();
        writeKeys(keys);
        console.log("[VEYA-AI] Imported API keys from the installer.");
    } catch (e) {
        console.error("[VEYA-AI] Could not import keys from the installer:", e);
    } finally {
        try { unlinkSync(PENDING_FILE); } catch { }
    }
})();

// ─── Keys: public functions (NEVER return the key itself) ───────────────────────

export async function getKeyStatus(_: IpcMainInvokeEvent) {
    await pendingImport;
    const keys = readKeys();
    return {
        encrypted: canEncrypt(),
        keys: Object.fromEntries(PROVIDERS.map(p => [p, !!keys[p]])) as Record<Provider, boolean>,
    };
}

export async function setKey(_: IpcMainInvokeEvent, provider: Provider, key: string) {
    await pendingImport;
    storeKey(provider, key);
    return true;
}

/** Import old plaintext keys from the Vencord settings */
export async function migrateKeys(_: IpcMainInvokeEvent, keys: Partial<Record<Provider, string>>) {
    await pendingImport;
    const current = { ...readKeys() };
    let changed = false;
    for (const p of PROVIDERS) {
        const v = keys?.[p]?.trim();
        if (v && !current[p]) { current[p] = v; changed = true; }
    }
    if (changed) writeKeys(current);
    return changed;
}

// ─── AI requests ─────────────────────────────────────────────────────────────

const MODEL_RE = /^[\w.:\-/]{1,80}$/;
/** Only used if the provider's model list can't be loaded */
const DEFAULT_MODELS: Record<Provider, string> = {
    claude: "claude-sonnet-4-5", openai: "gpt-4.1-mini", gemini: "gemini-flash-latest", deepseek: "deepseek-chat",
    xai: "grok-4", mistral: "mistral-medium-latest", groq: "llama-3.3-70b-versatile", openrouter: "openrouter/auto",
};

function errorText(status: number, body: any): string {
    const msg = body?.error?.message ?? body?.message ?? "";
    if (status === 401 || status === 403) return "API key is invalid or lacks permission.";
    if (status === 404) return `Model not found – VEYA tried to switch to another model automatically. ${msg}`.trim();
    if (status === 413) return "The file is too large for the AI provider.";
    if (status === 429) return "Limit reached – too many requests or no credit left.";
    if (status >= 500) return "The AI provider is having problems right now. Try again in a moment.";
    return msg || `Error ${status}`;
}

const asParts = (c: string | Part[]): Part[] => typeof c === "string" ? (c ? [{ type: "text", text: c }] : []) : c;
const textOf = (c: string | Part[]) => asParts(c).filter(p => p.type === "text").map(p => (p as any).text).join("\n");

/** Merge adjacent messages with the same role (Claude & Gemini require alternating roles) */
function normalize(messages: ChatMessage[]) {
    const system = messages.filter(m => m.role === "system").map(m => textOf(m.content)).join("\n\n");
    const rest: { role: "user" | "assistant"; parts: Part[]; }[] = [];
    for (const m of messages) {
        if (m.role === "system") continue;
        const parts = asParts(m.content).filter(p => p.type !== "text" || p.text.trim());
        if (!parts.length) continue;
        const last = rest[rest.length - 1];
        if (last && last.role === m.role) last.parts.push(...parts);
        else rest.push({ role: m.role, parts: [...parts] });
    }
    while (rest.length && rest[0].role !== "user") rest.shift();
    return { system, rest };
}

function needsOf(messages: ChatMessage[]): Set<"image" | "audio"> {
    const n = new Set<"image" | "audio">();
    for (const m of messages) for (const p of asParts(m.content)) if (p.type !== "text") n.add(p.type);
    return n;
}

const onlyText = (parts: Part[]) => parts.every(p => p.type === "text");
const joinText = (parts: Part[]) => parts.map(p => (p as any).text).join("\n\n");

function toClaude(parts: Part[]) {
    if (onlyText(parts)) return joinText(parts);
    return parts.map(p => p.type === "text"
        ? { type: "text", text: p.text }
        : { type: "image", source: { type: "base64", media_type: p.mime, data: p.data } });
}

function toOpenAI(parts: Part[]) {
    if (onlyText(parts)) return joinText(parts);
    return parts.map(p => p.type === "text"
        ? { type: "text", text: p.text }
        : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}` } });
}

function toGemini(parts: Part[]) {
    return parts.map(p => p.type === "text" ? { text: p.text } : { inline_data: { mime_type: p.mime, data: p.data } });
}

function buildRequest(req: ChatRequest, key: string, stream: boolean): { url: string; init: RequestInit; } {
    const maxTokens = Math.min(Math.max(req.maxTokens ?? 1024, 64), req.provider === "deepseek" ? 8192 : 16000);
    const { system, rest } = normalize(req.messages);
    const json = { "Content-Type": "application/json" };

    switch (req.provider) {
        case "claude":
            return {
                url: "https://api.anthropic.com/v1/messages",
                init: {
                    method: "POST",
                    headers: { ...json, "x-api-key": key, "anthropic-version": "2023-06-01" },
                    body: JSON.stringify({
                        model: req.model, max_tokens: maxTokens, system: system || undefined, stream,
                        messages: rest.map(m => ({ role: m.role, content: toClaude(m.parts) })),
                    }),
                },
            };
        case "openai": case "deepseek": case "xai": case "mistral": case "groq": case "openrouter": {
            const messages = rest.map(m => ({ role: m.role, content: toOpenAI(m.parts) }));
            return {
                url: `${COMPAT_BASE[req.provider]}/chat/completions`,
                init: {
                    method: "POST",
                    headers: {
                        ...json, Authorization: `Bearer ${key}`,
                        ...(req.provider === "openrouter" ? { "HTTP-Referer": "https://github.com/getveya/VEYA-AI", "X-Title": "VEYA AI" } : {}),
                    },
                    body: JSON.stringify({
                        model: req.model,
                        ...(req.provider === "openai" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
                        messages: system ? [{ role: "system", content: system }, ...messages] : messages,
                        stream,
                    }),
                },
            };
        }
        case "gemini":
            return {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
                init: {
                    method: "POST",
                    headers: { ...json, "x-goog-api-key": key },
                    body: JSON.stringify({
                        contents: rest.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: toGemini(m.parts) })),
                        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
                        generationConfig: { maxOutputTokens: maxTokens },
                    }),
                },
            };
    }
}

function extractFull(provider: Provider, body: any): string {
    switch (provider) {
        case "claude": return (body?.content ?? []).map((c: any) => c?.text ?? "").join("");
        case "gemini": return (body?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
        default: return body?.choices?.[0]?.message?.content ?? "";
    }
}

function extractDelta(provider: Provider, obj: any): string {
    switch (provider) {
        case "claude":
            if (obj?.type === "error") throw new Error(obj.error?.message ?? "Error while streaming");
            return obj?.type === "content_block_delta" ? (obj.delta?.text ?? "") : "";
        case "gemini": return (obj?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
        default: return obj?.choices?.[0]?.delta?.content ?? "";
    }
}

function validate(req: ChatRequest): string | null {
    if (!req || !PROVIDERS.includes(req.provider)) return "Unknown AI provider.";
    if (req.model && req.model !== "auto" && !MODEL_RE.test(req.model)) return "Invalid model name.";
    if (!Array.isArray(req.messages) || !req.messages.length) return "No message.";
    return null;
}

// ─── Model discovery: every provider tells us which models exist ───────────────

const NOT_CHAT = /(embed|whisper|tts|transcri|audio|realtime|speech|dall-e|image|imagen|veo|lyria|sora|moderation|search|similar|rerank|ocr|guard|aqa|-live|native-audio|computer-use|robotics|babbage|davinci|curie|\bada\b|instruct|codex|gemma|learnlm|distil|playai|orpheus|prompt-guard|safeguard)/i;
const DATE_SUFFIX = /(-\d{8}|-\d{4}-\d{2}-\d{2}|-\d{4}|@\d{8})$/;

/** Version numbers in a model id, e.g. "gemini-3.8-flash" → [3.8], "claude-sonnet-4-5-20250929" → [4, 5] */
function versionOf(id: string): number[] {
    const clean = id.replace(/-(preview|exp|experimental|beta)\b.*$/i, "").replace(DATE_SUFFIX, "").replace(/(\d)k\b/gi, "");
    return (clean.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter(n => n < 1000);
}

function cmpVersion(a: number[], b: number[]) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? -1) - (b[i] ?? -1);
        if (d) return d;
    }
    return 0;
}

/** Preferred families per provider (first = best default for everyday chat) */
const FAMILY: Record<Provider, RegExp[]> = {
    claude: [/sonnet/, /opus/, /haiku/],
    openai: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/, /^gpt-[\d.]+o?(-mini)?/, /^o\d/],
    gemini: [/^gemini-flash-latest$/, /flash(?!-lite)/, /pro/, /flash-lite/],
    deepseek: [/chat/, /reasoner/],
    xai: [/^grok-[\d.]+(-fast)?$/, /^grok-[\d.]+/, /grok/],
    mistral: [/medium-latest/, /large-latest/, /medium/, /large/, /small-latest/, /small/],
    groq: [/gpt-oss-120b/, /llama-3\.3-70b/, /70b/, /kimi/, /qwen/, /llama/],
    openrouter: [/^openrouter\/auto$/],
};

/** Best model first */
function rankModels(provider: Provider, ids: string[]): string[] {
    const fam = FAMILY[provider];
    const score = (id: string) => {
        const lower = id.toLowerCase();
        const f = fam.findIndex(r => r.test(lower));
        return {
            fam: f === -1 ? fam.length : f,
            ver: versionOf(lower),
            unstable: /(preview|exp|beta|alpha|test)/.test(lower) ? 1 : 0,
            dated: DATE_SUFFIX.test(lower) ? 1 : 0,
            latest: /latest/.test(lower) ? 0 : 1,
        };
    };
    return [...new Set(ids)].sort((a, b) => {
        const A = score(a), B = score(b);
        return A.fam - B.fam || cmpVersion(B.ver, A.ver) || A.unstable - B.unstable || A.latest - B.latest || A.dated - B.dated || a.localeCompare(b);
    });
}

const modelCache = new Map<Provider, { at: number; models: string[]; }>();

async function fetchModelList(provider: Provider, key: string): Promise<string[]> {
    const cached = modelCache.get(provider);
    if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.models;
    let ids: string[] = [];
    const get = async (url: string, headers: Record<string, string>) => {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errorText(res.status, body));
        return body;
    };
    if (provider === "claude") {
        const body = await get("https://api.anthropic.com/v1/models?limit=1000", { "x-api-key": key, "anthropic-version": "2023-06-01" });
        ids = (body?.data ?? []).map((m: any) => m.id);
    } else if (provider === "gemini") {
        const body = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { "x-goog-api-key": key });
        ids = (body?.models ?? [])
            .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
            .map((m: any) => String(m.name).replace(/^models\//, ""));
    } else {
        const body = await get(`${COMPAT_BASE[provider]}/models`, { Authorization: `Bearer ${key}` });
        ids = (body?.data ?? []).map((m: any) => m.id);
    }
    ids = ids.filter(id => typeof id === "string" && MODEL_RE.test(id) && !NOT_CHAT.test(id));
    if (provider === "openrouter" && !ids.includes("openrouter/auto")) ids.unshift("openrouter/auto");
    const models = rankModels(provider, ids);
    modelCache.set(provider, { at: Date.now(), models });
    return models;
}

// Models that just failed are skipped for a while; the last model that worked is preferred.
const badUntil = new Map<string, number>();
const lastGood = new Map<Provider, string>();
const isBad = (p: Provider, m: string) => (badUntil.get(`${p}:${m}`) ?? 0) > Date.now();
function markBad(p: Provider, m: string, ms: number) {
    badUntil.set(`${p}:${m}`, Date.now() + ms);
    if (lastGood.get(p) === m) lastGood.delete(p);
}

/** "auto" (or empty) → best model the key can use right now */
async function resolveModel(provider: Provider, key: string, wanted: string): Promise<string> {
    if (wanted && wanted !== "auto") return wanted;
    const good = lastGood.get(provider);
    if (good && !isBad(provider, good)) return good;
    try {
        const list = await fetchModelList(provider, key);
        const pick = list.find(m => !isBad(provider, m)) ?? list[0];
        if (pick) return pick;
    } catch { /* fall back */ }
    return DEFAULT_MODELS[provider];
}

/** Does this error mean "this model doesn't exist / isn't available"? */
function isModelError(status: number, body: any) {
    const msg = String(body?.error?.message ?? body?.message ?? body?.error ?? "");
    if (status === 404) return true;
    return (status === 400 || status === 403 || status === 422) && /model/i.test(msg) && /(not found|not exist|no longer|unknown|invalid|not supported|deprecated|unavailable|decommission|retired|does not have access|not available)/i.test(msg);
}

/** Errors where another model may still work: model gone, overloaded/server error, per-model limit */
function shouldSwitch(status: number, body: any) {
    return isModelError(status, body) || status >= 500 || status === 429 || status === 408;
}

/** Next model to try that hasn't been tried yet */
async function nextModel(provider: Provider, key: string, tried: Set<string>, refresh = false): Promise<string | null> {
    if (refresh) modelCache.delete(provider);
    try {
        const list = await fetchModelList(provider, key);
        return list.find(m => !tried.has(m) && !isBad(provider, m)) ?? list.find(m => !tried.has(m)) ?? null;
    } catch { return null; }
}

const MAX_TRIES = 5;

/**
 * Sends the request; if the model fails (gone, overloaded, limit), automatically tries the next best model.
 * Returns the successful response or the last error.
 */
async function sendWithFallback(req: ChatRequest, key: string, stream: boolean, signal?: AbortSignal): Promise<{ res: Response; body?: any; req: ChatRequest; }> {
    const tried = new Set<string>();
    let res!: Response; let body: any;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        tried.add(req.model);
        const { url, init } = buildRequest(req, key, stream);
        res = await fetch(url, { ...init, signal: signal ?? AbortSignal.timeout(180_000) });
        if (res.ok && (!stream || res.body)) {
            lastGood.set(req.provider, req.model);
            return { res, req };
        }
        body = await res.json().catch(() => ({}));
        if (!shouldSwitch(res.status, body)) break;
        const gone = isModelError(res.status, body);
        markBad(req.provider, req.model, gone ? 6 * 3600_000 : 10 * 60_000);
        const next = await nextModel(req.provider, key, tried, gone);
        if (!next) break;
        console.log(`[VEYA-AI] ${req.provider}/${req.model} failed (${res.status}) – trying ${next}`);
        req = { ...req, model: next };
    }
    return { res, body, req };
}

export async function listModels(_: IpcMainInvokeEvent, provider: Provider, refresh = false): Promise<{ ok: boolean; models: string[]; error?: string; }> {
    await pendingImport;
    if (!PROVIDERS.includes(provider)) return { ok: false, models: [], error: "Unknown provider." };
    const key = readKeys()[provider];
    if (!key) return { ok: false, models: [], error: "No API key saved." };
    if (refresh) modelCache.delete(provider);
    try { return { ok: true, models: await fetchModelList(provider, key) }; } catch (e: any) { return { ok: false, models: [], error: String(e?.message ?? e) }; }
}

/** Tries the best models one after another until one answers – returns the first that works */
export async function autoPickModel(_: IpcMainInvokeEvent, provider: Provider): Promise<{ ok: boolean; model?: string; tried: string[]; error?: string; }> {
    await pendingImport;
    const key = readKeys()[provider];
    if (!key) return { ok: false, tried: [], error: "No API key saved." };
    modelCache.delete(provider);
    let list: string[];
    try { list = await fetchModelList(provider, key); } catch (e: any) { return { ok: false, tried: [], error: String(e?.message ?? e) }; }
    const tried: string[] = [];
    let lastError = "";
    for (const model of list.slice(0, 6)) {
        tried.push(model);
        try {
            const { url, init } = buildRequest({ provider, model, messages: [{ role: "user", content: "Reply only with: OK" }], maxTokens: 64 }, key, false);
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
            const body = await res.json().catch(() => ({}));
            if (res.ok) { lastGood.set(provider, model); return { ok: true, model, tried }; }
            lastError = errorText(res.status, body);
            if (res.status === 401) break; // key problem – other models won't help
        } catch (e: any) { lastError = String(e?.message ?? e); }
    }
    return { ok: false, tried, error: lastError || "No working model found." };
}

const NEED_LABEL = { image: "Images", audio: "Voice messages" };

/**
 * Get the key – and if the active provider can't handle images/audio, automatically
 * switch to another provider that has a stored key.
 */
async function prepare(req: ChatRequest): Promise<{ error: string; } | { key: string; req: ChatRequest; }> {
    await pendingImport;
    const invalid = validate(req);
    if (invalid) return { error: invalid };
    const keys = readKeys();
    const needs = [...needsOf(req.messages)];
    const can = (p: Provider) => needs.every(n => CAPS[p].includes(n));

    let provider = req.provider;
    if (!can(provider) || !keys[provider]) {
        const alt = [provider, ...PROVIDERS].find(p => keys[p] && can(p));
        if (!alt) {
            if (!keys[provider]) return { error: "No API key for this provider – add it under Settings → VEYA → AI & Settings." };
            const which = needs.map(n => NEED_LABEL[n]).join(" and ");
            return { error: `This provider can't process ${which.toLowerCase()}. Add a key for ${needs.includes("audio") ? "Gemini" : "Gemini, ChatGPT, Claude, Grok, Mistral or OpenRouter"} as well.` };
        }
        provider = alt;
    }
    const wanted = provider === req.provider ? req.model : (req.models?.[provider] || "auto");
    const model = await resolveModel(provider, keys[provider]!, wanted);
    if (!MODEL_RE.test(model)) return { error: "Invalid model name." };
    return { key: keys[provider]!, req: { ...req, provider, model } };
}

/** Complete answer at once. If the model is gone, VEYA switches to the best available one and tells the renderer (`model`). */
export async function chatOnce(_: IpcMainInvokeEvent, req: ChatRequest): Promise<{ text: string; error?: string; model?: string; provider?: Provider; }> {
    const prep = await prepare(req);
    if ("error" in prep) return { text: "", error: prep.error };
    try {
        const { res, body, req: r } = await sendWithFallback(prep.req, prep.key, false);
        if (!res.ok) return { text: "", error: errorText(res.status, body) };
        const data = await res.json().catch(() => ({}));
        return { text: extractFull(r.provider, data) || "(No response received)", model: r.model, provider: r.provider };
    } catch (e: any) {
        return { text: "", error: e?.name === "TimeoutError" ? "Timed out – no response from the provider." : `Connection error: ${e?.message ?? e}` };
    }
}

// Streaming: the renderer starts a request and polls for new text every ~80 ms
interface Job { text: string; done: boolean; error?: string; ctrl: AbortController; touched: number; model?: string; provider?: Provider; }
const jobs = new Map<string, Job>();

setInterval(() => {
    const now = Date.now();
    for (const [id, j] of jobs) if (now - j.touched > 5 * 60_000) { j.ctrl.abort(); jobs.delete(id); }
}, 60_000).unref?.();

async function runStream(job: Job, req: ChatRequest, key: string) {
    try {
        const sent = await sendWithFallback(req, key, true, job.ctrl.signal);
        req = sent.req;
        const res = sent.res;
        if (!res.ok || !res.body) { job.error = errorText(res.status, sent.body); return; }
        job.model = req.model;
        job.provider = req.provider;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (; ;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split(/\r?\n/);
            buf = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try { job.text += extractDelta(req.provider, JSON.parse(data)); } catch (e: any) {
                    if (e instanceof SyntaxError) continue;
                    throw e;
                }
            }
        }
        if (!job.text) job.text = "(No response received)";
    } catch (e: any) {
        if (e?.name !== "AbortError") job.error = `Connection error: ${e?.message ?? e}`;
    } finally {
        job.done = true;
    }
}

export async function chatStart(_: IpcMainInvokeEvent, id: string, req: ChatRequest): Promise<{ ok: boolean; error?: string; }> {
    if (typeof id !== "string" || id.length > 64) return { ok: false, error: "Invalid request ID." };
    const prep = await prepare(req);
    if ("error" in prep) return { ok: false, error: prep.error };
    const job: Job = { text: "", done: false, ctrl: new AbortController(), touched: Date.now() };
    jobs.set(id, job);
    void runStream(job, prep.req, prep.key);
    return { ok: true };
}

export function chatPoll(_: IpcMainInvokeEvent, id: string) {
    const job = jobs.get(id);
    if (!job) return { text: "", done: true, error: "Request not found." };
    job.touched = Date.now();
    if (job.done) jobs.delete(id);
    return { text: job.text, done: job.done, error: job.error, model: job.model, provider: job.provider };
}

export function chatCancel(_: IpcMainInvokeEvent, id: string) {
    jobs.get(id)?.ctrl.abort();
    jobs.delete(id);
}

// ─── Online Store & files ────────────────────────────────────────────────────

const MAX_DOWNLOAD = 2 * 1024 * 1024;

/** Load text from an https URL (Store index, .veya.json packages). Discord blocks this in the renderer. */
export async function fetchText(_: IpcMainInvokeEvent, url: string): Promise<{ ok: boolean; text?: string; error?: string; }> {
    try {
        const u = new URL(url);
        if (u.protocol !== "https:") return { ok: false, error: "Only https URLs are allowed." };
        const res = await fetch(u, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json, text/plain" } });
        if (!res.ok) return { ok: false, error: `Server responded with ${res.status}` };
        const text = await res.text();
        if (text.length > MAX_DOWNLOAD) return { ok: false, error: "File is too large (max. 2 MB)." };
        return { ok: true, text };
    } catch (e: any) {
        return { ok: false, error: e?.name === "TimeoutError" ? "Timed out" : String(e?.message ?? e) };
    }
}

/** Example packages bundled by the installer */
export function getBundledExamples(_: IpcMainInvokeEvent): string[] {
    const dir = join(INSTALL_DIR, "examples");
    try {
        return readdirSync(dir)
            .filter(f => f.endsWith(".veya.json"))
            .slice(0, 20)
            .map(f => readFileSync(join(dir, f), "utf8"))
            .filter(t => t.length < MAX_DOWNLOAD);
    } catch { return []; }
}

/** Info about the installation (for the About page) */
export function getInstallInfo(_: IpcMainInvokeEvent) {
    try {
        const meta = JSON.parse(readFileSync(join(INSTALL_DIR, "veya.json"), "utf8"));
        return { installDir: INSTALL_DIR, version: String(meta.version ?? "?"), installedAt: meta.installedAt ?? null };
    } catch {
        return { installDir: INSTALL_DIR, version: "dev", installedAt: null };
    }
}


// ─── Load media from Discord (images, voice messages) ─────────────────────────

const MEDIA_HOSTS = /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|cdn\.discord\.com)$/;
const MAX_MEDIA = 20 * 1024 * 1024;

export async function fetchMedia(_: IpcMainInvokeEvent, url: string): Promise<{ ok: boolean; data?: string; mime?: string; error?: string; }> {
    try {
        const u = new URL(url);
        if (u.protocol !== "https:" || !MEDIA_HOSTS.test(u.hostname)) return { ok: false, error: "Only Discord files are allowed." };
        const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_MEDIA) return { ok: false, error: "File is too large (max. 20 MB)." };
        const mime = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
        return { ok: true, data: buf.toString("base64"), mime };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
    }
}

/** Voice message → text. Uses Gemini (understands audio directly), then Whisper via OpenAI or Groq. */
export async function transcribe(_: IpcMainInvokeEvent, audio: { data: string; mime: string; }, models?: Partial<Record<Provider, string>>, language = "English"): Promise<{ text: string; error?: string; }> {
    await pendingImport;
    const keys = readKeys();
    try {
        if (keys.gemini) {
            const req: ChatRequest = {
                provider: "gemini", model: await resolveModel("gemini", keys.gemini, models?.gemini || "auto"), maxTokens: 4096,
                messages: [{
                    role: "user", content: [
                        { type: "audio", mime: audio.mime || "audio/ogg", data: audio.data },
                        { type: "text", text: `Transcribe this voice message verbatim. Output only the spoken text. If the speech is not in ${language}, add a line "Translation:" afterwards with the translation into ${language}.` },
                    ]
                }],
            };
            const { res, body } = await sendWithFallback(req, keys.gemini, false);
            if (res.ok) return { text: extractFull("gemini", await res.json().catch(() => ({}))) || "(Nothing recognized)" };
            if (!keys.openai && !keys.groq) return { text: "", error: errorText(res.status, body) };
            // Gemini failed with every model – fall through to Whisper
        }
        // Whisper: OpenAI, then Groq (free tier)
        const whisper = [
            keys.openai && { url: "https://api.openai.com/v1/audio/transcriptions", key: keys.openai, model: "whisper-1" },
            keys.groq && { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: keys.groq, model: "whisper-large-v3-turbo" },
        ].filter(Boolean) as { url: string; key: string; model: string; }[];
        let lastError = "";
        for (const w of whisper) {
            const form = new FormData();
            const ext = (audio.mime.split("/")[1] || "ogg").replace("mpeg", "mp3");
            form.append("file", new Blob([Buffer.from(audio.data, "base64")], { type: audio.mime }), `voice.${ext}`);
            form.append("model", w.model);
            const res = await fetch(w.url, { method: "POST", headers: { Authorization: `Bearer ${w.key}` }, body: form, signal: AbortSignal.timeout(180_000) });
            const body = await res.json().catch(() => ({}));
            if (res.ok) return { text: body?.text || "(Nothing recognized)" };
            lastError = errorText(res.status, body);
        }
        if (lastError) return { text: "", error: lastError };
        return { text: "", error: "Voice messages need a key for Gemini, ChatGPT or Groq (Gemini and Groq have a free tier)." };
    } catch (e: any) {
        return { text: "", error: `Connection error: ${e?.message ?? e}` };
    }
}


// ─── Updates ─────────────────────────────────────────────────────────────────

const UPDATE_REPO = "getveya/VEYA-AI";
const RELEASE_PREFIX = `https://github.com/${UPDATE_REPO}/releases/download/`;

function installedVersion(): string | null {
    try { return String(JSON.parse(readFileSync(join(INSTALL_DIR, "veya.json"), "utf8")).version ?? "") || null; } catch { return null; }
}

/** "1.10.0" > "1.9.2" */
function newer(a: string, b: string) {
    const pa = a.replace(/^v/i, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
    const pb = b.replace(/^v/i, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
    }
    return false;
}

async function latestRelease() {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        headers: { "User-Agent": "VEYA-AI", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const rel = await res.json();
    const asset = (rel.assets ?? []).find((a: any) => /\.exe$/i.test(a.name) && String(a.browser_download_url).startsWith(RELEASE_PREFIX));
    return { version: String(rel.tag_name ?? "").replace(/^v/i, ""), notes: String(rel.body ?? "").slice(0, 4000), page: String(rel.html_url ?? ""), asset };
}

export async function checkForUpdate(_: IpcMainInvokeEvent): Promise<{ available: boolean; current?: string | null; version?: string; notes?: string; page?: string; size?: number; error?: string; }> {
    try {
        const current = installedVersion();
        if (!current) return { available: false, current }; // dev build – no updates
        const rel = await latestRelease();
        if (!rel.version || !rel.asset || !newer(rel.version, current)) return { available: false, current };
        return { available: true, current, version: rel.version, notes: rel.notes, page: rel.page, size: rel.asset.size };
    } catch (e: any) {
        return { available: false, error: String(e?.message ?? e) };
    }
}

/** Downloads the new installer and starts it with --update (it closes Discord, updates and restarts it) */
export async function installUpdate(_: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string; }> {
    if (process.platform !== "win32") return { ok: false, error: "Updates only work on Windows." };
    try {
        const rel = await latestRelease();
        const current = installedVersion();
        if (!rel.asset || !current || !newer(rel.version, current)) return { ok: false, error: "No update available." };
        const url = String(rel.asset.browser_download_url);
        if (!url.startsWith(RELEASE_PREFIX)) return { ok: false, error: "Unexpected download address." };
        const res = await fetch(url, { headers: { "User-Agent": "VEYA-AI" }, signal: AbortSignal.timeout(300_000) });
        if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1_000_000 || buf[0] !== 0x4d || buf[1] !== 0x5a) return { ok: false, error: "The downloaded file is not a valid installer." };
        const dir = join(app.getPath("temp"), "veya-update");
        mkdirSync(dir, { recursive: true });
        const exe = join(dir, `VEYA-AI-Setup-${rel.version.replace(/[^\w.-]/g, "")}.exe`);
        writeFileSync(exe, buf);
        const child = spawn(exe, ["--update"], { detached: true, stdio: "ignore", windowsHide: false });
        child.unref();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
    }
}
