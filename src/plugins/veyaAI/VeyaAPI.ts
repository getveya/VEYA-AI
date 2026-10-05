/*
 * VEYA-AI – VeyaAPI.ts
 * Storage for plugins/themes + the public API community plugins can use.
 *
 * Available in every community plugin as the global `VEYA`:
 *   const answer = await VEYA.ai.ask("What is 2+2?");
 */

import { PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

import type { ChatMessage, Part, Provider } from "./native";
import { showToast } from "@webpack/common";

import { currentProvider, modelFor, PROVIDERS, providerLabel, setModelFor, settings, targetLanguage } from "./settings";

export const Native = VencordNative.pluginHelpers["VEYA-AI"] as PluginNative<typeof import("./native")>;

export type AIProvider = Provider;
export type VeyaMessage = ChatMessage;

/** Where a plugin/theme comes from – decides whether a review is needed before activating */
export type VeyaOrigin = "own" | "ai" | "imported" | "store" | "example" | "builtin";

export interface VeyaPluginMeta {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    authorId?: string;
    tags?: string[];
    icon?: string;
    code: string;
    createdAt: number;
    updatedAt: number;
    origin?: VeyaOrigin;
    /** User has reviewed the code and trusts the plugin */
    trusted?: boolean;
    /** Hash of the code at approval time – if the code changes, it must be reviewed again */
    trustedHash?: string;
}

export interface VeyaThemeMeta {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    authorId?: string;
    tags?: string[];
    preview?: string;
    css: string;
    createdAt: number;
    updatedAt: number;
    origin?: VeyaOrigin;
}

// ─── Storage (local, in Discord's localStorage) ──────────────────────────────

const K = {
    plugins: "veya_community_plugins",
    themes: "veya_community_themes",
    activePlugins: "veya_active_plugins",
    activeTheme: "veya_active_theme",
};

function readJson<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback; } catch { return fallback; }
}

export const VeyaStorage = {
    getPlugins(): VeyaPluginMeta[] { return readJson(K.plugins, []); },
    getPlugin(id: string) { return this.getPlugins().find(p => p.id === id); },
    savePlugin(plugin: VeyaPluginMeta) {
        const list = this.getPlugins().filter(p => p.id !== plugin.id);
        list.push({ ...plugin, updatedAt: Date.now() });
        localStorage.setItem(K.plugins, JSON.stringify(list));
    },
    deletePlugin(id: string) {
        localStorage.setItem(K.plugins, JSON.stringify(this.getPlugins().filter(p => p.id !== id)));
        this.setPluginActive(id, false);
    },

    getThemes(): VeyaThemeMeta[] { return readJson(K.themes, []); },
    saveTheme(theme: VeyaThemeMeta) {
        const list = this.getThemes().filter(t => t.id !== theme.id);
        list.push({ ...theme, updatedAt: Date.now() });
        localStorage.setItem(K.themes, JSON.stringify(list));
    },
    deleteTheme(id: string) {
        localStorage.setItem(K.themes, JSON.stringify(this.getThemes().filter(t => t.id !== id)));
        if (this.getActiveTheme() === id) this.setActiveTheme(null);
    },

    getActivePlugins(): Set<string> { return new Set(readJson<string[]>(K.activePlugins, [])); },
    setPluginActive(id: string, active: boolean) {
        const set = this.getActivePlugins();
        if (active) set.add(id); else set.delete(id);
        localStorage.setItem(K.activePlugins, JSON.stringify([...set]));
    },
    isPluginActive(id: string) { return this.getActivePlugins().has(id); },

    getActiveTheme(): string | null { return localStorage.getItem(K.activeTheme); },
    setActiveTheme(id: string | null) {
        if (id) localStorage.setItem(K.activeTheme, id);
        else localStorage.removeItem(K.activeTheme);
    },

    flag(name: string): boolean { return localStorage.getItem(`veya_flag_${name}`) === "1"; },
    setFlag(name: string) { localStorage.setItem(`veya_flag_${name}`, "1"); },
};

// ─── AI (runs via the main process – keys stay there) ─────────────────────────

let reqCounter = 0;

export type { Part };

/** Models of all providers – so the main process can switch automatically for images/audio */
export function allModels(): Record<Provider, string> {
    return Object.fromEntries(PROVIDERS.map(p => [p.id, modelFor(p.id)])) as Record<Provider, string>;
}

