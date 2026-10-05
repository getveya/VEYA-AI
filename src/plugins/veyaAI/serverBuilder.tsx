/*
 * VEYA-AI – serverBuilder.tsx
 * Describe your server → the AI plans roles (with colours and emoji icons), categories, channels with
 * emoji/aesthetic names, welcome & rules texts, custom server emojis, logo and banner → VEYA builds it.
 *
 * Optional "start fresh": deletes all existing channels and roles first (asks for the server name to confirm).
 * Everything runs through your own Discord account with normal API calls, slowly and with pauses.
 */

import { ChannelStore, GuildMemberStore, GuildRoleStore, GuildStore, PermissionsBits, PermissionStore, React, UserStore, useState } from "@webpack/common";

import { openDialog } from "./dialogs";
import { VIcon } from "./icons";
import { parseJson, rest, sanitizeSvg, svgToPng, svgUrl } from "./serverTools";
import { sleep, startTask } from "./tasks";
import { callAI } from "./VeyaAPI";

// ─── Types ───────────────────────────────────────────────────────────────────

type ChannelKind = "text" | "voice" | "announcement" | "forum" | "stage";
type RolePreset = "admin" | "mod" | "member" | "muted" | "bot" | "cosmetic";
type NameStyle = "clean" | "emoji" | "aesthetic";

interface PlanChannel { name: string; type: ChannelKind; topic?: string; readonly?: boolean; private_roles?: string[]; slowmode?: number; message?: string; }
interface PlanCategory { name: string; private_roles?: string[]; channels: PlanChannel[]; }
interface PlanRole { name: string; color?: string; hoist?: boolean; mentionable?: boolean; preset: RolePreset; emoji?: string; }
interface PlanEmoji { name: string; svg: string; }
interface Plan {
    summary?: string;
    roles: PlanRole[];
    categories: PlanCategory[];
    emojis?: PlanEmoji[];
    logo_svg?: string;
    banner_svg?: string;
}

interface BuildOptions {
    roles: boolean;
    channels: boolean;
    messages: boolean;
    roleIcons: boolean;
    emojis: boolean;
    logo: boolean;
    banner: boolean;
    wipe: boolean;
}

// ─── Permissions ─────────────────────────────────────────────────────────────

const P = () => PermissionsBits as any;

export function canBuild(guild: any) {
    if (!guild) return false;
    if (guild.ownerId === UserStore.getCurrentUser()?.id) return true;
    return PermissionStore.can(PermissionsBits.MANAGE_GUILD, guild) && PermissionStore.can(PermissionsBits.MANAGE_ROLES, guild) && PermissionStore.can(PermissionsBits.MANAGE_CHANNELS, guild);
}

function presetBits(preset: RolePreset): bigint {
    const b = P();
    const member = b.VIEW_CHANNEL | b.SEND_MESSAGES | b.READ_MESSAGE_HISTORY | b.ADD_REACTIONS | b.EMBED_LINKS | b.ATTACH_FILES | b.USE_EXTERNAL_EMOJIS
        | b.CONNECT | b.SPEAK | b.STREAM | b.USE_VAD | b.CHANGE_NICKNAME | b.CREATE_INSTANT_INVITE | b.SEND_MESSAGES_IN_THREADS | b.CREATE_PUBLIC_THREADS;
    switch (preset) {
        case "admin": return b.ADMINISTRATOR;
        case "mod": return member | b.KICK_MEMBERS | b.BAN_MEMBERS | b.MANAGE_MESSAGES | b.MODERATE_MEMBERS | b.MUTE_MEMBERS | b.MOVE_MEMBERS | b.DEAFEN_MEMBERS | b.MANAGE_NICKNAMES | b.MANAGE_THREADS | b.VIEW_AUDIT_LOG;
        case "bot": return member | b.MANAGE_MESSAGES;
        case "muted": return b.VIEW_CHANNEL | b.READ_MESSAGE_HISTORY | b.CONNECT;
        case "member": return member;
        default: return 0n;
    }
}

const TYPE_ID: Record<ChannelKind, number> = { text: 0, voice: 2, announcement: 5, stage: 13, forum: 15 };

