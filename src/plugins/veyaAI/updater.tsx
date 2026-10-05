/*
 * VEYA-AI – updater.tsx
 * On Discord start: ask GitHub for a newer VEYA release. If there is one, a dialog in the
 * middle of the screen offers "Update now" (downloads the installer, which closes Discord,
 * updates VEYA and starts Discord again), "Later" or "Skip this version".
 */

import { React, useState } from "@webpack/common";

import { VeyaLogo } from "./brand";
import { openDialog } from "./dialogs";
import { VIcon } from "./icons";
import { settings } from "./settings";
import { Native } from "./VeyaAPI";

type UpdateInfo = Awaited<ReturnType<typeof Native.checkForUpdate>>;

/** Release notes: plain text, "- item" lines become bullets, "#" headings bold */
function Notes({ text }: { text: string; }) {
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 14);
    if (!lines.length) return null;
    return (
        <div className="veya-update-notes">
            {lines.map((l, i) => {
                const head = l.match(/^#{1,6}\s*(.+)/);
                const item = l.match(/^[-*•]\s+(.+)/);
                const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
                if (head) return <b key={i}>{clean(head[1])}</b>;
                if (item) return <div key={i} className="veya-update-item"><VIcon name="check" size={13} dot={false} />{clean(item[1])}</div>;
                return <div key={i}>{clean(l)}</div>;
            })}
        </div>
    );
}

function UpdateBody({ info, close }: { info: UpdateInfo; close: () => void; }) {
    const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
    const [error, setError] = useState("");
    const mb = info.size ? ` · ${(info.size / 1048576).toFixed(0)} MB` : "";

    async function update() {
        setState("busy");
        const r = await Native.installUpdate();
        if (r.ok) setState("done");
        else { setError(r.error || "Update failed."); setState("error"); }
    }

    return (
        <>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <VeyaLogo size={46} />
                <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--header-primary)" }}>VEYA v{info.version} is here</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>You have v{info.current}{mb}</div>
                </div>
            </div>
            {info.notes && <Notes text={info.notes} />}
            {state === "busy" && <div className="veya-update-status"><VIcon name="spinner" size={16} dot={false} className="veya-spin" /> Downloading the update…</div>}
            {state === "done" && <div className="veya-update-status ok"><VIcon name="done" size={16} /> Installing – Discord closes and restarts in a moment.</div>}
            {state === "error" && <div className="veya-update-status err"><VIcon name="error" size={16} dot={false} /> {error} {info.page && <a href={info.page} target="_blank" rel="noreferrer">Download manually</a>}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {state !== "done" && <button className="veya-btn" disabled={state === "busy"} onClick={() => { settings.store.skippedUpdate = info.version ?? ""; close(); }}>Skip this version</button>}
                {state !== "done" && <button className="veya-btn" disabled={state === "busy"} onClick={close}>Later</button>}
                {(state === "idle" || state === "error") && <button className="veya-btn primary" onClick={update}><VIcon name="import" size={14} dot={false} /> Update now</button>}
            </div>
        </>
    );
}

export function showUpdate(info: UpdateInfo) {
    openDialog({ title: "Update available", width: 480, render: close => <UpdateBody info={info} close={close} /> });
}

/** Called once on start. manual = from the About page (also shows "you're up to date") */
export async function checkUpdates(manual = false): Promise<UpdateInfo> {
    const info = await Native.checkForUpdate();
    if (info.available && (manual || settings.store.skippedUpdate !== info.version)) showUpdate(info);
    return info;
}
