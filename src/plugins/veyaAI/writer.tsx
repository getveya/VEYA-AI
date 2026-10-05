/*
 * VEYA-AI – writer.tsx
 * Writing helper right in the message box: improve text, make it friendlier, shorter, more professional, translate …
 * The draft is only replaced once you click "Apply".
 */

import { ChatBarButton, type ChatBarButtonFactory } from "@api/ChatButtons";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import type { IconComponent } from "@utils/types";
import { ComponentDispatch, DraftStore, DraftType, React, useEffect, useRef, useState } from "@webpack/common";

import { VIcon } from "./icons";
import { settings } from "./settings";
import { callAI } from "./VeyaAPI";

const MODES: { id: string; label: string; task: string; }[] = [
    { id: "fix", label: "Fix", task: "Correct spelling, grammar and punctuation. Don't change the tone or content." },
    { id: "nice", label: "Friendlier", task: "Rephrase the text to be friendlier and warmer without changing the content." },
    { id: "short", label: "Shorter", task: "Shorten the text to the essentials." },
    { id: "pro", label: "Professional", task: "Rephrase the text in a factual, professional tone." },
    { id: "fun", label: "Funnier", task: "Rephrase the text to be more casual and witty, ideally with a fitting emoji." },
    { id: "en", label: "English", task: "Translate the text naturally into English." },
];

interface PopState { channelId: string; x: number; y: number; }
let pop: PopState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function getDraft(channelId: string): string {
    try { return DraftStore.getDraft(channelId, DraftType.ChannelMessage) ?? ""; } catch { return ""; }
}

function replaceDraft(text: string) {
    try { ComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT"); } catch { }
    setTimeout(() => insertTextIntoChatInputBox(text), 30);
}

export const WriterIcon: IconComponent = ({ width = 20, height = 20 }) => <VIcon name="brush" size={Math.min(Number(width), Number(height)) || 20} />;

export const WriterButton: ChatBarButtonFactory = ({ isMainChat, channel }) => {
    if (!isMainChat || !settings.store.writerButton) return null;
    return (
        <ChatBarButton
            tooltip="VEYA Writing helper"
            onClick={e => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                pop = pop ? null : { channelId: channel.id, x: r.right, y: r.top };
                emit();
            }}
        >
            <span className="veya-bar-logo"><VIcon name="brush" size={20} dot={false} /></span>
        </ChatBarButton>
    );
};

export function WriterHost() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    if (!pop) return null;
    return <WriterPopover key={pop.channelId + pop.x} state={pop} />;
}

function WriterPopover({ state }: { state: PopState; }) {
    const ref = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<string | null>(null);
    const [custom, setCustom] = useState("");
    const [out, setOut] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const draft = getDraft(state.channelId).trim();
    const close = () => { pop = null; emit(); };

    useEffect(() => {
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[class*='buttons_']")) close(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("mousedown", onDown, true); document.removeEventListener("keydown", onKey, true); };
    }, []);

    async function run(id: string, task: string) {
        setMode(id); setBusy(true); setErr(""); setOut("");
        try {
            const text = await callAI([
                { role: "system", content: `You are a writing helper for Discord messages. ${task} Unless the task is a translation, write in the same language as the user's draft or request. Output ONLY the finished text, exactly as the user would send it – no introduction, no quotation marks. Keep Discord markdown, mentions (<@…>) and emojis.` },
                { role: "user", content: draft ? `<draft>\n${draft}\n</draft>` : `Write a short Discord message. Request: ${custom}` },
            ], 800);
            setOut(text.trim());
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    }

    const left = Math.max(12, Math.min(state.x - 380, window.innerWidth - 392));
    const bottom = Math.max(12, window.innerHeight - state.y + 10);

    return (
        <div ref={ref} className="veya-writer-pop" style={{ left, bottom }} role="dialog" aria-label="VEYA Writing helper">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <VIcon name="brush" size={16} />
                <b style={{ color: "var(--header-primary)", flex: 1 }}>Writing helper</b>
                <button className="veya-task-x" onClick={close} aria-label="Close"><VIcon name="close" size={12} /></button>
            </div>

            {draft
                ? <div style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Draft: {draft}</div>
                : <div className="veya-row" style={{ flexWrap: "nowrap" }}>
                    <input className="veya-input" autoFocus placeholder="What should the message be about?" value={custom} onChange={e => setCustom(e.currentTarget.value)}
                        onKeyDown={e => { if (e.key === "Enter" && custom.trim()) run("custom", "Write the message according to the user's request."); }} />
                    <button className="veya-btn primary" disabled={!custom.trim() || busy} onClick={() => run("custom", "Write the message according to the user's request.")}><VIcon name="spark" size={14} dot={false} /></button>
                </div>}

            {draft && (
                <div className="veya-writer-modes">
                    {MODES.map(m => <button key={m.id} className={mode === m.id ? "on" : ""} disabled={busy} onClick={() => run(m.id, m.task)}>{m.label}</button>)}
                </div>
            )}

            {busy && <div className="veya-row" style={{ color: "var(--text-muted)" }}><VIcon name="spinner" size={14} dot={false} className="veya-spin" /> VEYA is writing…</div>}
            {err && <div className="veya-note err">{err}</div>}
            {out && (
                <>
                    <div className="veya-writer-out">{out}</div>
                    <div className="veya-row end">
                        <button className="veya-btn" onClick={() => copyWithToast(out, "Copied")}><VIcon name="copy" size={14} dot={false} /> Copy</button>
                        <button className="veya-btn primary" onClick={() => { draft ? replaceDraft(out) : insertTextIntoChatInputBox(out); close(); }}>
                            <VIcon name="check" size={14} dot={false} /> Apply
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
