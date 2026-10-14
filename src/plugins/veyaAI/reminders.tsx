/*
 * VEYA-AI – reminders.tsx
 * "Remind me": right-click a message → a notification later; clicking it jumps to the message.
 * Stored locally (DataStore), survives restarts. Missed reminders fire on the next start.
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { createRoot, NavigationRouter, React, useEffect, useState } from "@webpack/common";

import { openDialog } from "./dialogs";
import { VIcon } from "./icons";

export interface Reminder {
    id: string;
    at: number;
    note: string;
    /** Excerpt of the message */
    text: string;
    author: string;
    channelId: string;
    guildId: string | null;
    messageId: string;
    created: number;
}

const KEY = "VeyaAI_reminders";
let list: Reminder[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

async function save() {
    await DataStore.set(KEY, list);
    emit();
}

export function jumpTo(r: Pick<Reminder, "guildId" | "channelId" | "messageId">) {
    NavigationRouter.transitionTo(`/channels/${r.guildId ?? "@me"}/${r.channelId}/${r.messageId}`);
}

// ─── Reminder "DM" from VEYA ─────────────────────────────────────────────────
// Looks like a direct message from VEYA (only on your screen) and stays until you close it.

let cards: Reminder[] = [];
const cardListeners = new Set<() => void>();
const emitCards = () => cardListeners.forEach(l => l());

function ding() {
    try {
        const ac = new AudioContext();
        [880, 1320].forEach((f, i) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "sine"; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + i * 0.12 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.12 + 0.35);
            o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.12); o.stop(ac.currentTime + i * 0.12 + 0.4);
        });
        setTimeout(() => ac.close(), 1200);
    } catch { }
}

function fire(r: Reminder) {
    pushInbox(r);
    cards = [...cards.filter(c => c.id !== r.id), r];
    emitCards();
    ding();
    // also a system notification when Discord is in the background
    if (!document.hasFocus()) showNotification({
        title: "VEYA",
        body: `Reminder: ${r.note || `${r.author}: ${r.text}`}`,
        permanent: true,
        onClick: () => { jumpTo(r); dismiss(r.id); },
    });
}

function dismiss(id: string) { cards = cards.filter(c => c.id !== id); emitCards(); }

function snooze(r: Reminder, min: number) {
    dismiss(r.id);
    addReminder({ ...r, at: Date.now() + min * 60_000 });
}

const AVATAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0b0d06"/><path d="M28 32 L50 70 L72 32" fill="none" stroke="#ccff00" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="80" cy="22" r="6" fill="#ccff00"/></svg>';
const AVATAR_SRC = "data:image/svg+xml;base64," + btoa(AVATAR);