function colorInt(c?: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec((c ?? "").trim());
    return m ? parseInt(m[1], 16) : 0;
}

/** Discord cleans up names itself – we only keep emojis/decoration intact and fix spaces for text channels */
function channelName(name: string, type: number) {
    const n = name.trim().slice(0, 100) || "channel";
    return type === 2 || type === 13 ? n : n.replace(/\s+/g, "-").toLowerCase();
}

function emojiName(name: string) {
    return (name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "veya").slice(0, 32).padEnd(2, "_");
}

function guildChannels(guildId: string): any[] {
    return Object.values((ChannelStore as any).getMutableGuildChannelsForGuild?.(guildId) ?? {}) as any[];
}

function existingStructure(guildId: string) {
    const roles = (GuildRoleStore.getSortedRoles(guildId) ?? []).map((r: any) => r.name).filter((n: string) => n !== "@everyone");
    const all = guildChannels(guildId);
    const cats = all.filter(c => c.type === 4);
    const lines = cats.map(c => `${c.name}: ${all.filter(x => x.parent_id === c.id).map(x => x.name).join(", ")}`);
    const loose = all.filter(c => c.type !== 4 && !c.parent_id).map(c => c.name);
    if (loose.length) lines.unshift(`(no category): ${loose.join(", ")}`);
    return { roles, channels: lines };
}

// ─── AI prompt ───────────────────────────────────────────────────────────────

const STYLE_RULES: Record<NameStyle, string> = {
    clean: `Names: text channels lowercase-with-dashes, no emoji (e.g. "general", "announcements"). Voice channels "Lounge", "Squad 1". Categories plain capitalised words (e.g. "Community").`,
    emoji: `Names: every channel starts with ONE fitting emoji, e.g. text "💬-general", "📢-announcements", "📜-rules", voice "🔊 Lounge", "🎮 Squad 1". Categories: "📌 INFO", "💬 COMMUNITY". Roles may start with an emoji too ("👑 Owner").`,
    aesthetic: `Names: decorated like popular aesthetic servers. Text channels use an emoji and the separator "・": "💬・general", "📜・rules", "🎬・clips". Voice: "🎧・Chill Lounge", "🎮・Squad 1". Categories decorated, e.g. "━━ 📌 INFORMATION ━━" or "⋆˚ COMMUNITY ˚⋆" (pick ONE pattern and use it for all categories). Roles: "👑・Owner", "🛡️・Moderator", "✨・Member". Stay consistent everywhere.`,
};

