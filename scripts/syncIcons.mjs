/*
 * VEYA-AI – überträgt assets/veya-icons.json in das Discord-Plugin und den Installer.
 * Aufruf: node scripts/syncIcons.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const all = JSON.parse(readFileSync(join(root, "assets/veya-icons.json"), "utf8"));
const icons = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("_")));
const json = JSON.stringify(icons);

// Plugin
const tsxPath = join(root, "src/plugins/veyaAI/icons.tsx");
let tsx = readFileSync(tsxPath, "utf8");
tsx = tsx.replace(/export type VeyaIconName = [^;]+;/, `export type VeyaIconName = ${Object.keys(icons).map(k => JSON.stringify(k)).join(" | ")};`);
tsx = tsx.replace(/const ICONS: Record<VeyaIconName, IconDef> = .*?;\n/s, `const ICONS: Record<VeyaIconName, IconDef> = ${json};\n`);
writeFileSync(tsxPath, tsx);

// Installer
const htmlPath = join(root, "installer/installer.html");
let html = readFileSync(htmlPath, "utf8");
html = html.replace(/const VEYA_ICONS = .*?;\n/s, `const VEYA_ICONS = ${json};\n`);
writeFileSync(htmlPath, html);

console.log(`✓ ${Object.keys(icons).length} Icons synchronisiert`);
