/*
 * VEYA-AI – StoreUI.tsx
 * Settings page: plugins, themes (gallery), online store, editors, import, AI & keys, about.
 */

import { Alerts, GuildStore, React, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { VEYA_COLORS, VEYA_GRADIENT, VeyaLogo } from "./brand";
import { IconLabel, VIcon, type VeyaIconName } from "./icons";
import {
    applyTheme, commitPackage, downloadAsFile, exportPlugin, exportTheme, isRunning,
    loadActiveTheme, type ParsedPackage, parsePackage, togglePlugin, trustPlugin
} from "./PluginEngine";
import { hashCode, needsReview, ORIGIN_LABEL, overallRisk, type RiskFinding, scanCode } from "./security";
import { currentProvider, LANGUAGES, modelFor, PROVIDERS, setModelFor, settings, targetLanguage } from "./settings";
import { checkUpdates } from "./updater";
import { allKnowledge, loadKnowledge } from "./prompt";
import { RemindersList } from "./reminders";
import { openKnowledgeEditor } from "./serverTools";
import { buildThemeCss, extractColors, type Palette, paletteFromCss } from "./themes";
import { callAI, Native, type VeyaOrigin, type VeyaPluginMeta, VeyaStorage, type VeyaThemeMeta } from "./VeyaAPI";

// ─── Helpers & styles ────────────────────────────────────────────────────────

const genId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
const formatDate = (ts: number) => ts ? new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
const DANGER = "#ed4245";
const WARN = "#f0b232";

const S = {
    card: {
        background: "var(--background-secondary, var(--background-base-lower))",
        borderRadius: "12px",
        padding: "16px 18px",
        border: "1px solid var(--background-modifier-accent)",
        marginBottom: "12px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "8px",
    },
    row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const },
    tag: {
        fontSize: "12px",
        background: "var(--background-modifier-accent)",
        borderRadius: "5px",
        padding: "2px 7px",
        color: "var(--text-muted)",
    },
    badge: (color: string) => ({
        fontSize: "12px",
        fontWeight: 600,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        borderRadius: "5px",
        padding: "2px 7px",
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    }),
    btn: (kind?: "accent" | "danger" | "ghost") => ({
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 14px",
        borderRadius: "8px",
        border: kind === "ghost" ? "1px solid var(--background-modifier-accent)" : "none",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 600,
        background: kind === "accent" ? VEYA_GRADIENT : kind === "danger" ? DANGER : kind === "ghost" ? "transparent" : "var(--background-modifier-accent)",
        color: kind === "accent" ? VEYA_COLORS.onAccent : kind === "danger" ? "white" : "var(--text-normal, var(--text-default))",
    }),
    input: {
        width: "100%",
        background: "var(--background-tertiary, var(--background-base-lowest))",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: "8px",
        padding: "10px 12px",
        color: "var(--text-normal, var(--text-default))",
        fontSize: "15px",
        outline: "none",
        fontFamily: "inherit",
        boxSizing: "border-box" as const,
    },
    textarea: {
        width: "100%",
        background: "var(--background-tertiary, var(--background-base-lowest))",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: "8px",
        padding: "10px 12px",
        color: "var(--text-normal, var(--text-default))",
        fontSize: "13px",
        fontFamily: "var(--font-code, monospace)",
        outline: "none",
        resize: "vertical" as const,
        boxSizing: "border-box" as const,
        minHeight: "160px",
    },
    label: {
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        marginBottom: "8px",
    },
    muted: { fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.5 },
    title: { fontWeight: 700, color: "var(--header-primary)", fontSize: "16px" },
    notice: (color: string) => ({
        padding: "10px 14px",
        borderRadius: "8px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
        fontSize: "14px",
        marginBottom: "12px",
    }),
    empty: { color: "var(--text-muted)", fontSize: "15px", textAlign: "center" as const, padding: "32px 0", whiteSpace: "pre-line" as const },
};

type Notice = { ok: boolean; msg: string; } | null;

function NoticeBox({ notice }: { notice: Notice; }) {
    if (!notice) return null;
    return (
        <div style={S.notice(notice.ok ? VEYA_COLORS.accent : DANGER)} role="status">
            <IconLabel icon={notice.ok ? "check" : "error"}>{notice.msg}</IconLabel>
        </div>
    );
}

function Btn({ kind, icon, children, dot, ...rest }: { kind?: "accent" | "danger" | "ghost"; icon?: VeyaIconName; dot?: boolean; } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...rest} className="veya-card-btn" style={{ ...S.btn(kind), ...(rest.style ?? {}) }}>
            {icon && <VIcon name={icon} size={14} dot={kind === "accent" || kind === "danger" ? false : dot} />}
            {children}
        </button>
    );
}

function IconTile({ name, text }: { name: VeyaIconName; text?: string; }) {
    return (
        <span style={{
            width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
            background: VEYA_COLORS.accentSoft, border: `1px solid ${VEYA_COLORS.accentBorder}`, color: "var(--header-primary)",
        }}>
            {text ? text : <VIcon name={name} size={18} />}
        </span>
    );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties; }) {
    return <div style={{ flex: 1, minWidth: "160px", ...style }}><div style={S.label}>{label}</div>{children}</div>;
}

const RISK_UI = {
    high: { color: DANGER, label: "High risk" },
    medium: { color: WARN, label: "Medium risk" },
    low: { color: "#7dd3fc", label: "Low risk" },
    none: { color: VEYA_COLORS.accent, label: "Nothing suspicious" },
};

function OriginBadge({ origin }: { origin?: VeyaOrigin; }) {
    const o = origin ?? "imported";
    return <span style={S.tag}>{ORIGIN_LABEL[o] ?? o}</span>;
}

// ─── Code review ─────────────────────────────────────────────────────────────

function Findings({ findings }: { findings: RiskFinding[]; }) {
    const risk = overallRisk(findings);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={S.badge(RISK_UI[risk].color)}><VIcon name="shield" size={12} /> {RISK_UI[risk].label}</span>
            {findings.map(f => (
                <div key={f.title} style={{ fontSize: "12.5px", lineHeight: 1.45, paddingLeft: "10px", borderLeft: `2px solid ${RISK_UI[f.level].color}` }}>
                    <b style={{ color: "var(--header-primary)" }}>{f.title}</b>
                    {f.lines.length > 0 && <span style={{ color: "var(--text-muted)" }}> · Line {f.lines.join(", ")}</span>}
                    <div style={{ color: "var(--text-muted)" }}>{f.detail}</div>
                </div>
            ))}
        </div>
    );
}

function CodeView({ code, findings, maxHeight = 260 }: { code: string; findings: RiskFinding[]; maxHeight?: number; }) {
    const marked = useMemo(() => new Set(findings.filter(f => f.level !== "low").flatMap(f => f.lines)), [findings]);
    const lines = code.split("\n");
    return (
        <div style={{ ...S.textarea, minHeight: 0, maxHeight, overflow: "auto", resize: "none" }} className="veya-code">
            {lines.map((l, i) => (
                <div key={i}>
                    <span style={{ color: "var(--text-muted)", userSelect: "none", display: "inline-block", width: "3ch", textAlign: "right", marginRight: "10px", opacity: 0.6 }}>{i + 1}</span>
                    {marked.has(i + 1) ? <mark>{l || " "}</mark> : (l || " ")}
                </div>
            ))}
        </div>
    );
}

