/*
 * VEYA-AI – tour.tsx
 * Short onboarding on the very first start: what VEYA can do and how to set up the AI.
 */

import { SettingsRouter, useState } from "@webpack/common";

import { openDialog } from "./dialogs";
import { VIcon, type VeyaIconName } from "./icons";
import { settings } from "./settings";
import { Native } from "./VeyaAPI";

interface Slide { icon: VeyaIconName; title: string; text: string; }

const SLIDES: Slide[] = [
    { icon: "spark", title: "Welcome to VEYA", text: "VEYA adds a free AI mod to Discord. This quick tour shows you the 4 things worth knowing – takes 30 seconds." },
    { icon: "chat", title: "The VEYA button", text: "Next to the message box there's a small V button. Click it to chat with the AI – it can see the current channel, so you can ask things like \"what are they talking about?\"" },
    { icon: "reply", title: "Right-click anything", text: "Right-click a message → VEYA-AI: translate, explain, suggest a reply, share as image or set a reminder." },
    { icon: "eye", title: "Catch up & ask the server", text: "Right-click a channel → \"What did I miss?\" summarizes everything you missed. Right-click a server → \"Ask the server\" searches all messages and answers with jump links." },
    { icon: "key", title: "Set up the AI", text: "VEYA needs an AI to work. Easiest: a free Google Gemini key (1 minute, no credit card). Or run Local AI on your own PC – no key, nothing leaves your computer, needs ~3–5 GB." },
];

function openVeyaSettings() {
    try { SettingsRouter.openUserSettings("veya_ai_panel"); } catch {
        try { SettingsRouter.open("veya_ai"); } catch { }
    }
}

function TourBody({ close }: { close: () => void; }) {
    const [i, setI] = useState(0);
    const s = SLIDES[i];
    const last = i === SLIDES.length - 1;
    const finish = () => { settings.store.tourDone = true; close(); };

    return (
        <div className="veya-tour">
            <div className="veya-tour-ico"><VIcon name={s.icon} size={28} /></div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            {last && (
                <div className="veya-row">
                    <button className="veya-btn primary" onClick={() => { finish(); openVeyaSettings(); }}>Add a free Gemini key</button>
                    <button className="veya-btn" onClick={() => { finish(); Native.openLocalSetup?.(); }}>Set up Local AI</button>
                </div>
            )}
            <div className="veya-row end" style={{ marginTop: "auto" }}>
                <div className="veya-tour-dots">{SLIDES.map((_, n) => <i key={n} className={n === i ? "on" : ""} />)}</div>
                {i === 0 && <button className="veya-btn" onClick={finish}>Skip</button>}
                {i > 0 && <button className="veya-btn" onClick={() => setI(i - 1)}>Back</button>}
                {!last && <button className="veya-btn primary" onClick={() => setI(i + 1)}>Next</button>}
                {last && <button className="veya-btn" onClick={finish}>Later</button>}
            </div>
        </div>
    );
}

export function openTour() {
    openDialog({ title: "Getting started", subtitle: "VEYA in 30 seconds", width: 520, render: close => <TourBody close={close} /> });
}

/** Shown once, a few seconds after the first start (after the intro animation) */
export function maybeStartTour() {
    if (settings.store.tourDone) return;
    setTimeout(() => { if (!settings.store.tourDone) openTour(); }, 4500);
}
