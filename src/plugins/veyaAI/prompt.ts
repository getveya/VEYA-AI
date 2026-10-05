/*
 * VEYA-AI – prompt.ts
 * Assembles the system prompt: base prompt, personality, current game,
 * server knowledge and (optionally) the latest messages of the open channel.
 */

import * as DataStore from "@api/DataStore";
import { ChannelStore, RunningGameStore, SelectedChannelStore } from "@webpack/common";

import { channelContextPrompt } from "./channelContext";
import { settings } from "./settings";

const PERSONAS: Record<string, string> = {
    standard: "",
    sachlich: "Personality: factual, precise and concise. No jokes, no emojis.",
    lustig: "Personality: relaxed and witty, happy to add a wink – but still helpful.",
    gamer: "Personality: gamer buddy. Laid-back, knows gaming slang, builds, metas and patches. Always informal.",
    lehrer: "Personality: patient teacher. Explains step by step with simple examples and checks that everything was understood.",
};

// ─── Server knowledge (rules, FAQ, info per server) ───────────────────────────

const KNOWLEDGE_KEY = "VeyaAI_serverKnowledge";
let knowledge: Record<string, string> = {};
let knowledgeLoaded = false;

export async function loadKnowledge() {
    knowledge = (await DataStore.get<Record<string, string>>(KNOWLEDGE_KEY)) ?? {};
    knowledgeLoaded = true;
}

export function getKnowledge(guildId: string): string {
    return knowledge[guildId] ?? "";
}

export async function setKnowledge(guildId: string, text: string) {
    if (!knowledgeLoaded) await loadKnowledge();
    if (text.trim()) knowledge[guildId] = text.trim().slice(0, 12_000);
    else delete knowledge[guildId];
    await DataStore.set(KNOWLEDGE_KEY, knowledge);
}

export function allKnowledge() { return { ...knowledge }; }

function currentGuildId(): string | null {
    const id = SelectedChannelStore.getChannelId();
    return id ? (ChannelStore.getChannel(id) as any)?.guild_id ?? null : null;
}

export function currentGame(): string | null {
    try { return (RunningGameStore as any).getVisibleGame?.()?.name ?? null; } catch { return null; }
}

export function buildSystemPrompt(extra?: string, withChannel = true): string {
    const s = settings.store;
    const parts: string[] = [s.aiSystemPrompt];

    const persona = s.persona === "eigene" ? (s.customPersona || "").trim() : PERSONAS[s.persona as string] ?? "";
    if (persona) parts.push(persona);

    if (s.gameContext) {
        const game = currentGame();
        if (game) parts.push(`The user is currently playing "${game}". If they ask for tips, builds, strategies or patches, refer to this game.`);
    }

    const guild = currentGuildId();
    const info = guild && getKnowledge(guild);
    if (info) parts.push(`Knowledge about this server (rules, FAQ, info from the user):\n<server_knowledge>\n${info}\n</server_knowledge>`);

    if (withChannel && s.readChannel) {
        const ctx = channelContextPrompt(Number(s.contextCount) || 50);
        if (ctx) parts.push(ctx);
    }
    if (extra) parts.push(extra);
    return parts.filter(Boolean).join("\n\n");
}
