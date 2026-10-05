/*
 * VEYA-AI – themes.ts
 * Theme builder: turns a small colour palette into a full Discord theme.
 * Covers the classic colour variables AND the newer "visual refresh" ones, all marked !important,
 * so themes apply everywhere (chat, sidebar, popouts, modals, settings).
 */

import type { VeyaThemeMeta } from "./VeyaAPI";

export interface Palette {
    /** Chat background */
    base: string;
    /** Channel list / sidebars */
    secondary: string;
    /** Server list / darkest layer */
    tertiary: string;
    /** Menus, popouts, modals */
    floating: string;
    /** Accent colour (buttons, links, highlights) */
    accent: string;
    /** Normal text */
    text: string;
    /** Secondary text */
    muted: string;
    /** Headings */
    header?: string;
    /** Text on accent buttons (auto if omitted) */
    onAccent?: string;
    /** Hover/selected background (auto if omitted) */
    hover?: string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgb(hex: string): [number, number, number] | null {
    if (!HEX.test(hex)) return null;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function alpha(color: string, a: number) {
    const c = rgb(color);
    return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : color;
}

function lum(color: string) {
    const c = rgb(color);
    if (!c) return 0.5;
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Full theme CSS from a palette */
export function buildThemeCss(name: string, p: Palette, extra = ""): string {
    const header = p.header ?? p.text;
    const onAccent = p.onAccent ?? (lum(p.accent) > 0.4 ? "#050505" : "#ffffff");
    const hover = p.hover ?? alpha(p.accent, 0.08);
    const selected = alpha(p.accent, 0.14);
    const border = alpha(p.text, 0.08);
    const v: Record<string, string> = {
        // classic
        "background-primary": p.base,
        "background-secondary": p.secondary,
        "background-secondary-alt": p.tertiary,
        "background-tertiary": p.tertiary,
        "background-floating": p.floating,
        "background-nested-floating": p.floating,
        "background-accent": p.floating,
        "background-message-hover": alpha(p.text, 0.03),
        "background-modifier-hover": hover,
        "background-modifier-active": selected,
        "background-modifier-selected": selected,
        "background-modifier-accent": border,
        "channeltextarea-background": p.secondary,
        "input-background": p.tertiary,
        "modal-background": p.base,
        "modal-footer-background": p.secondary,
        "deprecated-card-bg": p.secondary,
        "scrollbar-thin-thumb": alpha(p.text, 0.18),
        "scrollbar-auto-thumb": alpha(p.text, 0.18),
        "scrollbar-auto-track": "transparent",
        // visual refresh
        "background-base-lowest": p.tertiary,
        "background-base-lower": p.secondary,
        "background-base-low": p.base,
        "background-surface-high": p.floating,
        "background-surface-higher": p.floating,
        "background-surface-highest": p.floating,
        "background-mod-subtle": hover,
        "background-mod-normal": selected,
        "background-mod-strong": alpha(p.accent, 0.2),
        "bg-base-primary": p.base,
        "bg-base-secondary": p.secondary,
        "bg-base-tertiary": p.tertiary,
        "bg-surface-raised": p.floating,
        "bg-surface-overlay": p.floating,
        "bg-overlay-chat": p.base,
        "bg-overlay-app-frame": p.tertiary,
        "bg-mod-faint": alpha(p.text, 0.03),
        "bg-mod-subtle": hover,
        "bg-mod-strong": selected,
        "app-frame-background": p.tertiary,
        "chat-background-default": p.base,
        "chat-input-container-background": p.secondary,
        "input-background-default": p.tertiary,
        "border-faint": border,
        "border-subtle": border,
        "border-normal": alpha(p.text, 0.12),
        "border-strong": alpha(p.text, 0.2),
        "app-border-frame": border,
        // accent
        "brand-500": p.accent,
        "brand-560": p.accent,
        "brand-600": p.accent,
        "brand-experiment": p.accent,
        "brand-experiment-560": p.accent,
        "text-brand": p.accent,
        "text-link": p.accent,
        "control-brand-foreground": p.accent,
        "control-brand-foreground-new": p.accent,
        "button-filled-brand-background": p.accent,
        "button-filled-brand-background-hover": p.accent,
        "button-filled-brand-background-active": p.accent,
        "button-filled-brand-text": onAccent,
        "focus-primary": p.accent,
        // text
        "text-normal": p.text,
        "text-default": p.text,
        "text-strong": header,
        "text-subtle": p.muted,
        "text-muted": p.muted,
        "header-primary": header,
        "header-secondary": p.muted,
        "interactive-normal": p.muted,
        "interactive-hover": p.text,
        "interactive-active": header,
        "interactive-muted": alpha(p.muted, 0.5),
        "interactive-text-default": p.muted,
        "interactive-text-hover": p.text,
        "interactive-text-active": header,
        "channels-default": p.muted,
        "channel-icon": p.muted,
        "icon-default": p.muted,
        "icon-strong": header,
    };
    const body = Object.entries(v).map(([k, val]) => `  --${k}: ${val} !important;`).join("\n");
    return `/* VEYA-AI Theme: ${name} */
:root, html, body, .visual-refresh, [class*="theme-"] {
${body}
}
::selection { background: ${alpha(p.accent, 0.35)}; }
${extra}`.trim();
}

/** Makes every custom property in user/AI CSS win against Discord's own definitions */
export function hardenCss(css: string): string {
    return css.replace(/(--[\w-]+\s*:\s*)([^;{}]+?)(\s*)(;|})/g, (m, a, val, ws, end) =>
        /!important/i.test(val) ? m : `${a}${val} !important${ws}${end}`);
}

function builtin(id: string, name: string, description: string, tags: string[], p: Palette, extra = ""): VeyaThemeMeta {
    return { id, name, description, version: "2.0.0", author: "VEYA-AI", tags, css: buildThemeCss(name, p, extra), createdAt: 0, updatedAt: 0, origin: "builtin" };
}

/** Kept for compatibility with older code */
export function theme(id: string, name: string, description: string, tags: string[], c: Palette): VeyaThemeMeta {
    return builtin(id, name, description, tags, c);
}

export const BUILTIN_THEMES: VeyaThemeMeta[] = [
    builtin("veya-neon", "VEYA Neon", "Pitch black with neon lime – the VEYA look.", ["dark", "neon", "veya"], {
        base: "#0a0b08", secondary: "#070806", tertiary: "#050505", floating: "#10120c",
        accent: "#ccff00", text: "#e6ebdc", muted: "#8a9480", header: "#f4f9ea",
    }, `[class*="mentioned"] { background: rgba(204,255,0,0.06) !important; }`),
    builtin("veya-midnight", "VEYA Midnight", "Calm dark blue with a subtle lime accent. Easy on the eyes at night.", ["dark", "blue", "minimal"], {
        base: "#0e1218", secondary: "#0b0e13", tertiary: "#080a0e", floating: "#131923",
        accent: "#b8f000", text: "#d9e0ea", muted: "#7d8898", header: "#f1f5fa",
    }),
    builtin("veya-graphite", "VEYA Graphite", "Neutral grey with hardly any colour – focused and clean.", ["dark", "grey", "clean"], {
        base: "#1a1b1d", secondary: "#151618", tertiary: "#111214", floating: "#202124",
        accent: "#d4ff3a", text: "#dedfe2", muted: "#8b8e94", header: "#f5f6f7", hover: "rgba(255,255,255,0.05)",
    }),
    builtin("veya-ocean", "Ocean", "Deep navy with a bright cyan accent.", ["dark", "blue", "cyan"], {
        base: "#0b1622", secondary: "#08111b", tertiary: "#060c14", floating: "#0f1d2c",
        accent: "#3ec8ff", text: "#d6e6f2", muted: "#7c93a8", header: "#f0f8ff",
    }),
    builtin("veya-sunset", "Sunset", "Warm dark brown with an orange glow.", ["dark", "warm", "orange"], {
        base: "#1a120d", secondary: "#140d09", tertiary: "#0f0906", floating: "#22170f",
        accent: "#ff8a3d", text: "#f1e3d6", muted: "#a68c78", header: "#fff4ea",
    }),
];

export const BUILTIN_THEMES_VERSION = "2";

// ─── Colours for gallery previews ────────────────────────────────────────────

export interface ThemeColors { base: string; secondary: string; tertiary: string; accent: string; text: string; muted: string; }

const DEFAULTS: ThemeColors = { base: "#313338", secondary: "#2b2d31", tertiary: "#1e1f22", accent: "#5865f2", text: "#dbdee1", muted: "#949ba4" };

export function extractColors(css: string): ThemeColors {
    const read = (...names: string[]) => {
        for (const n of names) {
            const m = css.match(new RegExp(`--${n}\\s*:\\s*([^;}!]+)`));
            if (m) return m[1].trim();
        }
        return null;
    };
    return {
        base: read("background-primary", "background-base-low", "bg-base-primary") ?? DEFAULTS.base,
        secondary: read("background-secondary", "background-base-lower") ?? DEFAULTS.secondary,
        tertiary: read("background-tertiary", "background-base-lowest") ?? DEFAULTS.tertiary,
        accent: read("brand-500", "brand-experiment", "text-brand") ?? DEFAULTS.accent,
        text: read("text-normal", "text-default") ?? DEFAULTS.text,
        muted: read("text-muted", "header-secondary") ?? DEFAULTS.muted,
    };
}

/** Palette from a theme's CSS (to edit existing themes with the colour pickers) */
export function paletteFromCss(css: string): Palette {
    const c = extractColors(css);
    const read = (n: string) => css.match(new RegExp(`--${n}\\s*:\\s*([^;}!]+)`))?.[1].trim();
    return { ...c, floating: read("background-floating") ?? c.secondary, header: read("header-primary") ?? c.text };
}
