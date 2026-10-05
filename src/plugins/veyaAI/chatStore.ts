/*
 * VEYA-AI – chatStore.ts
 * Small shared state: is the chat open, and should something be sent right away
 * (e.g. from a message's right-click menu)?
 */

import { useEffect, useState } from "@webpack/common";

export interface PendingRequest {
    /** What is shown in the chat as your message */
    display: string;
    /** What is actually sent to the AI */
    prompt: string;
    /** Extra instruction for this request only */
    system?: string;
    /** Special action instead of text */
    action?: "summarize" | "catchup";
    /** Images/audio sent only with this request */
    parts?: import("./native").Part[];
    /** For "What did I miss?" */
    channelId?: string;
    /** Load images/audio only once the chat is open (shows the typing animation meanwhile) */
    loadParts?: () => Promise<import("./native").Part[]>;
    /** Include channel history (default: yes) */
    withChannel?: boolean;
    /** Preview image shown in the chat */
    thumb?: string;
    /** Custom task instead of AI chat (e.g. transcribing a voice message) – the result appears as the reply */
    run?: () => Promise<string>;
}

interface State { open: boolean; pending: PendingRequest | null; }

const state: State = { open: false, pending: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const ChatState = {
    get: () => state,
    open(pending?: PendingRequest) {
        state.open = true;
        if (pending) state.pending = pending;
        emit();
    },
    close() { state.open = false; emit(); },
    toggle() { state.open = !state.open; emit(); },
    takePending(): PendingRequest | null {
        const p = state.pending;
        state.pending = null;
        return p;
    },
};

export function useChatState(): State {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return state;
}
