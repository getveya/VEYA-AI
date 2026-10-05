/*
 * VEYA-AI – reminders.tsx
 * "Remind me": right-click a message → a notification later; clicking it jumps to the message.
 * Stored locally (DataStore), survives restarts. Missed reminders fire on the next start.
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { NavigationRouter, React, useEffect, useState } from "@webpack/common";

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

function fire(r: Reminder) {
    showNotification({
        title: "VEYA · Reminder",
        body: `${r.note ? r.note + " – " : ""}${r.author}: ${r.text}`,
        permanent: true,
        onClick: () => jumpTo(r),
    });
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