export function ReminderCards() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        cardListeners.add(l);
        return () => void cardListeners.delete(l);
    }, []);
    if (!cards.length) return null;
    return (
        <div className="veya-dm-stack">
            {cards.map(r => (
                <div key={r.id} className="veya-dm" role="alert">
                    <img className="veya-dm-av" src={AVATAR_SRC} alt="" />
                    <div className="veya-dm-main">
                        <div className="veya-dm-head">
                            <b>VEYA</b><span className="veya-dm-tag">APP</span>
                            <small>{new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small>
                            <button className="veya-dm-x" aria-label="Close" onClick={() => dismiss(r.id)}><VIcon name="close" size={12} dot={false} /></button>
                        </div>
                        <div className="veya-dm-text">
                            Hey! You asked me to remind you{r.note ? <>: <b>{r.note}</b></> : "."}
                        </div>
                        <div className="veya-dm-quote"><b>{r.author}</b> {r.text}</div>
                        <div className="veya-dm-actions">
                            <button className="veya-dm-btn primary" onClick={() => { jumpTo(r); dismiss(r.id); }}>Jump to message</button>
                            <button className="veya-dm-btn" onClick={() => snooze(r, 10)}>Snooze 10 min</button>
                            <button className="veya-dm-btn" onClick={() => dismiss(r.id)}>Done</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function check() {
    const now = Date.now();
    const due = list.filter(r => r.at <= now);
    if (!due.length) return;
    list = list.filter(r => r.at > now);
    due.forEach(fire);
    save();
}

export async function startReminders() {
    list = (await DataStore.get<Reminder[]>(KEY)) ?? [];
    check();
    timer = setInterval(check, 15_000);
}

export function stopReminders() {
    clearInterval(timer);
    timer = undefined;
}

export function addReminder(r: Omit<Reminder, "id" | "created">) {
    list = [...list, { ...r, id: Math.random().toString(36).slice(2, 10), created: Date.now() }].sort((a, b) => a.at - b.at);
    save();
}

export function removeReminder(id: string) {
    list = list.filter(r => r.id !== id);
    save();
}

export function useReminders(): Reminder[] {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return list;
}

// ─── Times ───────────────────────────────────────────────────────────────────

export function formatWhen(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const t = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `today, ${t}`;
    if (d.toDateString() === tomorrow.toDateString()) return `tomorrow, ${t}`;
    return `${d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${t}`;
}

function tomorrowAt(h: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
}

export const PRESETS: { label: string; at: () => number; }[] = [
    { label: "In 1 minute", at: () => Date.now() + 60_000 },
    { label: "In 20 minutes", at: () => Date.now() + 20 * 60_000 },
    { label: "In 1 hour", at: () => Date.now() + 60 * 60_000 },
    { label: "In 3 hours", at: () => Date.now() + 3 * 60 * 60_000 },
    { label: "Tomorrow, 9:00", at: () => tomorrowAt(9) },
];

function toLocalInput(ts: number) {
    const d = new Date(ts - new Date().getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
}

/** Custom time + note */
export function openCustomReminder(base: Omit<Reminder, "id" | "created" | "at" | "note">) {
    openDialog({
        title: "Set reminder",
        subtitle: `${base.author}: ${base.text.slice(0, 80)}`,
        width: 420,
        render: close => <CustomReminder base={base} close={close} />,
    });
}

function CustomReminder({ base, close }: { base: Omit<Reminder, "id" | "created" | "at" | "note">; close: () => void; }) {
    const [when, setWhen] = useState(toLocalInput(Date.now() + 60 * 60_000));
    const [note, setNote] = useState("");
    const ts = new Date(when).getTime();
    const valid = Number.isFinite(ts) && ts > Date.now();
    return (
        <>
            <label className="veya-field">
                <span>When</span>
                <input className="veya-input" type="datetime-local" value={when} onChange={e => setWhen(e.currentTarget.value)} />
            </label>
            <label className="veya-field">
                <span>Note (optional)</span>
                <input className="veya-input" value={note} placeholder="e.g. Don't forget to reply" maxLength={200} onChange={e => setNote(e.currentTarget.value)} />
            </label>
            <div className="veya-row end">
                <button className="veya-btn" onClick={close}>Cancel</button>
                <button className="veya-btn primary" disabled={!valid} onClick={() => { addReminder({ ...base, at: ts, note: note.trim() }); close(); }}>
                    <VIcon name="check" size={14} dot={false} /> Remind me {valid ? formatWhen(ts) : ""}
                </button>
            </div>
        </>
    );
}

/** List for the settings */
export function RemindersList() {
    const items = useReminders();
    if (!items.length) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No pending reminders. Right-click a message → VEYA-AI → Remind me.</div>;
    return (
        <div className="veya-list">
            {items.map(r => (
                <div key={r.id} className="veya-list-item">
                    <VIcon name="wait" size={16} />
                    <div>
                        <b>{formatWhen(r.at)}</b>{r.note && <> · {r.note}</>}
                        <small>{r.author}: {r.text}</small>
                    </div>
                    <button className="veya-btn" onClick={() => jumpTo(r)}>Go to message</button>
                    <button className="veya-btn danger" onClick={() => removeReminder(r.id)} aria-label="Delete"><VIcon name="trash" size={14} dot={false} /></button>
                </div>
            ))}
        </div>
    );
}


// ─── VEYA in the DM list ─────────────────────────────────────────────────────
// A "VEYA" entry at the top of your direct messages (only on your screen).
// Fired reminders land there like messages from a real account; click it to open them.

interface InboxMsg extends Reminder { firedAt: number; }
const INBOX_KEY = "VeyaAI_inbox";
let inbox: InboxMsg[] = [];
let unread = 0;
const inboxListeners = new Set<() => void>();
const emitInbox = () => { inboxListeners.forEach(l => l()); DataStore.set(INBOX_KEY, { inbox, unread }).catch(() => { }); };

function pushInbox(r: Reminder) {
    inbox = [...inbox.filter(m => m.id !== r.id), { ...r, firedAt: Date.now() }].slice(-40);
    unread++;
    emitInbox();
}

function useInbox() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        inboxListeners.add(l);
        return () => void inboxListeners.delete(l);
    }, []);
    return inbox;
}

const timeOf = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const dayOf = (ts: number) => formatWhen(ts).replace(/, \d.*$/, "");

function InboxView({ close }: { close: () => void; }) {
    const items = useInbox();
    const end = React.useRef<HTMLDivElement>(null);
    useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [items.length]);
    return (
        <div className="veya-inbox">
            <div className="veya-inbox-intro">
                <img src={AVATAR_SRC} alt="" />
                <b>VEYA</b>
                <span>Your reminders show up here. Only you can see this chat.</span>
            </div>
            {items.map(m => (
                <div key={m.id + m.firedAt} className="veya-inbox-msg">
                    <img className="veya-dm-av" src={AVATAR_SRC} alt="" />
                    <div className="veya-dm-main">
                        <div className="veya-dm-head"><b>VEYA</b><span className="veya-dm-tag">APP</span><small>{dayOf(m.firedAt)} {timeOf(m.firedAt)}</small></div>
                        <div className="veya-dm-text">Hey! You asked me to remind you{m.note ? <>: <b>{m.note}</b></> : "."}</div>
                        <div className="veya-dm-quote"><b>{m.author}</b> {m.text}</div>
                        <div className="veya-dm-actions">
                            <button className="veya-dm-btn primary" onClick={() => { jumpTo(m); close(); }}>Jump to message</button>
                            <button className="veya-dm-btn" onClick={() => { addReminder({ ...m, at: Date.now() + 10 * 60_000 }); }}>Remind me again in 10 min</button>
                        </div>
                    </div>
                </div>
            ))}
            <div ref={end} />
            {items.length > 0 && (
                <div className="veya-row end">
                    <button className="veya-btn" onClick={() => { inbox = []; unread = 0; emitInbox(); close(); }}>Clear chat</button>
                </div>
            )}
        </div>
    );
}

function openInbox() {
    unread = 0; emitInbox();
    openDialog({ title: "VEYA", subtitle: "Reminders · only visible to you", width: 520, render: close => <InboxView close={close} /> });
}

function DmRow() {
    const items = useInbox();
    if (!items.length) return null;
    const last = items[items.length - 1];
    return (
        <div className={`veya-dmrow${unread ? " unread" : ""}`} role="button" tabIndex={0}
            onClick={openInbox} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInbox(); } }}>
            <div className="veya-dmrow-av"><img src={AVATAR_SRC} alt="" /><i /></div>
            <div className="veya-dmrow-txt">
                <div className="veya-dmrow-name">VEYA <span className="veya-dm-tag">APP</span></div>
                <div className="veya-dmrow-sub">Reminder: {last.note || last.text}</div>
            </div>
            {unread > 0 && <span className="veya-dmrow-badge">{unread > 9 ? "9+" : unread}</span>}
        </div>
    );
}

// Discord re-renders its DM list often → keep our row right under the "Direct Messages" header
let rowHost: HTMLDivElement | null = null;
let rowRoot: ReturnType<typeof createRoot> | null = null;
let observer: MutationObserver | null = null;

function placeRow() {
    const header = document.querySelector('[class*="privateChannelsHeaderContainer"]');
    if (!header?.parentElement) return;
    if (!rowHost) {
        rowHost = document.createElement("div");
        rowHost.id = "veya-dm-entry";
        rowRoot = createRoot(rowHost);
        rowRoot.render(<DmRow />);
    }
    if (header.nextElementSibling !== rowHost) header.after(rowHost);
}

export async function startInbox() {
    try {
        const saved = await DataStore.get<{ inbox: InboxMsg[]; unread: number; }>(INBOX_KEY);
        inbox = saved?.inbox ?? []; unread = saved?.unread ?? 0;
    } catch { }
    let queued = false;
    observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; placeRow(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    placeRow();
}

export function stopInbox() {
    observer?.disconnect(); observer = null;
    rowRoot?.unmount(); rowRoot = null;
    rowHost?.remove(); rowHost = null;
}