/** View for reviewing & approving a third-party plugin */
function ReviewPanel({ plugin, onTrust, onCancel }: { plugin: VeyaPluginMeta; onTrust: () => void; onCancel: () => void; }) {
    const findings = useMemo(() => scanCode(plugin.code), [plugin.code]);
    const [checked, setChecked] = useState(false);
    const high = overallRisk(findings) === "high";
    return (
        <div style={{ ...S.card, borderColor: high ? `color-mix(in srgb, ${DANGER} 45%, transparent)` : "var(--background-modifier-accent)", background: "var(--background-tertiary, var(--background-base-lowest))" }}>
            <div style={S.row}><VIcon name="shield" size={16} /><b style={S.title}>Review before running</b></div>
            <div style={S.muted}>
                Community Plugins run with the same permissions as Discord – including access to your account.
                VEYA can't sandbox the code. Only enable plugins whose code you understand or whose source you trust.
            </div>
            <Findings findings={findings} />
            <CodeView code={plugin.code} findings={findings} />
            <label className="veya-check" style={{ fontSize: "14px" }}>
                <input type="checkbox" checked={checked} onChange={e => setChecked(e.currentTarget.checked)} />
                I've reviewed the code and trust the source.
            </label>
            <div style={S.row}>
                <Btn kind={high ? "danger" : "accent"} icon="power" disabled={!checked} onClick={onTrust}>
                    {high ? "Trust anyway & run" : "Trust & run"}
                </Btn>
                <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
            </div>
        </div>
    );
}

function confirmDelete(name: string, onConfirm: () => void) {
    Alerts.show({
        title: `Delete "${name}"?`,
        body: "This can't be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
        onConfirm,
    });
}

// ─── Plugin card ─────────────────────────────────────────────────────────────

