/*
 * VEYA-AI – PluginEngine.ts
 * Loads community plugins & themes, import/export, examples and bundled themes.
 *
 * Community plugins do NOT run in a real sandbox. That's why a third-party plugin
 * (imported, from the Store, AI-generated, example) only starts after the user has reviewed
 * and approved the code – and again whenever the code changes.
 */

import { BUILTIN_THEMES, BUILTIN_THEMES_VERSION, hardenCss } from "./themes";
import { hashCode, needsReview } from "./security";
import { Native, VEYA, type VeyaOrigin, type VeyaPluginMeta, VeyaStorage, type VeyaThemeMeta } from "./VeyaAPI";

const running = new Map<string, { cleanup?: () => void; }>();
const log = (...a: any[]) => console.log("%c[VEYA-AI]", "color:#ccff00;font-weight:bold", ...a);

// ─── Running plugins ─────────────────────────────────────────────────────────

/** Accepts the common ways AI/people write plugins: export default, plain object, imports */
export function normalizeCode(code: string): string {
    let c = code.replace(/^\s*import\s.+?;?\s*$/gm, "");
    c = c.replace(/export\s+default\s+/g, "module.exports = ");
    c = c.replace(/^\s*export\s+(const|let|var|function|async function)\s+/gm, "$1 ");
    return c;
}

async function runPlugin(plugin: VeyaPluginMeta): Promise<{ ok: boolean; error?: string; }> {
    if (needsReview(plugin)) return { ok: false, error: "This plugin hasn't been reviewed and approved yet." };
    if (running.has(plugin.id)) return { ok: true };
    try {
        const fn = new Function("VEYA", "React", `"use strict";\nconst module = { exports: {} };\nconst exports = module.exports;\n${normalizeCode(plugin.code)}\n;return module.exports;`);
        const exp = fn(VEYA, (window as any).Vencord?.Webpack?.Common?.React);
        if (typeof exp?.onLoad === "function") await exp.onLoad();
        running.set(plugin.id, { cleanup: typeof exp?.onUnload === "function" ? exp.onUnload : undefined });
        log(`Plugin "${plugin.name}" started`);
        return { ok: true };
    } catch (e: any) {
        console.error(`[VEYA-AI] Plugin "${plugin.name}" error:`, e);
        return { ok: false, error: String(e?.message ?? e) };
    }
}

function stopPlugin(id: string) {
    const inst = running.get(id);
    try { inst?.cleanup?.(); } catch (e) { console.error("[VEYA-AI] onUnload error", e); }
    running.delete(id);
}

export async function loadAllActivePlugins() {
    const active = VeyaStorage.getActivePlugins();
    for (const p of VeyaStorage.getPlugins()) {
        if (!active.has(p.id)) continue;
        if (needsReview(p)) {
            // Code changed since approval → don't start, deactivate
            VeyaStorage.setPluginActive(p.id, false);
            log(`Plugin "${p.name}" was changed and needs a new approval`);
            continue;
        }
        await runPlugin(p);
    }
}

export function stopAllPlugins() {
    for (const id of [...running.keys()]) stopPlugin(id);
}

export async function togglePlugin(plugin: VeyaPluginMeta, enable: boolean) {
    if (!enable) {
        VeyaStorage.setPluginActive(plugin.id, false);
        stopPlugin(plugin.id);
        return { ok: true };
    }
    const res = await runPlugin(plugin);
    VeyaStorage.setPluginActive(plugin.id, res.ok);
    return res;
}

/** User has reviewed the code → approve */
export function trustPlugin(plugin: VeyaPluginMeta): VeyaPluginMeta {
    const p = { ...plugin, trusted: true, trustedHash: hashCode(plugin.code) };
    VeyaStorage.savePlugin(p);
    return p;
}

export function isRunning(id: string) { return running.has(id); }

// ─── Themes ──────────────────────────────────────────────────────────────────

export function applyTheme(css: string | null) {
    let el = document.getElementById("veya-ai-theme") as HTMLStyleElement | null;
    if (!css) { el?.remove(); return; }
    if (!el) {
        el = document.createElement("style");
        el.id = "veya-ai-theme";
        document.head.appendChild(el);
    }
    el.textContent = `/* VEYA-AI Theme */\n${hardenCss(css)}`;
    // keep our theme last so it wins against styles Discord adds later
    if (el !== document.head.lastElementChild) document.head.appendChild(el);
}

export function loadActiveTheme() {
    const id = VeyaStorage.getActiveTheme();
    const theme = id && VeyaStorage.getThemes().find(t => t.id === id);
    applyTheme(theme ? theme.css : null);
}

