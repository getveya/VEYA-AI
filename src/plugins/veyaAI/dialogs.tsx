/*
 * VEYA-AI – dialogs.tsx
 * Custom windows in the VEYA look (server builder, analysis, image explanation, …).
 */

import { React, useEffect, useState } from "@webpack/common";

import { VeyaLogo } from "./brand";
import { VIcon } from "./icons";

interface DialogEntry {
    id: number;
    title: string;
    subtitle?: string;
    width?: number;
    render: (close: () => void) => React.ReactNode;
    closing?: boolean;
}

let dialogs: DialogEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
let counter = 0;

export function openDialog(opts: Omit<DialogEntry, "id" | "closing">): () => void {
    const entry: DialogEntry = { ...opts, id: ++counter };
    dialogs = [...dialogs, entry];
    emit();
    return () => closeDialog(entry.id);
}

function closeDialog(id: number) {
    const d = dialogs.find(x => x.id === id);
    if (!d || d.closing) return;
    d.closing = true;
    emit();
    setTimeout(() => { dialogs = dialogs.filter(x => x.id !== id); emit(); }, 160);
}

export function VeyaDialogHost() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        const onKey = (e: KeyboardEvent) => {
            const top = dialogs[dialogs.length - 1];
            if (e.key === "Escape" && top) { e.stopPropagation(); closeDialog(top.id); }
        };
        document.addEventListener("keydown", onKey, true);
        return () => { listeners.delete(l); document.removeEventListener("keydown", onKey, true); };
    }, []);

    return (
        <>
            {dialogs.map(d => {
                const close = () => closeDialog(d.id);
                return (
                    <div key={d.id} className={`veya-dialog-back${d.closing ? " closing" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
                        <div className="veya-dialog" role="dialog" aria-modal="true" aria-label={d.title} style={{ width: d.width ?? 560 }}>
                            <div className="veya-dialog-head">
                                <VeyaLogo size={26} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="veya-dialog-title">{d.title}</div>
                                    {d.subtitle && <div className="veya-dialog-sub">{d.subtitle}</div>}
                                </div>
                                <button className="veya-icon-btn" onClick={close} aria-label="Close"><VIcon name="close" size={16} /></button>
                            </div>
                            <div className="veya-dialog-body">{d.render(close)}</div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