function PluginCard({ plugin, onRefresh }: { plugin: VeyaPluginMeta; onRefresh: () => void; }) {
    const [active, setActive] = useState(VeyaStorage.isPluginActive(plugin.id) && isRunning(plugin.id));
    const [busy, setBusy] = useState(false);
    const [showCode, setShowCode] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const findings = useMemo(() => scanCode(plugin.code), [plugin.code]);
    const risk = overallRisk(findings);
    const review = needsReview(plugin);

    async function enable(p: VeyaPluginMeta) {
        setBusy(true); setError(null);
        const res = await togglePlugin(p, true);
        setActive(res.ok);
        if (!res.ok) setError(res.error ?? "Plugin failed to start.");
        setBusy(false);
        onRefresh();
    }

    async function toggle() {
        if (active) {
            await togglePlugin(plugin, false);
            setActive(false);
            onRefresh();
            return;
        }
        if (review) { setReviewing(true); return; }
        enable(plugin);
    }

    return (
        <div style={S.card}>
            <div style={S.row}>
                <IconTile name="plug" text={plugin.icon && plugin.icon !== "🔌" ? plugin.icon : undefined} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.title}>
                        {plugin.name} <span style={{ ...S.tag, marginLeft: "4px" }}>v{plugin.version}</span>
                    </div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>by {plugin.author} · {formatDate(plugin.updatedAt)}</div>
                </div>
                <OriginBadge origin={plugin.origin} />
                {risk !== "none" && <span style={S.badge(RISK_UI[risk].color)} title="Code review result"><VIcon name="shield" size={11} /> {RISK_UI[risk].label}</span>}
                {active && <span style={S.badge(VEYA_COLORS.accent)}>Active</span>}
            </div>

            {plugin.description && <div style={{ fontSize: "15px", lineHeight: 1.45 }}>{plugin.description}</div>}
            {!!plugin.tags?.length && <div style={S.row}>{plugin.tags.map(t => <span key={t} style={S.tag}>#{t}</span>)}</div>}
            {review && !active && !reviewing && (
                <div style={{ fontSize: "12px", color: WARN }}><IconLabel icon="shield" size={12}>Must be reviewed before first run</IconLabel></div>
            )}
            {error && <div style={S.notice(DANGER)}>{error}</div>}

            {reviewing && (
                <ReviewPanel
                    plugin={plugin}
                    onCancel={() => setReviewing(false)}
                    onTrust={() => { setReviewing(false); enable(trustPlugin(plugin)); }}
                />
            )}
            {showCode && !reviewing && <CodeView code={plugin.code} findings={findings} />}

            <div style={S.row}>
                <Btn kind={active ? "danger" : "accent"} icon="power" disabled={busy || reviewing} onClick={toggle}>
                    {busy ? "…" : active ? "Disable" : review ? "Review & enable" : "Enable"}
                </Btn>
                <Btn icon="code" onClick={() => setShowCode(v => !v)}>{showCode ? "Hide code" : "Code"}</Btn>
                <Btn icon="export" onClick={() => downloadAsFile(exportPlugin(plugin), `${plugin.id}.veya.json`)}>Export</Btn>
                <Btn kind="ghost" icon="trash" title="Delete" aria-label="Delete"
                    onClick={() => confirmDelete(plugin.name, () => { togglePlugin(plugin, false); VeyaStorage.deletePlugin(plugin.id); onRefresh(); })} />
            </div>
        </div>
    );
}

// ─── Theme Gallery ───────────────────────────────────────────────────────────

/** Mini Discord in the theme's colours */
function ThemePreview({ css, height = 110 }: { css: string; height?: number; }) {
    const c = extractColors(css);
    const bar = (w: string, color: string, o = 1) => <div style={{ height: "6px", width: w, borderRadius: "3px", background: color, opacity: o }} />;
    return (
        <div style={{ display: "flex", height, borderRadius: "8px", overflow: "hidden", border: "1px solid var(--background-modifier-accent)" }} aria-hidden="true">
            <div style={{ width: "16%", background: c.tertiary, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", paddingTop: "8px" }}>
                {[c.accent, c.secondary, c.secondary].map((col, i) => <div key={i} style={{ width: "18px", height: "18px", borderRadius: i ? "50%" : "6px", background: col }} />)}
            </div>
            <div style={{ width: "26%", background: c.secondary, padding: "10px 8px", display: "flex", flexDirection: "column", gap: "7px" }}>
                {bar("80%", c.text, 0.8)}{bar("60%", c.muted, 0.7)}{bar("70%", c.muted, 0.7)}{bar("50%", c.muted, 0.7)}
            </div>
            <div style={{ flex: 1, background: c.base, padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {[["70%", "40%"], ["85%", "55%"]].map(([a, b], i) => (
                    <div key={i} style={{ display: "flex", gap: "6px" }}>
                        <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: i ? c.muted : c.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>{bar(b, c.text, 0.9)}{bar(a, c.muted, 0.6)}</div>
                    </div>
                ))}
                <div style={{ marginTop: "auto", height: "16px", borderRadius: "5px", background: c.secondary, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "5px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.accent }} />
                </div>
            </div>
        </div>
    );
}

function ThemeCard({ theme, onRefresh }: { theme: VeyaThemeMeta; onRefresh: () => void; }) {
    const active = VeyaStorage.getActiveTheme() === theme.id;
    const [showCss, setShowCss] = useState(false);

    function toggle() {
        if (active) { VeyaStorage.setActiveTheme(null); applyTheme(null); }
        else { VeyaStorage.setActiveTheme(theme.id); applyTheme(theme.css); }
        onRefresh();
    }

    return (
        <div style={{ ...S.card, marginBottom: 0, borderColor: active ? VEYA_COLORS.accentBorder : "var(--background-modifier-accent)", boxShadow: active ? `0 0 0 1px ${VEYA_COLORS.accentBorder}` : undefined }}>
            <ThemePreview css={theme.css} />
            <div style={S.row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.title}>{theme.name}</div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>by {theme.author}</div>
                </div>
                <OriginBadge origin={theme.origin} />
                {active && <span style={S.badge(VEYA_COLORS.accent)}>Active</span>}
            </div>
            {theme.description && <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{theme.description}</div>}
            {showCss && <textarea readOnly value={theme.css} style={{ ...S.textarea, minHeight: "140px" }} />}
            <div style={S.row}>
                <Btn kind={active ? "danger" : "accent"} icon="palette" onClick={toggle}>{active ? "Turn off" : "Apply"}</Btn>
                <Btn icon="code" onClick={() => setShowCss(v => !v)} title="Show CSS" aria-label="Show CSS" />
                <Btn icon="export" onClick={() => downloadAsFile(exportTheme(theme), `${theme.id}.veya.json`)} title="Export" aria-label="Export" />
                <Btn kind="ghost" icon="trash" title="Delete" aria-label="Delete"
                    onClick={() => confirmDelete(theme.name, () => { if (active) applyTheme(null); VeyaStorage.deleteTheme(theme.id); onRefresh(); })} />
            </div>
        </div>
    );
}

// ─── Lists ───────────────────────────────────────────────────────────────────

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string; }) {
    return (
        <div style={{ position: "relative", marginBottom: "12px" }}>
            <span style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex" }}><VIcon name="search" size={15} /></span>
            <input value={value} onChange={e => onChange(e.currentTarget.value)} placeholder={placeholder} style={{ ...S.input, paddingLeft: "34px" }} aria-label={placeholder} />
        </div>
    );
}

const matches = (q: string, ...fields: (string | string[] | undefined)[]) =>
    !q || fields.flat().some(f => f?.toLowerCase().includes(q.toLowerCase()));

function PluginsTab() {
    const [list, setList] = useState<VeyaPluginMeta[]>([]);
    const [q, setQ] = useState("");
    const refresh = () => setList(VeyaStorage.getPlugins().sort((a, b) => b.updatedAt - a.updatedAt));
    useEffect(refresh, []);
    const filtered = list.filter(p => matches(q, p.name, p.description, p.tags, p.author));
    return (
        <div>
            <div style={S.label}>Installed plugins ({list.length})</div>
            <SearchInput value={q} onChange={setQ} placeholder="Search plugins…" />
            {filtered.length === 0
                ? <div style={S.empty}>{q ? "No plugins found." : "No plugins yet.\nCreate one under \"New Plugin\", get one from the online store or import a .veya.json."}</div>
                : filtered.map(p => <PluginCard key={p.id + p.updatedAt} plugin={p} onRefresh={refresh} />)}
        </div>
    );
}

function ThemesTab() {
    const [list, setList] = useState<VeyaThemeMeta[]>([]);
    const [q, setQ] = useState("");
    const refresh = () => setList(VeyaStorage.getThemes().sort((a, b) => (a.origin === "builtin" ? -1 : 0) - (b.origin === "builtin" ? -1 : 0) || b.updatedAt - a.updatedAt));
    useEffect(refresh, []);
    const filtered = list.filter(t => matches(q, t.name, t.description, t.tags, t.author));
    return (
        <div>
            <div style={S.label}>Theme Gallery ({list.length})</div>
            <SearchInput value={q} onChange={setQ} placeholder="Search themes…" />
            {filtered.length === 0
                ? <div style={S.empty}>{q ? "No themes found." : "No themes yet."}</div>
                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
                    {filtered.map(t => <ThemeCard key={t.id + t.updatedAt} theme={t} onRefresh={refresh} />)}
                </div>}
        </div>
    );
}

// ─── Package preview (import & online store) ──────────────────────────────────

function PackagePreview({ parsed, origin, onDone, onCancel }: {
    parsed: Extract<ParsedPackage, { ok: true; }>;
    origin: VeyaOrigin;
    onDone: (msg: string) => void;
    onCancel: () => void;
}) {
    const { pkg, exists } = parsed;
    const findings = useMemo(() => pkg.type === "plugin" ? scanCode(pkg.data.code) : [], [pkg]);
    const externalCss = pkg.type === "theme" && /@import|url\(\s*["']?https?:/i.test(pkg.data.css);

    function save() {
        commitPackage(pkg, origin);
        onDone(pkg.type === "plugin"
            ? `"${pkg.data.name}" saved. It's still off – review and enable it under "Plugins".`
            : `Theme "${pkg.data.name}" saved. Apply it under "Themes".`);
    }

    return (
        <div style={S.card}>
            <div style={S.row}>
                <IconTile name={pkg.type === "plugin" ? "plug" : "palette"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.title}>{pkg.data.name} <span style={S.tag}>v{pkg.data.version}</span></div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>{pkg.type === "plugin" ? "Plugin" : "Theme"} by {pkg.data.author}</div>
                </div>
            </div>
            {pkg.data.description && <div style={{ fontSize: "15px", lineHeight: 1.45 }}>{pkg.data.description}</div>}
            {exists && <div style={S.notice(WARN)}>A package with this ID is already installed and will be replaced{pkg.type === "plugin" ? " (and must be approved again)" : ""}.</div>}

            {pkg.type === "plugin"
                ? <>
                    <Findings findings={findings} />
                    <CodeView code={pkg.data.code} findings={findings} maxHeight={220} />
                    <div style={S.muted}>The plugin is only saved, not started. You'll need to explicitly approve it before its first run.</div>
                </>
                : <>
                    <ThemePreview css={pkg.data.css} height={120} />
                    {externalCss && <div style={{ fontSize: "12px", color: WARN }}>This theme loads content from external servers (images/fonts). Those servers can see your IP address.</div>}
                </>}

            <div style={S.row}>
                <Btn kind="accent" icon="import" onClick={save}>{exists ? "Replace" : "Save"}</Btn>
                <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
            </div>
        </div>
    );
}

// ─── Online store ────────────────────────────────────────────────────────────

interface StoreItem { type: "plugin" | "theme"; id: string; name: string; description?: string; author?: string; tags?: string[]; version?: string; url: string; }

function OnlineTab() {
    const { storeUrl, storeSubmitUrl } = settings.use(["storeUrl", "storeSubmitUrl"]);
    const [items, setItems] = useState<StoreItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");
    const [type, setType] = useState<"all" | "plugin" | "theme">("all");
    const [preview, setPreview] = useState<Extract<ParsedPackage, { ok: true; }> | null>(null);
    const [notice, setNotice] = useState<Notice>(null);

    async function load() {
        setLoading(true); setError(null);
        const res = await Native.fetchText(storeUrl);
        setLoading(false);
        if (!res.ok || !res.text) { setError(`Store unreachable: ${res.error}`); setItems(null); return; }
        try {
            const idx = JSON.parse(res.text);
            const list: StoreItem[] = (Array.isArray(idx?.items) ? idx.items : [])
                .filter((i: any) => (i?.type === "plugin" || i?.type === "theme") && typeof i.url === "string" && typeof i.name === "string")
                .slice(0, 500);
            setItems(list);
        } catch { setError("The store list isn't valid JSON."); }
    }
    useEffect(() => { load(); }, [storeUrl]);

    async function open(item: StoreItem) {
        setNotice(null);
        let url = item.url;
        try { url = new URL(item.url, storeUrl).href; } catch { }
        const res = await Native.fetchText(url);
        if (!res.ok || !res.text) { setNotice({ ok: false, msg: `Download failed: ${res.error}` }); return; }
        const parsed = parsePackage(res.text);
        if (!parsed.ok) { setNotice({ ok: false, msg: parsed.message }); return; }
        setPreview(parsed);
    }

    const [installing, setInstalling] = useState<string | null>(null);
    async function install(item: StoreItem) {
        setNotice(null); setInstalling(item.type + item.id);
        try {
            let url = item.url;
            try { url = new URL(item.url, storeUrl).href; } catch { }
            const res = await Native.fetchText(url);
            if (!res.ok || !res.text) throw new Error(`Download failed: ${res.error ?? "no data"}`);
            const parsed = parsePackage(res.text);
            if (!parsed.ok) throw new Error(parsed.message);
            if (parsed.pkg.type === "plugin") {
                // plugins are shown first – they run with full rights
                setPreview(parsed);
            } else {
                commitPackage(parsed.pkg, "store");
                VeyaStorage.setActiveTheme(parsed.pkg.data.id);
                loadActiveTheme();
                setNotice({ ok: true, msg: `Theme "${parsed.pkg.data.name}" installed and applied.` });
            }
        } catch (e: any) {
            console.error("[VEYA-AI] store install failed", e);
            setNotice({ ok: false, msg: String(e?.message ?? e) });
        } finally {
            setInstalling(null);
        }
    }

    if (preview) {
        return <PackagePreview parsed={preview} origin="store"
            onCancel={() => setPreview(null)}
            onDone={msg => { setPreview(null); setNotice({ ok: true, msg }); }} />;
    }

    const filtered = (items ?? []).filter(i => (type === "all" || i.type === type) && matches(q, i.name, i.description, i.tags, i.author));
    const placeholder = !!error && /404/.test(error);

    return (
        <div>
            <div style={{ ...S.row, justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={S.label}>Online store</div>
                <div style={S.row}>
                    <Btn kind="ghost" icon="refresh" onClick={load} disabled={loading}>{loading ? "Loading…" : "Reload"}</Btn>
                    <a href={storeSubmitUrl} target="_blank" rel="noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none" }}><VIcon name="export" size={14} /> Submit your own</a>
                </div>
            </div>
            <NoticeBox notice={notice} />
            {placeholder && (
                <div style={S.notice(WARN)}>
                    No store is set up yet. Create a GitHub repository with an <code>index.json</code>
                    (template: the <code>store-template</code> folder in the VEYA project) and enter its address under "AI & Keys → Online store".
                </div>
            )}
            {error && !placeholder && <div style={S.notice(DANGER)}>{error}</div>}
            {items && (
                <>
                    <div style={{ ...S.row, marginBottom: "10px" }}>
                        {(["all", "plugin", "theme"] as const).map(t => (
                            <Btn key={t} kind={type === t ? "accent" : "ghost"} onClick={() => setType(t)}>{{ all: "All", plugin: "Plugins", theme: "Themes" }[t]}</Btn>
                        ))}
                    </div>
                    <SearchInput value={q} onChange={setQ} placeholder="Search store…" />
                    {filtered.length === 0 && <div style={S.empty}>Nothing found.</div>}
                    {filtered.map(i => (
                        <div key={i.type + i.id} style={S.card}>
                            <div style={S.row}>
                                <IconTile name={i.type === "plugin" ? "plug" : "palette"} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={S.title}>{i.name} {i.version && <span style={S.tag}>v{i.version}</span>}</div>
                                    <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>{i.type === "plugin" ? "Plugin" : "Theme"}{i.author ? ` by ${i.author}` : ""}</div>
                                </div>
                                <Btn icon="eye" onClick={() => open(i)}>View</Btn>
                                <Btn kind="accent" icon={installing === i.type + i.id ? "spinner" : "import"} disabled={!!installing} onClick={() => install(i)}>
                                    {installing === i.type + i.id ? "Installing…" : i.type === "theme" ? "Install & apply" : "Install"}
                                </Btn>
                            </div>
                            {i.description && <div style={{ fontSize: "15px", lineHeight: 1.45 }}>{i.description}</div>}
                            {!!i.tags?.length && <div style={S.row}>{i.tags.slice(0, 8).map(t => <span key={t} style={S.tag}>#{t}</span>)}</div>}
                        </div>
                    ))}
                    <div style={{ ...S.muted, fontSize: "11.5px", marginTop: "6px" }}>
                        Store content comes from the community and isn't reviewed by VEYA. You have to approve plugins yourself before they run.
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Editors ─────────────────────────────────────────────────────────────────

const PLUGIN_TEMPLATE = `// VEYA-AI Community Plugin
// Available: VEYA.ai.ask(text), VEYA.ai.chat(messages), VEYA.storage.get/set/delete(key), VEYA.utils

module.exports = {
  // Called when the plugin is enabled
  onLoad: async () => {
    console.log("[MyPlugin] Loaded!");
    // const answer = await VEYA.ai.ask("Say hi!");
  },

  // Called when the plugin is disabled (optional)
  onUnload: () => {
    console.log("[MyPlugin] Unloaded.");
  },
};`;



/** Takes the code out of an AI answer, even if it wrote text around it */
const stripFences = (t: string) => {
    const blocks = [...t.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map(m => m[1].trim());
    if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
    return t.replace(/^\s*```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
};

function AiGenerator({ what, placeholder, onResult, prompt, raw }: { what: string; placeholder: string; onResult: (text: string) => void; prompt: (idea: string) => string; raw?: boolean; }) {
    const [idea, setIdea] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run() {
        if (!idea.trim() || loading) return;
        setLoading(true); setError(null);
        try {
            const out = await callAI([{ role: "user", content: prompt(idea.trim()) }], 4096);
            if (!out?.trim()) throw new Error("The AI returned nothing. Check your API key under VEYA › AI & Settings.");
            onResult(raw ? out : stripFences(out));
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    return (
        <div style={{ ...S.card, background: VEYA_COLORS.accentSoft, borderColor: VEYA_COLORS.accentBorder }}>
            <div style={{ ...S.row, fontWeight: 700, color: "var(--header-primary)" }}><VeyaLogo size={20} /> AI Generator</div>
            <div style={S.muted}>Describe {what} – VEYA writes the code. Check the result before you save it.</div>
            <div style={S.row}>
                <input value={idea} onChange={e => setIdea(e.currentTarget.value)} placeholder={placeholder}
                    style={{ ...S.input, flex: 1, minWidth: "200px" }} onKeyDown={e => e.key === "Enter" && run()} aria-label={`Describe ${what}`} />
                <Btn kind="accent" icon={loading ? "spinner" : "spark"} onClick={run} disabled={loading || !idea.trim()}>{loading ? "Generating…" : "Generate"}</Btn>
            </div>
            {error && <div style={{ fontSize: "14px", color: DANGER }}>{error}</div>}
        </div>
    );
}

function CreatePluginTab() {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [author, setAuthor] = useState("");
    const [tags, setTags] = useState("");
    const [icon, setIcon] = useState("");
    const [code, setCode] = useState(PLUGIN_TEMPLATE);
    const [notice, setNotice] = useState<Notice>(null);
    const findings = useMemo(() => scanCode(code), [code]);

    function save(enableNow = false) {
        if (!name.trim() || !code.trim()) { setNotice({ ok: false, msg: "Name and code are required." }); return; }
        const plugin: VeyaPluginMeta = {
            id: genId(name), name: name.trim(), description: desc.trim(), version: "1.0.0",
            author: author.trim() || "Unknown", tags: tags.split(",").map(t => t.trim()).filter(Boolean),
            icon: icon.trim() || undefined, code: code.trim(), createdAt: Date.now(), updatedAt: Date.now(),
            origin: "own", trusted: true, trustedHash: hashCode(code.trim()),
        };
        VeyaStorage.savePlugin(plugin);
        if (!enableNow) { setNotice({ ok: true, msg: `"${plugin.name}" saved. You can enable it under Community Plugins.` }); return; }
        togglePlugin(plugin, true).then(r => setNotice(r.ok
            ? { ok: true, msg: `"${plugin.name}" saved and running.` }
            : { ok: false, msg: `Saved, but it failed to start: ${r.error}` }));
    }

    return (
        <div>
            <div style={S.label}>New plugin</div>
            <AiGenerator what="your plugin" placeholder='e.g. "Show a motivational quote when Discord starts"' onResult={code => { setCode(code); if (!name.trim()) setName("AI plugin"); }}
                prompt={idea => `Write a VEYA-AI community plugin for Discord that does this: "${idea}".

Rules:
- Plain JavaScript, CommonJS. No import/require/export keywords.
- The file MUST end up assigning module.exports = { onLoad, onUnload }.
- onLoad may be async. onUnload must undo everything (intervals, listeners, DOM elements).
- Available globals: VEYA.ai.ask(prompt) -> Promise<string>, VEYA.ai.chat([{role, content}]) -> Promise<string>,
  VEYA.storage.get(key) / VEYA.storage.set(key, value) / VEYA.storage.delete(key), VEYA.utils.getUserId(), VEYA.utils.formatDate(ts),
  React, plus normal browser APIs (document, setInterval, Notification, console).
- To show something to the user you may create a small fixed-position DOM element (style it inline, remove it in onUnload).
- Do NOT use tokens, eval, new Function, fetch/XMLHttpRequest/WebSocket or innerHTML with untrusted text.

Example:
module.exports = {
  onLoad: async () => { const text = await VEYA.ai.ask("Say hi in 5 words"); console.log(text); },
  onUnload: () => {},
};

Reply with ONE javascript code block and nothing else.`} />
            <NoticeBox notice={notice} />
            <div style={S.row}>
                <Field label="Name *" style={{ flex: 3 }}><input value={name} onChange={e => setName(e.currentTarget.value)} placeholder="My plugin" style={S.input} /></Field>
                <Field label="Icon (optional)" style={{ flex: 1, minWidth: "90px" }}><input value={icon} maxLength={4} onChange={e => setIcon(e.currentTarget.value)} placeholder="Emoji" style={S.input} /></Field>
            </div>
            <Field label="Description" style={{ marginTop: "10px" }}><input value={desc} onChange={e => setDesc(e.currentTarget.value)} placeholder="What does the plugin do?" style={S.input} /></Field>
            <div style={{ ...S.row, marginTop: "10px" }}>
                <Field label="Author"><input value={author} onChange={e => setAuthor(e.currentTarget.value)} placeholder="Your Discord name" style={S.input} /></Field>
                <Field label="Tags (comma-separated)"><input value={tags} onChange={e => setTags(e.currentTarget.value)} placeholder="fun, utility, ai" style={S.input} /></Field>
            </div>
            <Field label="Code (JavaScript) *" style={{ marginTop: "10px" }}>
                <textarea value={code} onChange={e => setCode(e.currentTarget.value)} style={{ ...S.textarea, minHeight: "240px" }} spellCheck={false} />
            </Field>
            {findings.length > 0 && <div style={{ ...S.card, marginTop: "10px" }}><Findings findings={findings} /></div>}
            <div style={{ ...S.row, marginTop: "12px" }}>
                <Btn kind="accent" icon="power" onClick={() => save(true)}>Save & enable</Btn>
                <Btn icon="save" onClick={() => save(false)}>Save only</Btn>
            </div>
        </div>
    );
}

const PALETTE_FIELDS: { key: keyof Palette; label: string; hint: string; }[] = [
    { key: "base", label: "Chat background", hint: "main area" },
    { key: "secondary", label: "Channel list", hint: "sidebars" },
    { key: "tertiary", label: "Server list", hint: "darkest layer" },
    { key: "floating", label: "Menus & popups", hint: "floating" },
    { key: "accent", label: "Accent", hint: "buttons, links" },
    { key: "text", label: "Text", hint: "messages" },
    { key: "muted", label: "Secondary text", hint: "hints, icons" },
    { key: "header", label: "Headings", hint: "names, titles" },
];

const DEFAULT_PALETTE: Palette = { base: "#12140f", secondary: "#0d0f0b", tertiary: "#080907", floating: "#171a12", accent: "#ccff00", text: "#e2e7d8", muted: "#8a9480", header: "#ffffff" };

function toHex(c: string | undefined, fallback: string) {
    return c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
}

function CreateThemeTab() {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [author, setAuthor] = useState("");
    const [tags, setTags] = useState("");
    const [pal, setPal] = useState<Palette>(DEFAULT_PALETTE);
    const [extra, setExtra] = useState("");
    const [advanced, setAdvanced] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [previewing, setPreviewing] = useState(false);
    const css = useMemo(() => buildThemeCss(name.trim() || "My theme", pal, extra), [name, pal, extra]);

    useEffect(() => () => { loadActiveTheme(); }, []);
    useEffect(() => { if (previewing) applyTheme(css); }, [css, previewing]);

    function togglePreview() {
        if (previewing) loadActiveTheme(); else applyTheme(css);
        setPreviewing(!previewing);
    }

    function save(apply: boolean) {
        if (!name.trim()) { setNotice({ ok: false, msg: "Give your theme a name." }); return; }
        const theme: VeyaThemeMeta = {
            id: genId(name), name: name.trim(), description: desc.trim(), version: "1.0.0",
            author: author.trim() || "Unknown", tags: tags.split(",").map(t => t.trim()).filter(Boolean),
            css, createdAt: Date.now(), updatedAt: Date.now(), origin: "own",
        };
        VeyaStorage.saveTheme(theme);
        if (apply) { VeyaStorage.setActiveTheme(theme.id); loadActiveTheme(); setPreviewing(false); }
        setNotice({ ok: true, msg: apply ? `Theme "${theme.name}" saved and applied.` : `Theme "${theme.name}" saved.` });
    }

    function fromAi(text: string) {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("The AI did not return colours. Try again.");
        const j = JSON.parse(m[0]);
        const next: Palette = { ...DEFAULT_PALETTE };
        for (const f of PALETTE_FIELDS) next[f.key] = toHex(j[f.key], DEFAULT_PALETTE[f.key] as string);
        setPal(next);
        if (j.name && !name.trim()) setName(String(j.name).slice(0, 40));
        if (j.description && !desc.trim()) setDesc(String(j.description).slice(0, 200));
        if (!previewing) { applyTheme(buildThemeCss("preview", next)); setPreviewing(true); }
    }

    return (
        <div>
            <div style={S.label}>New theme</div>
            <AiGenerator what="your theme" placeholder='e.g. "Dark ocean blue with a cyan glow"' raw onResult={fromAi}
                prompt={idea => `Design a Discord colour theme: "${idea}".
Reply with ONLY a JSON object, no text, with 6-digit hex colours:
{"name": "short name", "description": "one sentence", "base": "#...", "secondary": "#...", "tertiary": "#...", "floating": "#...", "accent": "#...", "text": "#...", "muted": "#...", "header": "#..."}
base = chat background, secondary = channel list (slightly darker or lighter than base), tertiary = server list (darkest),
floating = menus/popups, accent = buttons/links, text = message text (must be very readable on base), muted = secondary text, header = names/titles.`} />
            <NoticeBox notice={notice} />

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: "14px", alignItems: "start" }}>
                <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "8px" }}>
                        {PALETTE_FIELDS.map(f => (
                            <label key={f.key} className="veya-swatch">
                                <input type="color" value={toHex(pal[f.key] as string, "#000000")} onChange={e => { const v = e.currentTarget.value; setPal(p => ({ ...p, [f.key]: v })); }} />
                                <span><b>{f.label}</b><small>{toHex(pal[f.key] as string, "#000000")} · {f.hint}</small></span>
                            </label>
                        ))}
                    </div>
                </div>
                <Field label="Preview"><ThemePreview css={css} height={170} /></Field>
            </div>

            <div style={{ ...S.row, marginTop: "14px" }}>
                <Field label="Name *"><input value={name} onChange={e => setName(e.currentTarget.value)} placeholder="My theme" style={S.input} /></Field>
                <Field label="Author"><input value={author} onChange={e => setAuthor(e.currentTarget.value)} placeholder="Your Discord name" style={S.input} /></Field>
            </div>
            <div style={{ ...S.row, marginTop: "10px" }}>
                <Field label="Description"><input value={desc} onChange={e => setDesc(e.currentTarget.value)} placeholder="What does it look like?" style={S.input} /></Field>
                <Field label="Tags"><input value={tags} onChange={e => setTags(e.currentTarget.value)} placeholder="dark, neon" style={S.input} /></Field>
            </div>

            <div style={{ marginTop: "10px" }}>
                <Btn kind="ghost" icon="code" onClick={() => setAdvanced(a => !a)}>{advanced ? "Hide extra CSS" : "Extra CSS (advanced)"}</Btn>
                {advanced && <textarea value={extra} onChange={e => setExtra(e.currentTarget.value)} placeholder={"/* optional – added after the colours */"} style={{ ...S.textarea, minHeight: "140px", marginTop: "8px" }} spellCheck={false} />}
            </div>

            <div style={{ ...S.row, marginTop: "14px" }}>
                <Btn kind="accent" icon="check" onClick={() => save(true)}>Save & apply</Btn>
                <Btn icon="save" onClick={() => save(false)}>Save only</Btn>
                <Btn kind={previewing ? "danger" : "ghost"} icon="eye" onClick={togglePreview}>{previewing ? "Stop live preview" : "Live preview in Discord"}</Btn>
            </div>
        </div>
    );
}

// ─── Import ──────────────────────────────────────────────────────────────────

function ImportTab() {
    const [json, setJson] = useState("");
    const [notice, setNotice] = useState<Notice>(null);
    const [preview, setPreview] = useState<Extract<ParsedPackage, { ok: true; }> | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function check(text: string) {
        setNotice(null);
        const parsed = parsePackage(text);
        if (!parsed.ok) { setNotice({ ok: false, msg: parsed.message }); return; }
        setPreview(parsed);
    }

    function readFile(file?: File | null) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { setNotice({ ok: false, msg: "File is too large (max. 2 MB)." }); return; }
        const r = new FileReader();
        r.onload = () => { const t = String(r.result ?? ""); setJson(t); check(t); };
        r.readAsText(file);
    }

    if (preview) {
        return <PackagePreview parsed={preview} origin="imported" onCancel={() => setPreview(null)}
            onDone={msg => { setPreview(null); setJson(""); setNotice({ ok: true, msg }); }} />;
    }

    return (
        <div>
            <div style={S.label}>Import a plugin or theme</div>
            <div style={{ ...S.muted, marginBottom: "12px" }}>Import a <code>.veya.json</code> someone shared. You'll see what's inside before saving.</div>
            <NoticeBox notice={notice} />
            <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
                style={{
                    width: "100%", border: "2px dashed var(--background-modifier-accent)", borderRadius: "12px", padding: "26px",
                    textAlign: "center", cursor: "pointer", marginBottom: "12px", background: "none", color: "var(--header-primary)",
                }}
            >
                <VIcon name="folder" size={34} />
                <div style={{ fontWeight: 700, fontSize: "14px", marginTop: "8px" }}>Drop file here</div>
                <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>or click to browse · .veya.json</div>
            </button>
            <input ref={fileRef} type="file" accept=".json,.veya.json" onChange={e => readFile(e.currentTarget.files?.[0])} style={{ display: "none" }} />
            <Field label="Or paste JSON">
                <textarea value={json} onChange={e => setJson(e.currentTarget.value)} placeholder='{ "type": "plugin", "version": "1", ... }' style={{ ...S.textarea, minHeight: "100px" }} />
            </Field>
            <div style={{ marginTop: "8px" }}><Btn kind="accent" icon="eye" onClick={() => check(json)} disabled={!json.trim()}>Check</Btn></div>
        </div>
    );
}

// ─── AI & Keys ───────────────────────────────────────────────────────────────

function KeyRow({ p, has, onChanged }: { p: typeof PROVIDERS[number]; has: boolean; onChanged: () => void; }) {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [testMsg, setTestMsg] = useState<Notice>(null);
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const s = settings.use(["aiProvider", "modelClaude", "modelOpenAI", "modelGemini", "modelDeepSeek", "modelXai", "modelMistral", "modelGroq", "modelOpenRouter"]);
    const active = s.aiProvider === p.id;
    const model = modelFor(p.id);

    async function loadModels(refresh = false) {
        setLoading(true);
        const r = await Native.listModels(p.id, refresh);
        setLoading(false);
        if (r.ok) setModels(r.models);
        else if (refresh) setTestMsg({ ok: false, msg: r.error || "Couldn't load the model list." });
    }
    useEffect(() => { if (has) loadModels(); else setModels([]); }, [has]);

    async function save() {
        setBusy(true);
        await Native.setKey(p.id, value);
        setValue(""); setBusy(false); setTestMsg(null);
        onChanged();
    }
    async function remove() {
        await Native.setKey(p.id, "");
        onChanged();
    }
    async function test() {
        setBusy(true); setTestMsg(null);
        const r = await Native.chatOnce({ provider: p.id, model, messages: [{ role: "user", content: "Reply only with: OK" }], maxTokens: 64 });
        setBusy(false);
        setTestMsg(r.error ? { ok: false, msg: r.error } : { ok: true, msg: `Connection works${r.model ? ` – answered by ${r.model}` : ""}.` });
    }
    async function findWorking() {
        setBusy(true); setTestMsg({ ok: true, msg: "Checking models…" });
        const r = await Native.autoPickModel(p.id);
        setBusy(false);
        if (r.ok && r.model) {
            setModelFor(p.id, r.model);
            setTestMsg({ ok: true, msg: `Found a working model: ${r.model}` });
        } else setTestMsg({ ok: false, msg: r.error || `No working model found (tried ${r.tried.length}).` });
    }

    const options = Array.from(new Set([...(models.length ? models : p.models), ...(model !== "auto" ? [model] : [])]));

    return (
        <div style={{ ...S.card, borderColor: active ? VEYA_COLORS.accentBorder : "var(--background-modifier-accent)" }}>
            <div style={S.row}>
                <b style={{ ...S.title, flex: 1 }}>{p.label}{p.note && <span style={{ ...S.tag, marginLeft: "8px", fontWeight: 500 }}>{p.note}</span>}</b>
                {has
                    ? <span style={S.badge(VEYA_COLORS.accent)}><VIcon name="check" size={11} /> Key saved</span>
                    : <span style={S.tag}>No key</span>}
                {active
                    ? <span style={S.badge(VEYA_COLORS.accent)}>Active</span>
                    : <Btn kind="ghost" onClick={() => { settings.store.aiProvider = p.id; }}>Use</Btn>}
            </div>
            <div style={S.row}>
                <input type="password" value={value} onChange={e => setValue(e.currentTarget.value)} autoComplete="off"
                    placeholder={has ? "Enter a new key to replace it" : `API key (${p.keyHint})`} style={{ ...S.input, flex: 1, minWidth: "200px" }} aria-label={`${p.label} API key`} />
                <Btn kind="accent" icon="key" onClick={save} disabled={busy || !value.trim()}>Save</Btn>
                {has && <Btn icon="refresh" onClick={test} disabled={busy}>Test</Btn>}
                {has && <Btn kind="ghost" icon="trash" onClick={remove} title="Remove key" aria-label="Remove key" />}
            </div>
            <div style={S.row}>
                <Field label={`Model${models.length ? ` (${models.length} available)` : ""}`} style={{ flex: 1, minWidth: "200px" }}>
                    <select value={model} onChange={e => setModelFor(p.id, e.currentTarget.value)} style={S.input}>
                        <option value="auto">Auto – best available (recommended)</option>
                        {options.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Field>
                {has && <Btn icon="refresh" onClick={() => loadModels(true)} disabled={loading || busy} title="Reload model list" aria-label="Reload model list" style={{ alignSelf: "flex-end" }} />}
                {has && <Btn kind="accent" icon="spark" onClick={findWorking} disabled={busy} style={{ alignSelf: "flex-end" }}>Find working model</Btn>}
                <a href={p.keyUrl} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: VEYA_COLORS.accent, alignSelf: "flex-end", padding: "8px 0" }}>
                    <IconLabel icon="link" size={12}>Get a key</IconLabel>
                </a>
            </div>
            {testMsg && <div style={{ fontSize: "12.5px", color: testMsg.ok ? VEYA_COLORS.accent : DANGER }}>{testMsg.msg}</div>}
        </div>
    );
}

function LanguagePicker({ value, onChange }: { value: string; onChange: (v: string) => void; }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [hl, setHl] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", close, true);
        return () => document.removeEventListener("mousedown", close, true);
    }, [open]);
    const auto = { name: "auto", native: `Auto (${(() => { try { return new Intl.DisplayNames(["en"], { type: "language" }).of((document.documentElement.lang || navigator.language || "en").split("-")[0]); } catch { return "English"; } })()})` };
    const all = [auto, ...LANGUAGES];
    const list = all.filter(l => !q.trim() || `${l.name} ${l.native}`.toLowerCase().includes(q.trim().toLowerCase()));
    const current = all.find(l => l.name === value);
    const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
    return (
        <div className="veya-picker" ref={ref}>
            <button type="button" className="veya-picker-btn" onClick={() => { setOpen(o => !o); setHl(0); }} aria-haspopup="listbox" aria-expanded={open}>
                <VIcon name="globe" size={16} />
                <span style={{ flex: 1 }}>{current ? (current.name === "auto" ? current.native : `${current.name} · ${current.native}`) : value}</span>
                <span style={{ color: "var(--text-muted)" }}>▾</span>
            </button>
            {open && (
                <div className="veya-picker-pop">
                    <input autoFocus value={q} placeholder="Search language…" onChange={e => { setQ(e.currentTarget.value); setHl(0); }}
                        onKeyDown={e => {
                            if (e.key === "ArrowDown") { e.preventDefault(); setHl(h => Math.min(list.length - 1, h + 1)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setHl(h => Math.max(0, h - 1)); }
                            else if (e.key === "Enter" && list[hl]) pick(list[hl].name);
                            else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
                        }} />
                    <div className="veya-picker-list" role="listbox">
                        {list.map((l, i) => (
                            <div key={l.name} role="option" aria-selected={l.name === value} className={`veya-picker-item${l.name === value ? " sel" : ""}${i === hl ? " hl" : ""}`}
                                onMouseEnter={() => setHl(i)} onClick={() => pick(l.name)}>
                                <span>{l.name === "auto" ? l.native : l.name}</span>{l.name !== "auto" && <small>{l.native}</small>}
                            </div>
                        ))}
                        {!list.length && <div className="veya-picker-item" style={{ cursor: "default", color: "var(--text-muted)" }}>No match</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string; }) {
    return (
        <button type="button" role="switch" aria-checked={value} aria-label={label} className={`veya-switch${value ? " on" : ""}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(!value); }}>
            <span />
        </button>
    );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; }) {
    return (
        <div className="veya-toggle-row" onClick={() => onChange(!value)}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--header-primary)" }}>{label}</div>
                {desc && <div style={{ ...S.muted, marginTop: "4px" }}>{desc}</div>}
            </div>
            <Switch value={value} onChange={onChange} label={label} />
        </div>
    );
}

function KeysTab() {
    const [status, setStatus] = useState<{ encrypted: boolean; keys: Record<string, boolean>; } | null>(null);
    const s = settings.use(["aiSystemPrompt", "streamResponses", "saveHistory", "messageActions", "translateTarget", "readChannel", "contextCount"]);
    const refresh = () => { Native.getKeyStatus().then(setStatus); };
    useEffect(refresh, []);

    return (
        <div>
            <div style={S.label}>AI providers & API keys</div>
            <div style={{ ...S.card, flexDirection: "row", alignItems: "center", gap: "10px" }}>
                <VIcon name="shield" size={20} />
                <div style={S.muted}>
                    {status?.encrypted === false
                        ? <span style={{ color: WARN }}>Windows encryption isn't available – keys are only stored obfuscated.</span>
                        : <>Keys are stored <b style={{ color: "var(--header-primary)" }}>encrypted</b> on your PC (only your Windows account can read them). They're only ever sent to the selected provider.</>}
                </div>
            </div>
            {PROVIDERS.map(p => <KeyRow key={p.id} p={p} has={!!status?.keys[p.id]} onChanged={refresh} />)}

            <div style={{ ...S.label, marginTop: "18px" }}>Behavior</div>
            <div style={S.card}>
                <Toggle label="Read chat" desc="VEYA sees the latest messages in the open channel and can respond to them. They're only sent to the AI provider with your requests." value={s.readChannel} onChange={v => { s.readChannel = v; }} />
                {s.readChannel && (
                    <div style={{ ...S.row, padding: "0 0 6px 26px" }}>
                        <span style={S.muted}>Read:</span>
                        {[20, 50, 100].map(n => (
                            <Btn key={n} kind={Number(s.contextCount) === n ? "accent" : "ghost"} onClick={() => { s.contextCount = n as any; }}>{n} messages</Btn>
                        ))}
                    </div>
                )}
                <Toggle label="Stream responses" desc="Text appears word by word instead of all at once." value={s.streamResponses} onChange={v => { s.streamResponses = v; }} />
                <Toggle label="Keep chat history" desc="History is kept after a restart (local only)." value={s.saveHistory} onChange={v => { s.saveHistory = v; }} />
                <Toggle label="Right-click actions" desc="Translate, explain, suggest a reply, explain image, transcribe voice message and reminders in the message menu." value={s.messageActions} onChange={v => { s.messageActions = v; }} />
                <Field label="Target language for translations"><LanguagePicker value={s.translateTarget || "auto"} onChange={v => { s.translateTarget = v; }} /></Field>
            </div>
            <div style={S.card}>
                <Field label="System prompt"><textarea value={s.aiSystemPrompt} onChange={e => { s.aiSystemPrompt = e.currentTarget.value; }} style={{ ...S.textarea, minHeight: "80px", fontFamily: "inherit" }} /></Field>
            </div>
        </div>
    );
}

// ─── About ───────────────────────────────────────────────────────────────────

function UpdateCheck() {
    const [msg, setMsg] = useState<Notice>(null);
    const [busy, setBusy] = useState(false);
    async function run() {
        setBusy(true); setMsg(null);
        const r = await checkUpdates(true);
        setBusy(false);
        if (r.error) setMsg({ ok: false, msg: `Couldn't check for updates: ${r.error}` });
        else if (!r.available) setMsg({ ok: true, msg: r.current ? `You're up to date (v${r.current}).` : "Developer build – updates are off." });
    }
    return (
        <div style={S.row}>
            <Btn icon="refresh" onClick={run} disabled={busy}>{busy ? "Checking…" : "Check for updates"}</Btn>
            {msg && <span style={{ fontSize: "12.5px", color: msg.ok ? VEYA_COLORS.accent : DANGER }}>{msg.msg}</span>}
        </div>
    );
}

function AboutTab() {
    const [info, setInfo] = useState<{ installDir: string; version: string; } | null>(null);
    useEffect(() => { Native.getInstallInfo().then(setInfo); }, []);
    return (
        <div>
            <div style={S.card}>
                <div style={S.row}><VeyaLogo size={40} /><div><div style={S.title}>VEYA-AI {info?.version && `v${info.version}`}</div><div style={S.muted}>Vencord build with AI built in</div></div></div>
                {info && <div style={S.muted}>Installed in: <code>{info.installDir}</code></div>}
                <div style={S.muted}>Repair or uninstall: via "VEYA-AI" in the Start menu or under Windows → Apps.</div>
                <UpdateCheck />
            </div>
            <div style={S.card}>
                <div style={S.title}>Community & support</div>
                <div style={S.muted}>Questions, bugs or ideas? Join the support Discord or follow VEYA for updates.</div>
                <div style={S.row}>
                    <a href="https://discord.gg/veya-ai" target="_blank" rel="noreferrer" style={{ ...S.btn("accent"), textDecoration: "none" }}><VIcon name="chat" size={14} dot={false} /> Support Discord</a>
                    <a href="https://www.instagram.com/veya_ai_/" target="_blank" rel="noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none" }}><VIcon name="link" size={14} /> Instagram @veya_ai_</a>
                    <a href="https://www.tiktok.com/@veya_ai_" target="_blank" rel="noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none" }}><VIcon name="link" size={14} /> TikTok @veya_ai_</a>
                </div>
            </div>
            <div style={{ ...S.card, borderColor: `color-mix(in srgb, ${WARN} 35%, transparent)` }}>
                <div style={{ ...S.row, color: WARN, fontWeight: 700 }}><VIcon name="warn" size={15} /> Use at your own risk</div>
                <div style={S.muted}>VEYA-AI is unofficial. Client mods violate Discord's Terms of Service – in the worst case your account can be banned.</div>
            </div>
            <div style={S.card}>
                <div style={S.title}>License</div>
                <div style={S.muted}>Based on Vencord, licensed under the GNU GPL-3.0.</div>
                <div style={S.row}>
                    <a href="https://github.com/Vendicated/Vencord" target="_blank" rel="noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none" }}><VIcon name="link" size={13} /> Vencord</a>
                    <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none" }}><VIcon name="link" size={13} /> GPL-3.0</a>
                </div>
            </div>
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function VeyaSettingsPage() {
    return (
        <div style={{ padding: "0 4px", color: "var(--text-normal, var(--text-default))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <VeyaLogo size={44} />
                <div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--header-primary)", letterSpacing: "0.03em" }}>VEYA<span style={{ color: VEYA_COLORS.accent }}>AI</span></div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>All VEYA settings are in the VEYA section of the settings sidebar.</div>
                </div>
            </div>
            <KeysTab />
        </div>
    );
}


// ─── Custom pages in the VEYA category of Discord settings ────────────────────

function PageShell({ children, hint = true }: { children: React.ReactNode; hint?: boolean; }) {
    const [hasKey, setHasKey] = useState(true);
    useEffect(() => { if (hint) Native.getKeyStatus().then(st => setHasKey(!!st.keys[currentProvider()])); }, []);
    return (
        <div style={{ padding: "0 4px 40px", color: "var(--text-normal, var(--text-default))" }}>
            {hint && !hasKey && (
                <div style={{ ...S.notice(WARN), display: "flex", alignItems: "center", gap: "10px" }}>
                    <VIcon name="key" size={16} />
                    <span>The active AI provider is missing an API key – add it under <b>VEYA › AI & Settings</b>.</span>
                </div>
            )}
            {children}
        </div>
    );
}

export function VeyaAiPage() {
    return <PageShell hint={false}><KeysTab /></PageShell>;
}

export function VeyaStudioPage() {
    const [kind, setKind] = useState<"plugin" | "theme">("plugin");
    return (
        <PageShell>
            <div style={{ ...S.muted, marginBottom: "12px" }}>Describe what you want – VEYA builds you a plugin or theme. You can tweak everything afterwards.</div>
            <div role="tablist" style={{ ...S.row, margin: "4px 0 14px" }}>
                <Btn kind={kind === "plugin" ? "accent" : "ghost"} icon="plug" onClick={() => setKind("plugin")} role="tab" aria-selected={kind === "plugin"}>Create plugin</Btn>
                <Btn kind={kind === "theme" ? "accent" : "ghost"} icon="brush" onClick={() => setKind("theme")} role="tab" aria-selected={kind === "theme"}>Create theme</Btn>
            </div>
            {kind === "plugin" ? <CreatePluginTab /> : <CreateThemeTab />}
        </PageShell>
    );
}

export function VeyaPluginsPage() {
    return (
        <PageShell hint={false}>
            <PluginsTab />
            <div style={{ height: "1px", background: "var(--background-modifier-accent)", margin: "22px 0" }} />
            <ImportTab />
        </PageShell>
    );
}

export function VeyaThemesPage() {
    return <PageShell hint={false}><ThemesTab /></PageShell>;
}

export function VeyaStorePage() {
    return <PageShell hint={false}><OnlineTab /></PageShell>;
}

export function VeyaAboutPage() {
    return <PageShell hint={false}><AboutTab /></PageShell>;
}


// ─── Features ────────────────────────────────────────────────────────────────

const PERSONA_OPTIONS: { id: string; label: string; }[] = [
    { id: "standard", label: "Standard" },
    { id: "sachlich", label: "Factual" },
    { id: "lustig", label: "Funny" },
    { id: "gamer", label: "Gamer" },
    { id: "lehrer", label: "Teacher" },
    { id: "eigene", label: "Custom" },
];

function KnowledgeList() {
    const [, force] = useState(0);
    useEffect(() => { loadKnowledge().then(() => force(n => n + 1)); }, []);
    const entries = Object.entries(allKnowledge());
    if (!entries.length) return <div style={S.muted}>No server knowledge yet. Right-click a server → VEYA-AI → Edit server knowledge.</div>;
    return (
        <div className="veya-list">
            {entries.map(([id, text]) => (
                <div key={id} className="veya-list-item">
                    <VIcon name="folder" size={16} />
                    <div>
                        <b>{(GuildStore.getGuild(id) as any)?.name ?? "Unknown server"}</b>
                        <small>{text.slice(0, 120)}{text.length > 120 ? "…" : ""}</small>
                    </div>
                    <Btn kind="ghost" onClick={() => { openKnowledgeEditor(id); setTimeout(() => force(n => n + 1), 400); }}>Edit</Btn>
                </div>
            ))}
        </div>
    );
}

export function VeyaFeaturesPage() {
    const s = settings.use(["persona", "customPersona", "gameContext", "autoTranslate", "translateTarget", "motionEffects", "writerButton"]);
    return (
        <PageShell hint={false}>
            <div style={S.label}>Personality</div>
            <div style={S.card}>
                <div style={S.row}>
                    {PERSONA_OPTIONS.map(p => <Btn key={p.id} kind={s.persona === p.id ? "accent" : "ghost"} onClick={() => { s.persona = p.id as any; }}>{p.label}</Btn>)}
                </div>
                {s.persona === "eigene" && (
                    <Field label="How VEYA should be">
                        <textarea value={s.customPersona} onChange={e => { s.customPersona = e.currentTarget.value; }} placeholder="e.g. Reply like a laid-back surfer from California." style={{ ...S.textarea, minHeight: "70px", fontFamily: "inherit" }} />
                    </Field>
                )}
                <Toggle label="Gaming companion" desc="VEYA knows which game you're playing and helps with tips, builds and strategies for it." value={s.gameContext} onChange={v => { s.gameContext = v; }} />
            </div>

            <div style={{ ...S.label, marginTop: "18px" }}>In chat</div>
            <div style={S.card}>
                <Toggle label="Live translation" desc={`Messages in other languages automatically get a translation into ${targetLanguage()} below them. Only in the open channel; each translation is a small AI request.`} value={s.autoTranslate} onChange={v => { s.autoTranslate = v; }} />
                <Toggle label="Writing assistant" desc="Brush button in the message box: fix text, make it friendlier, shorter, more professional or turn it into English." value={s.writerButton} onChange={v => { s.writerButton = v; }} />
            </div>

            <div style={{ ...S.label, marginTop: "18px" }}>Appearance</div>
            <div style={S.card}>
                <Toggle label="VEYA Motion" desc="Smooth animations across Discord: messages slide in, menus and windows pop open." value={s.motionEffects} onChange={v => { s.motionEffects = v; }} />
            </div>

            <div style={{ ...S.label, marginTop: "18px" }}>Reminders</div>
            <div style={S.card}><RemindersList /></div>

            <div style={{ ...S.label, marginTop: "18px" }}>Server knowledge</div>
            <div style={S.card}>
                <div style={S.muted}>Rules, FAQ and info per server. VEYA uses them automatically when you ask in that server.</div>
                <KnowledgeList />
            </div>
        </PageShell>
    );
}