/** Add the bundled VEYA themes once */
export function seedBuiltinThemes() {
    // Once per theme version: add missing ones, update existing VEYA themes.
    // If the user deletes a VEYA theme, it only comes back with a new version.
    const flag = `builtin_themes_v${BUILTIN_THEMES_VERSION}`;
    if (VeyaStorage.flag(flag)) return;
    for (const t of BUILTIN_THEMES) VeyaStorage.saveTheme({ ...t, origin: "builtin" });
    VeyaStorage.setFlag(flag);
    if (BUILTIN_THEMES.some(t => t.id === VeyaStorage.getActiveTheme())) loadActiveTheme();
}

/** Import the example plugins from the install folder once (only if chosen in the installer) */
export async function importBundledExamples() {
    if (VeyaStorage.flag("examples_imported")) return;
    try {
        const files = await Native.getBundledExamples();
        for (const text of files) {
            const parsed = parsePackage(text);
            if (parsed.ok) commitPackage(parsed.pkg, "example");
        }
    } catch (e) {
        console.error("[VEYA-AI] Could not load examples", e);
    }
    VeyaStorage.setFlag("examples_imported");
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export interface VeyaExportPackage {
    type: "plugin" | "theme";
    version: "1";
    data: VeyaPluginMeta | VeyaThemeMeta;
    exportedAt: number;
}

export type ParsedPackage =
    | { ok: true; pkg: { type: "plugin"; data: VeyaPluginMeta; } | { type: "theme"; data: VeyaThemeMeta; }; exists: boolean; }
    | { ok: false; message: string; };

const str = (v: any, max: number, fallback = "") => (typeof v === "string" ? v : fallback).slice(0, max);
const cleanId = (v: any) => str(v, 80).toLowerCase().replace(/[^a-z0-9-_]/g, "-") || `package-${Date.now().toString(36)}`;

/** Read and validate a package – does NOT save anything yet (only after confirmation via commitPackage) */
export function parsePackage(json: string): ParsedPackage {
    let pkg: any;
    try { pkg = JSON.parse(json); } catch { return { ok: false, message: "That's not valid JSON." }; }
    if (!pkg || pkg.version !== "1" || !pkg.data || (pkg.type !== "plugin" && pkg.type !== "theme"))
        return { ok: false, message: "That's not a valid VEYA-AI package (.veya.json)." };

    const d = pkg.data;
    const base = {
        id: cleanId(d.id),
        name: str(d.name, 80).trim(),
        description: str(d.description, 500),
        version: str(d.version, 20, "1.0.0"),
        author: str(d.author, 60, "Unknown"),
        tags: Array.isArray(d.tags) ? d.tags.filter((t: any) => typeof t === "string").slice(0, 10).map((t: string) => t.slice(0, 24)) : [],
        createdAt: Number(d.createdAt) || Date.now(),
        updatedAt: Date.now(),
    };
    if (!base.name) return { ok: false, message: "The package has no name." };

    if (pkg.type === "plugin") {
        if (typeof d.code !== "string" || !d.code.trim()) return { ok: false, message: "The plugin has no code." };
        const data: VeyaPluginMeta = { ...base, icon: str(d.icon, 8) || undefined, code: d.code };
        return { ok: true, pkg: { type: "plugin", data }, exists: !!VeyaStorage.getPlugin(data.id) };
    }
    if (typeof d.css !== "string" || !d.css.trim()) return { ok: false, message: "The theme has no CSS." };
    const data: VeyaThemeMeta = { ...base, css: d.css };
    return { ok: true, pkg: { type: "theme", data }, exists: VeyaStorage.getThemes().some(t => t.id === data.id) };
}

/** Save a validated package. Third-party plugins are NEVER activated automatically. */
export function commitPackage(pkg: Extract<ParsedPackage, { ok: true; }>["pkg"], origin: VeyaOrigin, trust = false) {
    if (pkg.type === "plugin") {
        const wasActive = VeyaStorage.isPluginActive(pkg.data.id);
        if (wasActive) { stopPlugin(pkg.data.id); VeyaStorage.setPluginActive(pkg.data.id, false); }
        const p: VeyaPluginMeta = { ...pkg.data, origin, trusted: false, trustedHash: undefined };
        VeyaStorage.savePlugin(trust ? { ...p, trusted: true, trustedHash: hashCode(p.code) } : p);
    } else {
        VeyaStorage.saveTheme({ ...pkg.data, origin });
        if (VeyaStorage.getActiveTheme() === pkg.data.id) loadActiveTheme();
    }
}

function exportPkg(type: "plugin" | "theme", data: any): string {
    // Local approval info doesn't belong in shared files
    const { trusted, trustedHash, origin, ...clean } = data;
    const pkg: VeyaExportPackage = { type, version: "1", data: clean, exportedAt: Date.now() };
    return JSON.stringify(pkg, null, 2);
}

export const exportPlugin = (p: VeyaPluginMeta) => exportPkg("plugin", p);
export const exportTheme = (t: VeyaThemeMeta) => exportPkg("theme", t);

export function downloadAsFile(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