function planPrompt(opts: BuildOptions, style: NameStyle, roleIconsOk: boolean, bannerOk: boolean) {
    return `You are an expert Discord server designer. Plan a server from the user's description.
Reply with ONLY JSON in exactly this shape, no text before or after:
{
  "summary": "1–2 sentences about what you built",
  "roles": [{ "name": "Role name", "color": "#RRGGBB", "hoist": true, "mentionable": false, "preset": "admin|mod|member|muted|bot|cosmetic", "emoji": "🛡️" }],
  "categories": [{ "name": "Category", "private_roles": ["Role name"], "channels": [
      { "name": "channel-name", "type": "text|voice|announcement|forum|stage", "topic": "short description", "readonly": false, "slowmode": 0, "private_roles": [], "message": "optional first message" }
  ] }],
  "emoji_names": ["short_name"],
  "visual_style": "one sentence describing colours and look for logo, banner and emojis"
}
Rules:
- ${opts.roles ? "Roles ordered from most important to least. 5–12 roles with nice distinct colours." : "roles must be an empty array."}
- ${opts.channels ? "4–8 categories, 15–40 channels total, a clear structure (info, community, topic areas, voice, staff)." : "categories must be an empty array."}
- ${STYLE_RULES[style]}
- "private_roles": only these roles can see the category/channel. Empty = everyone.
- "readonly": only admin/mod roles can write (rules, announcements).
- ${opts.messages ? "Give rules, welcome and info channels a well formatted first message (Discord markdown, headings with **bold**, bullet points, emojis, max 1500 chars). Other channels: no message." : "No first messages (omit \"message\")."}
- ${opts.roleIcons && roleIconsOk ? "Give every role one fitting unicode emoji in \"emoji\" (used as role icon)." : "Omit \"emoji\" on roles."}
- ${opts.emojis ? "\"emoji_names\": 4–6 names for custom server emojis that fit the theme (lowercase_with_underscores, e.g. gg, hype, pog_frog)." : "\"emoji_names\" must be an empty array."}
- Write all names and texts in the language of the user's description.`;
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function openServerBuilder(guildId: string) {
    const guild: any = GuildStore.getGuild(guildId);
    if (!guild) return;
    openDialog({
        title: "Build server with AI",
        subtitle: guild.name,
        width: 680,
        render: close => <Builder guild={guild} close={close} />,
    });
}

const STYLES: { id: NameStyle; label: string; example: string; }[] = [
    { id: "aesthetic", label: "Aesthetic", example: "💬・general" },
    { id: "emoji", label: "Emoji", example: "💬-general" },
    { id: "clean", label: "Clean", example: "general" },
];

function Check({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean; hint?: string; }) {
    return (
        <label className="veya-check" title={hint} style={disabled ? { opacity: 0.5 } : undefined}>
            <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={onChange} /> {label}
        </label>
    );
}

function Builder({ guild, close }: { guild: any; close: () => void; }) {
    const features: Set<string> = guild.features ?? new Set();
    const bannerOk = guild.premiumTier >= 2 || features.has?.("BANNER");
    const roleIconsOk = guild.premiumTier >= 2 || features.has?.("ROLE_ICONS");
    const [desc, setDesc] = useState("");
    const [style, setStyle] = useState<NameStyle>("aesthetic");
    const [opts, setOpts] = useState<BuildOptions>({ roles: true, channels: true, messages: true, roleIcons: roleIconsOk, emojis: true, logo: true, banner: bannerOk, wipe: false });
    const [plan, setPlan] = useState<Plan | null>(null);
    const [feedback, setFeedback] = useState("");
    const [confirmName, setConfirmName] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const toggle = (k: keyof BuildOptions) => setOpts(o => ({ ...o, [k]: !o[k] }));

    async function generate(extra?: string) {
        setBusy(true); setErr("");
        const task = startTask("Planning your server");
        task.update(null, "VEYA is thinking…");
        try {
            const ex = opts.wipe ? { roles: [], channels: [] } : existingStructure(guild.id);
            const text = await callAI([
                { role: "system", content: planPrompt(opts, style, roleIconsOk, bannerOk) },
                {
                    role: "user", content: [
                        `Server name: ${guild.name}`,
                        opts.wipe ? "The server will be emptied first – plan a complete server from scratch." : `Existing roles (do not duplicate): ${ex.roles.join(", ") || "none"}\nExisting channels (do not duplicate):\n${ex.channels.join("\n") || "none"}`,
                        `Description:\n${desc}`,
                        plan && extra ? `Current plan:\n${JSON.stringify({ ...plan, emojis: plan.emojis?.map(e => e.name), logo_svg: undefined, banner_svg: undefined })}\nChange request: ${extra}` : "",
                    ].filter(Boolean).join("\n\n")
                },
            ], 12000);
            const p = parseJson<Plan & { emoji_names?: string[]; visual_style?: string; }>(text);
            p.roles = (opts.roles ? p.roles ?? [] : []).slice(0, 15);
            p.categories = (opts.channels ? p.categories ?? [] : []).slice(0, 10);
            if (!opts.messages) p.categories.forEach(c => c.channels.forEach(ch => delete ch.message));
            if (!(opts.roleIcons && roleIconsOk)) p.roles.forEach(r => delete r.emoji);

            // Graphics in separate requests (keeps answers short and reliable)
            const redo = !plan || !extra || /logo|banner|emoji|icon|colou?r|farbe|bild|design|look/i.test(extra);
            const look = `Server: ${guild.name}. Theme: ${desc.slice(0, 600)}. Visual style: ${p.visual_style ?? "modern, clean"}.${extra ? ` Change request: ${extra}` : ""}`;
            const svgRule = "Reply with ONLY the SVG code. No external images, no fonts, no <text> elements unless asked, no scripts.";
            task.update(null, "Designing graphics…");
            const [logo, banner, emojis] = await Promise.all([
                opts.logo ? (redo || !plan?.logo_svg ? callAI([{ role: "user", content: `Design a Discord server icon as SVG with viewBox="0 0 512 512". ${look}\nModern, bold, works small, gradient or flat, fills the square. At most 1–3 letters. ${svgRule}` }], 6000).then(sanitizeSvg).catch(() => null) : Promise.resolve(plan.logo_svg)) : Promise.resolve(null),
                opts.banner && bannerOk ? (redo || !plan?.banner_svg ? callAI([{ role: "user", content: `Design a Discord server banner as SVG with viewBox="0 0 960 540". ${look}\nAtmospheric background art matching the server, key content in the top-left area. ${svgRule}` }], 6000).then(sanitizeSvg).catch(() => null) : Promise.resolve(plan.banner_svg)) : Promise.resolve(null),
                opts.emojis && p.emoji_names?.length ? (redo || !plan?.emojis?.length ? callAI([{
                    role: "user", content: `Design custom Discord emojis named: ${p.emoji_names.slice(0, 6).join(", ")}. ${look}
Each one: SVG viewBox="0 0 128 128", transparent background, thick outlines, big simple shapes that read at 24px, no text.
Reply with ONLY JSON: {"emojis":[{"name":"...","svg":"<svg ...>…</svg>"}]}`
                }], 12000).then(t => (parseJson<{ emojis: PlanEmoji[]; }>(t).emojis ?? [])).catch(() => []) : Promise.resolve(plan.emojis ?? [])) : Promise.resolve([]),
            ]);
            p.logo_svg = logo ?? undefined;
            p.banner_svg = banner ?? undefined;
            p.emojis = (emojis as PlanEmoji[]).map(e => { const svg = sanitizeSvg(e.svg); return svg ? { name: emojiName(e.name), svg } : null; }).filter(Boolean).slice(0, 8) as PlanEmoji[];
            delete p.emoji_names; delete p.visual_style;
            setPlan(p);
            setFeedback("");
            task.finish("Plan ready");
        } catch (e: any) {
            setErr(String(e?.message ?? e));
            task.fail(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    }

    if (!canBuild(guild)) {
        return (
            <div className="veya-note err">
                <VIcon name="warn" size={16} dot={false} />
                <div>You need "Manage Server", "Manage Roles" and "Manage Channels" on this server.</div>
            </div>
        );
    }

    if (plan) {
        const nChannels = plan.categories.reduce((a, c) => a + c.channels.length, 0);
        const wipeOk = !opts.wipe || confirmName.trim() === guild.name;
        const existingCh = guildChannels(guild.id).length;
        return (
            <>
                {plan.summary && <div className="veya-note"><VIcon name="spark" size={16} dot={false} /><div>{plan.summary}</div></div>}
                <PlanPreview plan={plan} />
                <label className="veya-field">
                    <span>Want changes?</span>
                    <div className="veya-row" style={{ flexWrap: "nowrap" }}>
                        <input className="veya-input" value={feedback} placeholder="e.g. more voice channels, blue roles, no forum" onChange={e => setFeedback(e.currentTarget.value)}
                            onKeyDown={e => { if (e.key === "Enter" && feedback.trim() && !busy) generate(feedback.trim()); }} />
                        <button className="veya-btn" disabled={!feedback.trim() || busy} onClick={() => generate(feedback.trim())}>
                            {busy ? <VIcon name="spinner" size={14} dot={false} className="veya-spin" /> : <VIcon name="refresh" size={14} dot={false} />} Update
                        </button>
                    </div>
                </label>
                {err && <div className="veya-note err">{err}</div>}
                {opts.wipe ? (
                    <div className="veya-note err" style={{ flexDirection: "column" }}>
                        <div className="veya-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                            <VIcon name="warn" size={16} dot={false} />
                            <div><b>Start fresh is on:</b> all {existingCh} channels and all roles VEYA is allowed to delete will be removed first – including their messages. This cannot be undone.</div>
                        </div>
                        <input className="veya-input" value={confirmName} placeholder={`Type "${guild.name}" to confirm`} onChange={e => setConfirmName(e.currentTarget.value)} />
                    </div>
                ) : (
                    <div className="veya-note warn">
                        <VIcon name="shield" size={16} dot={false} />
                        <div>VEYA only adds things – nothing existing is deleted{plan.logo_svg || plan.banner_svg ? " (except the server icon/banner, if selected)" : ""}.</div>
                    </div>
                )}
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    Creates {plan.roles.length} roles, {plan.categories.length} categories, {nChannels} channels{plan.emojis?.length ? `, ${plan.emojis.length} emojis` : ""}. Takes about {Math.max(10, Math.ceil((plan.roles.length + plan.categories.length + nChannels + (plan.emojis?.length ?? 0) + (opts.wipe ? existingCh : 0)) * 0.6))} seconds – progress is shown at the top.
                </div>
                <div className="veya-row end">
                    <button className="veya-btn" onClick={() => setPlan(null)} disabled={busy}><VIcon name="back" size={14} dot={false} /> Back</button>
                    <button className={`veya-btn ${opts.wipe ? "danger" : "primary"}`} disabled={busy || !wipeOk} onClick={() => { close(); buildServer(guild.id, plan, opts.wipe); }}>
                        <VIcon name="tool" size={14} dot={false} /> {opts.wipe ? "Delete & rebuild" : "Build now"}
                    </button>
                </div>
            </>
        );
    }

    return (
        <>
            <label className="veya-field">
                <span>What should your server be like?</span>
                <textarea className="veya-textarea" rows={5} autoFocus value={desc} onChange={e => setDesc(e.currentTarget.value)}
                    placeholder="e.g. Gaming community for Valorant and Minecraft, ~200 people. Rules, announcements, team finder, clips, voice channels for squads and a private mod area. Colours: neon green and black." />
            </label>

            <div className="veya-field">
                <span>Name style</span>
                <div className="veya-writer-modes">
                    {STYLES.map(s => (
                        <button key={s.id} className={style === s.id ? "on" : ""} onClick={() => setStyle(s.id)}>
                            {s.label} <span style={{ opacity: 0.7, marginLeft: 6 }}>{s.example}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="veya-field">
                <span>Create</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px 16px" }}>
                    <Check label="Roles" checked={opts.roles} onChange={() => toggle("roles")} />
                    <Check label="Categories & channels" checked={opts.channels} onChange={() => toggle("channels")} />
                    <Check label="Rules & welcome texts" checked={opts.messages} onChange={() => toggle("messages")} />
                    <Check label="Custom server emojis" checked={opts.emojis} onChange={() => toggle("emojis")} />
                    <Check label={`Role icons${roleIconsOk ? "" : " (boost level 2)"}`} checked={opts.roleIcons} disabled={!roleIconsOk} onChange={() => toggle("roleIcons")} />
                    <Check label="Server logo" checked={opts.logo} onChange={() => toggle("logo")} />
                    <Check label={`Banner${bannerOk ? "" : " (boost level 2)"}`} checked={opts.banner} disabled={!bannerOk} onChange={() => toggle("banner")} />
                </div>
            </div>

            <label className="veya-check" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgb(255 77 77 / 30%)", background: "rgb(255 77 77 / 6%)" }}>
                <input type="checkbox" checked={opts.wipe} onChange={() => toggle("wipe")} />
                <span><b style={{ color: "#ff8a8a" }}>Start fresh</b> – delete all existing channels and roles before building</span>
            </label>

            {err && <div className="veya-note err">{err}</div>}
            <div className="veya-row end">
                <button className="veya-btn" onClick={close}>Cancel</button>
                <button className="veya-btn primary" disabled={busy || desc.trim().length < 8} onClick={() => generate()}>
                    {busy ? <VIcon name="spinner" size={14} dot={false} className="veya-spin" /> : <VIcon name="spark" size={14} dot={false} />} {busy ? "Planning…" : "Create plan"}
                </button>
            </div>
        </>
    );
}

function PlanPreview({ plan }: { plan: Plan; }) {
    const icon = (t: ChannelKind) => t === "voice" || t === "stage" ? "🔊" : t === "forum" ? "💬" : t === "announcement" ? "📢" : "#";
    const presetName: Record<string, string> = { admin: "Admin", mod: "Moderator", member: "Member", muted: "Muted", bot: "Bot", cosmetic: "Colour only" };
    return (
        <div className="veya-plan">
            {(plan.logo_svg || plan.banner_svg || plan.emojis?.length) && (
                <div className="veya-row" style={{ alignItems: "flex-start", gap: 12 }}>
                    {plan.logo_svg && <div className="veya-logo-prev"><img src={svgUrl(plan.logo_svg)} alt="Logo" /></div>}
                    {plan.banner_svg && <img src={svgUrl(plan.banner_svg)} alt="Banner" style={{ height: 96, borderRadius: 14, border: "1px solid var(--background-modifier-accent)" }} />}
                    {!!plan.emojis?.length && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 260 }}>
                            {plan.emojis.map(e => (
                                <div key={e.name} title={`:${e.name}:`} style={{ width: 44, height: 44, borderRadius: 10, background: "var(--background-secondary)", display: "grid", placeItems: "center" }}>
                                    <img src={svgUrl(e.svg)} alt={e.name} style={{ width: 32, height: 32 }} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {plan.roles.length > 0 && (
                <div className="veya-plan-group">
                    <h4>Roles</h4>
                    {plan.roles.map((r, i) => (
                        <div key={i} className="veya-plan-item">
                            <span className="veya-role-dot" style={{ background: r.color || "#99aab5" }} />
                            {r.emoji && <span>{r.emoji}</span>}
                            <span style={{ color: r.color || undefined, fontWeight: 600 }}>{r.name}</span>
                            <span className="sub">{presetName[r.preset] ?? r.preset}</span>
                        </div>
                    ))}
                </div>
            )}
            {plan.categories.map((c, i) => (
                <div key={i} className="veya-plan-group">
                    <h4>{c.name}{c.private_roles?.length ? ` · only ${c.private_roles.join(", ")}` : ""}</h4>
                    {c.channels.map((ch, j) => (
                        <div key={j} className="veya-plan-item">
                            <span className="hash">{icon(ch.type)}</span>
                            <span>{ch.name}</span>
                            <span className="sub">
                                {[ch.readonly && "read-only", ch.private_roles?.length && "private", ch.message && "with text", ch.slowmode && `${ch.slowmode}s slowmode`].filter(Boolean).join(" · ")}
                            </span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Building ────────────────────────────────────────────────────────────────

async function wipeServer(guildId: string, step: (d: string) => void, problems: string[], cancelled: () => boolean) {
    const me = UserStore.getCurrentUser()?.id;
    const guild: any = GuildStore.getGuild(guildId);
    const owner = guild?.ownerId === me;
    const channels = guildChannels(guildId);
    // channels first (non-categories), then categories
    for (const ch of [...channels.filter(c => c.type !== 4), ...channels.filter(c => c.type === 4)]) {
        if (cancelled()) throw new Error("Cancelled");
        try { await rest("del", `/channels/${ch.id}`); } catch (e: any) { problems.push(`Could not delete #${ch.name}: ${e.message}`); }
        step(`Deleted ${ch.name}`);
        await sleep(350);
    }
    const roles = (GuildRoleStore.getSortedRoles(guildId) ?? []) as any[];
    const mine: string[] = (me && (GuildMemberStore.getMember(guildId, me) as any)?.roles) ?? [];
    const myTop = owner ? Infinity : Math.max(0, ...roles.filter(r => mine.includes(r.id)).map(r => r.position));
    for (const r of roles) {
        if (cancelled()) throw new Error("Cancelled");
        if (r.id === guildId || r.managed || r.tags?.bot_id || r.tags?.integration_id || r.tags?.premium_subscriber !== undefined) { step(`Kept ${r.name}`); continue; }
        if (r.position >= myTop) { step(`Kept ${r.name}`); continue; }
        try { await rest("del", `/guilds/${guildId}/roles/${r.id}`); } catch (e: any) { problems.push(`Could not delete role "${r.name}": ${e.message}`); }
        step(`Deleted role ${r.name}`);
        await sleep(350);
    }
}

async function buildServer(guildId: string, plan: Plan, wipe: boolean) {
    const guild: any = GuildStore.getGuild(guildId);
    const features: Set<string> = guild?.features ?? new Set();
    const community = features.has?.("COMMUNITY");
    const task = startTask(`Building ${guild?.name ?? "server"}`);
    const nChannels = plan.categories.reduce((a, c) => a + c.channels.length, 0);
    const msgCount = plan.categories.reduce((a, c) => a + c.channels.filter(x => x.message).length, 0);
    const wipeCount = wipe ? guildChannels(guildId).length + (GuildRoleStore.getSortedRoles(guildId)?.length ?? 0) : 0;
    const total = wipeCount + plan.roles.length + plan.categories.length + nChannels + msgCount + (plan.emojis?.length ?? 0) + (plan.logo_svg ? 1 : 0) + (plan.banner_svg ? 1 : 0);
    let done = 0;
    const step = (detail: string) => { done++; task.update(done / Math.max(1, total), detail); };
    const problems: string[] = [];
    const b = P();
    const cancelled = () => task.cancelled;

    try {
        if (wipe) await wipeServer(guildId, step, problems, cancelled);

        // Roles (created bottom-up so the most important ends on top)
        const roleIds = new Map<string, { id: string; preset: RolePreset; }>();
        if (!wipe) for (const r of (GuildRoleStore.getSortedRoles(guildId) ?? []) as any[]) {
            let perms = 0n;
            try { perms = BigInt(r.permissions ?? 0); } catch { }
            roleIds.set(r.name.toLowerCase(), { id: r.id, preset: perms & b.ADMINISTRATOR ? "admin" : perms & b.MANAGE_MESSAGES ? "mod" : "member" });
        }
        for (const r of [...plan.roles].reverse()) {
            if (cancelled()) throw new Error("Cancelled");
            if (roleIds.has(r.name.toLowerCase())) { step(`Role ${r.name} already exists`); continue; }
            try {
                const body: any = {
                    name: r.name.slice(0, 100), color: colorInt(r.color), hoist: !!r.hoist, mentionable: !!r.mentionable,
                    permissions: presetBits(r.preset).toString(),
                };
                if (r.emoji) body.unicode_emoji = r.emoji;
                let created: any;
                try { created = await rest("post", `/guilds/${guildId}/roles`, body); } catch (e) {
                    if (!body.unicode_emoji) throw e;
                    delete body.unicode_emoji;
                    created = await rest("post", `/guilds/${guildId}/roles`, body);
                }
                roleIds.set(r.name.toLowerCase(), { id: created.id, preset: r.preset });
            } catch (e: any) { problems.push(`Role "${r.name}": ${e.message}`); }
            step(`Role ${r.name}`);
            await sleep(450);
        }

        const staffIds = [...roleIds.values()].filter(r => r.preset === "admin" || r.preset === "mod").map(r => r.id);
        const overwrites = (privateRoles?: string[], readonly?: boolean) => {
            const list: any[] = [];
            const priv = (privateRoles ?? []).map(n => roleIds.get(n.toLowerCase())?.id).filter(Boolean) as string[];
            if (priv.length) {
                list.push({ id: guildId, type: 0, deny: b.VIEW_CHANNEL.toString(), allow: "0" });
                for (const id of new Set([...priv, ...staffIds])) list.push({ id, type: 0, allow: b.VIEW_CHANNEL.toString(), deny: "0" });
            }
            if (readonly) {
                const ev = list.find(o => o.id === guildId);
                if (ev) ev.deny = (BigInt(ev.deny) | b.SEND_MESSAGES | b.CREATE_PUBLIC_THREADS).toString();
                else list.push({ id: guildId, type: 0, deny: (b.SEND_MESSAGES | b.CREATE_PUBLIC_THREADS).toString(), allow: "0" });
                for (const id of staffIds) {
                    const o = list.find(x => x.id === id);
                    if (o) o.allow = (BigInt(o.allow) | b.SEND_MESSAGES).toString();
                    else list.push({ id, type: 0, allow: b.SEND_MESSAGES.toString(), deny: "0" });
                }
            }
            return list;
        };

        // Categories & channels
        const existing = wipe ? [] : guildChannels(guildId);
        const posts: { channelId: string; content: string; name: string; }[] = [];
        for (const cat of plan.categories) {
            if (cancelled()) throw new Error("Cancelled");
            let catId = existing.find(c => c.type === 4 && c.name.toLowerCase() === cat.name.toLowerCase())?.id as string | undefined;
            if (!catId) {
                try {
                    catId = (await rest("post", `/guilds/${guildId}/channels`, { name: cat.name.slice(0, 100), type: 4, permission_overwrites: overwrites(cat.private_roles) })).id;
                } catch (e: any) { problems.push(`Category "${cat.name}": ${e.message}`); }
                await sleep(450);
            }
            step(`Category ${cat.name}`);

            for (const ch of cat.channels) {
                if (cancelled()) throw new Error("Cancelled");
                let type = TYPE_ID[ch.type] ?? 0;
                if (!community && (type === 5 || type === 13 || type === 15)) type = type === 13 ? 2 : 0;
                const name = channelName(ch.name, type);
                if (existing.some(c => c.name === name && c.parent_id === catId)) { step(`${name} already exists`); continue; }
                try {
                    const body: any = { name, type, parent_id: catId };
                    if (type !== 2 && type !== 13 && ch.topic) body.topic = ch.topic.slice(0, 1000);
                    if ((type === 0 || type === 15) && ch.slowmode) body.rate_limit_per_user = Math.min(21600, Math.max(0, Math.round(ch.slowmode)));
                    const ow = overwrites(ch.private_roles?.length ? ch.private_roles : cat.private_roles, ch.readonly);
                    if (ow.length) body.permission_overwrites = ow;
                    const created = await rest("post", `/guilds/${guildId}/channels`, body);
                    if (ch.message && (type === 0 || type === 5)) posts.push({ channelId: created.id, content: ch.message.slice(0, 2000), name });
                } catch (e: any) { problems.push(`Channel "${ch.name}": ${e.message}`); }
                step(`Channel ${ch.name}`);
                await sleep(450);
            }
        }

        // Custom emojis (before texts so the texts could use them)
        for (const e of plan.emojis ?? []) {
            if (cancelled()) throw new Error("Cancelled");
            try { await rest("post", `/guilds/${guildId}/emojis`, { name: e.name, image: await svgToPng(e.svg, 128, 128), roles: [] }); }
            catch (err: any) { problems.push(`Emoji :${e.name}: – ${err.message}`); }
            step(`Emoji :${e.name}:`);
            await sleep(700);
        }

        // First messages
        for (const p of posts) {
            if (cancelled()) throw new Error("Cancelled");
            try { await rest("post", `/channels/${p.channelId}/messages`, { content: p.content }); } catch (e: any) { problems.push(`Text in #${p.name}: ${e.message}`); }
            step(`Text in #${p.name}`);
            await sleep(600);
        }

        // Logo & banner
        if (plan.logo_svg) {
            try { await rest("patch", `/guilds/${guildId}`, { icon: await svgToPng(plan.logo_svg, 512, 512) }); } catch (e: any) { problems.push(`Logo: ${e.message}`); }
            step("Logo");
        }
        if (plan.banner_svg) {
            try { await rest("patch", `/guilds/${guildId}`, { banner: await svgToPng(plan.banner_svg, 960, 540) }); } catch (e: any) { problems.push(`Banner: ${e.message}`); }
            step("Banner");
        }

        if (problems.length) {
            task.finish(`Done – ${problems.length} item(s) failed`);
            openDialog({
                title: "Server built – with notes",
                subtitle: guild?.name,
                render: close => (
                    <>
                        <div className="veya-note warn"><VIcon name="warn" size={16} dot={false} /><div>Most of it is done. Discord refused these:</div></div>
                        <div className="veya-list" style={{ maxHeight: 300, overflowY: "auto" }}>{problems.map((p, i) => <div key={i} className="veya-list-item"><div>{p}</div></div>)}</div>
                        <div className="veya-row end"><button className="veya-btn primary" onClick={close}>OK</button></div>
                    </>
                ),
            });
        } else {
            task.finish("Done – enjoy your server!");
        }
    } catch (e: any) {
        task.fail(e?.message === "Cancelled" ? "Cancelled – what was built so far stays." : String(e?.message ?? e));
    }
}
