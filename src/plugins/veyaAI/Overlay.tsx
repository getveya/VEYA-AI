/*
 * VEYA-AI – Overlay.tsx
 * Progress bar at the very top (for longer tasks) and the small VEYA logo at the top right.
 */

import { React } from "@webpack/common";

import { VIcon } from "./icons";
import { cancelTask, type Task, useTasks } from "./tasks";

function overallProgress(tasks: Task[]): number | null {
    const running = tasks.filter(t => !t.done);
    if (!running.length) return 1;
    if (running.some(t => t.progress == null)) return null;
    return running.reduce((a, t) => a + (t.progress ?? 0), 0) / running.length;
}

function TopBar({ tasks }: { tasks: Task[]; }) {
    if (!tasks.length) return null;
    const p = overallProgress(tasks);
    const failed = tasks.some(t => t.error);
    const allDone = tasks.every(t => t.done);
    return (
        <div className={`veya-topbar${allDone ? " done" : ""}${failed ? " failed" : ""}`} role="progressbar" aria-label="VEYA is working" aria-valuenow={p == null ? undefined : Math.round(p * 100)}>
            <div className={`veya-topbar-fill${p == null ? " indeterminate" : ""}`} style={p == null ? undefined : { width: `${Math.max(3, p * 100)}%` }} />
        </div>
    );
}

function TaskList({ tasks }: { tasks: Task[]; }) {
    return (
        <div className="veya-tasks">
            {tasks.map(t => (
                <div key={t.id} className={`veya-task${t.error ? " failed" : t.done ? " done" : ""}`}>
                    <div className="veya-task-row">
                        <VIcon name={t.error ? "error" : t.done ? "done" : "spinner"} size={14} dot={false} className={!t.done ? "veya-spin" : undefined} />
                        <b>{t.label}</b>
                        {!t.done && <button className="veya-task-x" onClick={() => cancelTask(t.id)} title="Cancel" aria-label="Cancel"><VIcon name="close" size={12} /></button>}
                    </div>
                    {(t.error || t.detail) && <div className="veya-task-detail">{t.error ?? t.detail}</div>}
                    {!t.done && (
                        <div className="veya-task-bar"><i className={t.progress == null ? "indeterminate" : ""} style={t.progress == null ? undefined : { width: `${Math.max(4, t.progress * 100)}%` }} /></div>
                    )}
                </div>
            ))}
        </div>
    );
}

function TaskPill({ tasks }: { tasks: Task[]; }) {
    if (!tasks.length) return null;
    return <div className="veya-taskpill"><TaskList tasks={tasks} /></div>;
}

export function VeyaOverlay() {
    const tasks = useTasks();
    return (
        <>
            <TopBar tasks={tasks} />
            <TaskPill tasks={tasks} />
        </>
    );
}
