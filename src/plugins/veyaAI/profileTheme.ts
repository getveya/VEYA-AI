/*
 * VEYA-AI – profileTheme.ts
 * "Profile theme": turns the colors of your Discord profile into a matching theme for all of Discord.
 * And "VEYA Motion": smooth animations everywhere (body class, CSS lives in styles.css).
 */

import { UserProfileStore, UserStore } from "@webpack/common";

import { applyTheme } from "./PluginEngine";
import { settings } from "./settings";
import { theme } from "./themes";
import { VeyaStorage } from "./VeyaAPI";

const hex = (n: number) => "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);

function rgb(h: string) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
    const A = rgb(a), B = rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function luminance(h: string) {
    const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Colors from your own profile (profile theme colors, else accent color, else banner color) */
export function profileColors(): { primary: string; accent: string; } | null {
    const me = UserStore.getCurrentUser();
    if (!me) return null;
    const p: any = UserProfileStore.getUserProfile(me.id);
    const tc: number[] | undefined = p?.themeColors;
    if (tc?.length) return { primary: hex(tc[0]), accent: hex(tc[1] ?? tc[0]) };
    const single = p?.accentColor ?? (me as any).accentColor ?? (me as any).bannerColor;
    if (typeof single === "number") return { primary: hex(single), accent: hex(single) };
    if (typeof single === "string" && /^#?[0-9a-f]{6}$/i.test(single)) { const h = single.startsWith("#") ? single : "#" + single; return { primary: h, accent: h }; }
    return null;
}

export const PROFILE_THEME_ID = "veya-profile";

/** Creates/updates the profile theme and enables it. Returns false if the profile has no colors. */
export function applyProfileTheme(): boolean {
    const c = profileColors();
    if (!c) return false;
    const ink = "#0a0a0d";
    const accent = luminance(c.accent) < 0.12 ? mix(c.accent, "#ffffff", 0.45) : c.accent;
    const t = theme(PROFILE_THEME_ID, "My profile", "Automatically created from the colors of your Discord profile.", ["profile", "auto"], {
        base: mix(ink, c.primary, 0.16),
        secondary: mix(ink, c.primary, 0.11),
        tertiary: mix(ink, c.primary, 0.07),
        floating: mix(ink, c.primary, 0.09),
        accent,
        onAccent: luminance(accent) > 0.45 ? "#050505" : "#ffffff",
        text: mix("#e8e8ea", c.accent, 0.08),
        muted: mix("#9a9aa2", c.accent, 0.15),
        header: "#ffffff",
        hover: mix(ink, c.accent, 0.18),
    });
    t.origin = "own";
    t.createdAt = t.updatedAt = Date.now();
    VeyaStorage.saveTheme(t);
    VeyaStorage.setActiveTheme(t.id);
    applyTheme(t.css);
    return true;
}

export function applyMotion() {
    document.body.classList.toggle("veya-motion", !!settings.store.motionEffects);
}

export function removeMotion() {
    document.body.classList.remove("veya-motion");
}