/** The main process switched to another model because the configured one is gone → remember it */
function noteModel(requested: string, provider?: Provider, model?: string) {
    if (!provider || !model || requested === "auto" || requested === model || provider !== currentProvider()) return;
    // The chosen model failed – switch this provider to automatic model selection
    setModelFor(provider, "auto");
    try { showToast(`${requested} didn't work – VEYA now picks the ${providerLabel(provider)} model automatically (using ${model})`, "message"); } catch { }
}

export async function callAI(messages: VeyaMessage[], maxTokens = 1024): Promise<string> {
    const provider = currentProvider();
    const model = modelFor(provider);
    const res = await Native.chatOnce({ provider, model, messages, maxTokens, models: allModels() });
    if (res.error) throw new Error(res.error);
    noteModel(model, res.provider, res.model);
    return res.text;
}

/**
 * Answer piece by piece. `onText` always receives the full text so far.
 * Returns a function to cancel.
 */
export function streamAI(
    messages: VeyaMessage[],
    onText: (text: string) => void,
    onDone: (error?: string) => void,
    maxTokens = 1024
): () => void {
    const provider = currentProvider();
    const model = modelFor(provider);
    const id = `veya-${Date.now().toString(36)}-${++reqCounter}`;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
        if (stopped) return;
        const r = await Native.chatPoll(id);
        if (stopped) return;
        if (r.text) onText(r.text);
        if (r.done) { stopped = true; if (!r.error) noteModel(model, r.provider, r.model); onDone(r.error); return; }
        timer = setTimeout(poll, 80);
    };

    Native.chatStart(id, { provider, model, messages, maxTokens, models: allModels() }).then(r => {
        if (!r.ok) { stopped = true; onDone(r.error); return; }
        poll();
    });

    return () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        Native.chatCancel(id);
        onDone();
    };
}

// ─── Public VEYA API for community plugins ────────────────────────────────────

function safeAsk(messages: VeyaMessage[], maxTokens?: number) {
    return callAI(messages, maxTokens).catch(e => `Error: ${e.message}`);
}

export const VEYA = Object.freeze({
    ai: Object.freeze({
        /** Simple question → answer (text) */
        ask: (prompt: string, systemPrompt?: string) =>
            safeAsk([
                ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
                { role: "user" as const, content: String(prompt) },
            ]),
        /** Conversation with multiple messages */
        chat: (messages: VeyaMessage[], maxTokens?: number) => safeAsk(messages, maxTokens),
        /** Active provider */
        getProvider: () => currentProvider(),
    }),

    storage: Object.freeze({
        get: (key: string): any => readJson(`veya_plugin_${key}`, null),
        set: (key: string, value: any) => localStorage.setItem(`veya_plugin_${key}`, JSON.stringify(value)),
        delete: (key: string) => localStorage.removeItem(`veya_plugin_${key}`),
    }),

    utils: Object.freeze({
        getUserId: (): string | null => {
            try { return UserStore.getCurrentUser()?.id ?? null; } catch { return null; }
        },
        formatDate: (ts: number) => new Date(ts).toLocaleDateString(undefined),
    }),
});

/** Move old plaintext keys from the settings into encrypted storage and delete them there */
export async function migratePlaintextKeys() {
    const s = settings.store;
    const old = { claude: s.apiKeyClaud, openai: s.apiKeyOpenAI, gemini: s.apiKeyGemini, deepseek: s.apiKeyDeepSeek };
    if (!Object.values(old).some(Boolean)) return;
    try {
        await Native.migrateKeys(old);
        s.apiKeyClaud = s.apiKeyOpenAI = s.apiKeyGemini = s.apiKeyDeepSeek = "";
    } catch (e) {
        console.error("[VEYA-AI] Key migration failed", e);
    }
}


// ─── Media ───────────────────────────────────────────────────────────────────

/** Load a Discord file (image/audio) – via the main process, because Discord blocks this in the renderer */
export async function loadMedia(url: string): Promise<{ data: string; mime: string; }> {
    const r = await Native.fetchMedia(url);
    if (!r.ok || !r.data) throw new Error(r.error ?? "Could not load the file.");
    return { data: r.data, mime: r.mime ?? "application/octet-stream" };
}

export async function transcribeAudio(url: string): Promise<string> {
    const media = await loadMedia(url);
    const r = await Native.transcribe(media, allModels(), targetLanguage());
    if (r.error) throw new Error(r.error);
    return r.text;
}
