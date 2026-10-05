/*
 * VEYA-AI – security.ts
 * Scans community plugin code for risky spots before it runs.
 *
 * Important: this is a warning aid, not a sandbox. Community plugins run with the same
 * permissions as Discord itself. A plugin without warnings can still be harmful –
 * so every third-party plugin must be explicitly approved before its first start.
 */

import type { VeyaPluginMeta } from "./VeyaAPI";

export type RiskLevel = "high" | "medium" | "low";

export interface RiskFinding {
    level: RiskLevel;
    title: string;
    detail: string;
    /** Line numbers in the code (1-based) */
    lines: number[];
}

interface Rule { level: RiskLevel; title: string; detail: string; re: RegExp; }

const RULES: Rule[] = [
    {
        level: "high", title: "Accesses your login token",
        detail: "With the token, someone can take over your account completely. No normal plugin needs it.",
        re: /getToken|\btoken\b|authorization|tokens?\s*[:=]/i,
    },
    {
        level: "high", title: "Loads or generates code at runtime",
        detail: "eval, new Function or dynamically loaded scripts can later run arbitrary code you can't see here.",
        re: /\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(|createElement\s*\(\s*["'`]script|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/,
    },
    {
        level: "high", title: "Obfuscated code",
        detail: "Deliberately unreadable code is a typical sign of malware.",
        re: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){5,}|\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){5,}|["'`][A-Za-z0-9+/=]{200,}["'`]|\batob\s*\(|String\.fromCharCode\s*\(.{40,}/i,
    },
    {
        level: "high", title: "Accesses Discord internals or Vencord",
        detail: "Hooks directly into Discord or Vencord (e.g. webpack modules, VencordNative). That makes practically anything possible.",
        re: /webpackChunk|__webpack_require__|\bVencord\b|VencordNative|DiscordNative|findByProps|findByCode|\bwreq\b/,
    },
    {
        level: "medium", title: "Sends data to the internet",
        detail: "The plugin can send data to third-party servers. Check where it goes and what is sent.",
        re: /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.sendBeacon/,
    },
    {
        level: "medium", title: "Reads or changes stored browser data",
        detail: "localStorage, IndexedDB and cookies contain data from Discord and other plugins.",
        re: /localStorage|sessionStorage|indexedDB|document\.cookie/,
    },
    {
        level: "medium", title: "Injects HTML directly into Discord",
        detail: "innerHTML can be used to inject code or fake parts of the interface (e.g. fake login windows).",
        re: /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    },
    {
        level: "low", title: "Reads the clipboard",
        detail: "The plugin can read or change copied text.",
        re: /clipboard/i,
    },
    {
        level: "low", title: "Opens windows or links",
        detail: "The plugin can open web pages.",
        re: /window\.open|location\.href\s*=|location\.assign/,
    },
];

export function scanCode(code: string): RiskFinding[] {
    const lines = code.split("\n");
    const findings: RiskFinding[] = [];
    for (const rule of RULES) {
        const hits: number[] = [];
        lines.forEach((l, i) => { if (rule.re.test(l)) hits.push(i + 1); });
        if (hits.length) findings.push({ level: rule.level, title: rule.title, detail: rule.detail, lines: hits.slice(0, 12) });
    }
    if (code.length > 60_000) {
        findings.push({ level: "medium", title: "Lots of code", detail: "Long plugins are hard to review. Be extra careful.", lines: [] });
    }
    const order: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
    return findings.sort((a, b) => order[a.level] - order[b.level]);
}

export function overallRisk(findings: RiskFinding[]): RiskLevel | "none" {
    if (findings.some(f => f.level === "high")) return "high";
    if (findings.some(f => f.level === "medium")) return "medium";
    if (findings.length) return "low";
    return "none";
}

/** Simple, stable hash (FNV-1a) – detects whether the code has changed since approval */
export function hashCode(code: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < code.length; i++) {
        h ^= code.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0") + ":" + code.length;
}

/** Does the plugin still need to be reviewed before starting? */
export function needsReview(p: VeyaPluginMeta): boolean {
    if (p.origin === "own" || p.origin === "builtin") return false;
    // Older plugins without an origin are treated as third-party
    return !(p.trusted && p.trustedHash === hashCode(p.code));
}

export const ORIGIN_LABEL: Record<string, string> = {
    own: "Own",
    ai: "AI-generated",
    imported: "Imported",
    store: "Online-Store",
    example: "Example",
    builtin: "VEYA",
};
