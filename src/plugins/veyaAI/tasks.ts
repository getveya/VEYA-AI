/*
 * VEYA-AI – tasks.ts
 * Longer tasks (building a server, analyzing a server, …) report their progress here.
 * The bar at the top of Discord and the VEYA logo at the top right display it.
 */

import { useEffect, useState } from "@webpack/common";

export interface Task {
    id: string;
    label: string;
    /** 0–1, or null if unknown */
    progress: number | null;
    detail?: string;
    done?: boolean;
    error?: string;
    cancelled?: boolean;
}

const tasks = new Map<string, Task>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
let counter = 0;

export interface TaskHandle {
    readonly id: string;
    update(progress: number | null, detail?: string): void;
    finish(detail?: string): void;
    fail(error: string): void;
    /** true if the user cancelled */
    readonly cancelled: boolean;
}

export function startTask(label: string): TaskHandle {
    const id = `t${++counter}`;
    const t: Task = { id, label, progress: 0 };
    tasks.set(id, t);
    emit();
    const end = () => setTimeout(() => { tasks.delete(id); emit(); }, 2600);
    return {
        id,
        update(progress, detail) {
            if (t.done) return;
            t.progress = progress == null ? null : Math.max(0, Math.min(1, progress));
            if (detail !== undefined) t.detail = detail;
            emit();
        },
        finish(detail) {
            t.progress = 1; t.done = true;
            if (detail !== undefined) t.detail = detail;
            emit(); end();
        },
        fail(error) {
            t.done = true; t.error = error;
            emit(); end();
        },
        get cancelled() { return !!t.cancelled; },
    };
}

export function cancelTask(id: string) {
    const t = tasks.get(id);
    if (t && !t.done) { t.cancelled = true; t.detail = "Cancelling…"; emit(); }
}

export function useTasks(): Task[] {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return [...tasks.values()];
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
