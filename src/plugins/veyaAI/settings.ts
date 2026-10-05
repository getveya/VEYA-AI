/*
 * VEYA-AI – settings.ts
 * Settings (in Vencord's settings.json). API keys are NOT stored here, they are kept encrypted in the main process.
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import type { Provider } from "./native";

/** `models` are only suggestions – VEYA loads the real list from the provider ("auto" = best available) */
export const PROVIDERS: { id: Provider; label: string; keyUrl: string; keyHint: string; models: string[]; note?: string; }[] = [
    { id: "claude",     label: "Claude",     keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…", models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"] },
    { id: "openai",     label: "ChatGPT",    keyUrl: "https://platform.openai.com/api-keys",         keyHint: "sk-…",     models: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"] },
    { id: "gemini",     label: "Gemini",     keyUrl: "https://aistudio.google.com/app/apikey",       keyHint: "AIza…",    models: ["gemini-flash-latest", "gemini-pro-latest"], note: "Free tier available" },
    { id: "deepseek",   label: "DeepSeek",   keyUrl: "https://platform.deepseek.com/api_keys",       keyHint: "sk-…",     models: ["deepseek-chat", "deepseek-reasoner"] },
    { id: "xai",        label: "Grok (xAI)", keyUrl: "https://console.x.ai",                         keyHint: "xai-…",    models: ["grok-4", "grok-4-fast"] },
    { id: "mistral",    label: "Mistral",    keyUrl: "https://console.mistral.ai/api-keys",          keyHint: "…",        models: ["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest"], note: "Free tier available" },
    { id: "groq",       label: "Groq",       keyUrl: "https://console.groq.com/keys",                keyHint: "gsk_…",    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"], note: "Free tier, very fast" },
    { id: "openrouter", label: "OpenRouter", keyUrl: "https://openrouter.ai/keys",                   keyHint: "sk-or-…",  models: ["openrouter/auto"], note: "Hundreds of models with one key" },
];

export const settings = definePluginSettings({
    aiProvider: {
        type: OptionType.SELECT,
        description: "Active AI provider",
        options: [
            { label: "Claude (Anthropic)", value: "claude", default: true },
            { label: "ChatGPT (OpenAI)", value: "openai" },
            { label: "Gemini (Google)", value: "gemini" },
            { label: "DeepSeek", value: "deepseek" },
            { label: "Grok (xAI)", value: "xai" },
            { label: "Mistral", value: "mistral" },
            { label: "Groq", value: "groq" },
            { label: "OpenRouter", value: "openrouter" },
        ],
    },
    modelClaude:     { type: OptionType.STRING, description: "Model for Claude (auto = best available)", default: "auto" },
    modelOpenAI:     { type: OptionType.STRING, description: "Model for ChatGPT", default: "auto" },
    modelGemini:     { type: OptionType.STRING, description: "Model for Gemini", default: "auto" },
    modelDeepSeek:   { type: OptionType.STRING, description: "Model for DeepSeek", default: "auto" },
    modelXai:        { type: OptionType.STRING, description: "Model for Grok", default: "auto" },
    modelMistral:    { type: OptionType.STRING, description: "Model for Mistral", default: "auto" },
    modelGroq:       { type: OptionType.STRING, description: "Model for Groq", default: "auto" },
    modelOpenRouter: { type: OptionType.STRING, description: "Model for OpenRouter", default: "auto" },
    modelsMigrated:  { type: OptionType.BOOLEAN, description: "", default: false, hidden: true },
    skippedUpdate:   { type: OptionType.STRING, description: "", default: "", hidden: true },
    aiSystemPrompt: {
        type: OptionType.STRING,
        description: "System prompt for the AI",
        default: "You are VEYA, an AI assistant built right into Discord. Only the user can see you – the others in the chat can't. You can read the currently open channel and refer to it when the user asks about it. Always reply in the user's language, briefly and helpfully, using Discord markdown.",
    },
    readChannel:  { type: OptionType.BOOLEAN, description: "VEYA reads the open channel (the latest messages are sent to the AI provider)", default: true },
    contextCount: {
        type: OptionType.SELECT,
        description: "How many messages VEYA reads",
        options: [
            { label: "20", value: 20 },
            { label: "50", value: 50, default: true },
            { label: "100", value: 100 },
        ],
    },
    persona: {
        type: OptionType.SELECT,
        description: "VEYA's personality",
        options: [
            { label: "Standard", value: "standard", default: true },
            { label: "Factual", value: "sachlich" },
            { label: "Funny", value: "lustig" },
            { label: "Gamer", value: "gamer" },
            { label: "Teacher", value: "lehrer" },
            { label: "Custom", value: "eigene" },
        ],
    },
    customPersona:  { type: OptionType.STRING, description: "Custom personality (when \"Custom\" is selected)", default: "" },
    gameContext:    { type: OptionType.BOOLEAN, description: "VEYA knows which game you are currently playing", default: true },
    autoTranslate:  { type: OptionType.BOOLEAN, description: "Automatically translate messages in other languages", default: false },
    motionEffects:  { type: OptionType.BOOLEAN, description: "VEYA Motion: smooth animations across all of Discord", default: false, onChange: (v: boolean) => document.body.classList.toggle("veya-motion", !!v) },
    showBadge:      { type: OptionType.BOOLEAN, description: "", default: false, hidden: true },
    writerButton:   { type: OptionType.BOOLEAN, description: "Writing helper button in the message box", default: true },
    streamResponses: { type: OptionType.BOOLEAN, description: "Show replies word by word (streaming)", default: true },
    saveHistory:     { type: OptionType.BOOLEAN, description: "Keep chat history after restart", default: true },
    messageActions:  { type: OptionType.BOOLEAN, description: "VEYA actions in the message right-click menu", default: true },
    translateTarget: { type: OptionType.STRING, description: "Target language for translations (auto = your Discord language)", default: "auto" },
    storeUrl: {
        type: OptionType.STRING,
        description: "Online store address (index.json)",
        default: "https://raw.githubusercontent.com/getveya/veya-store/main/index.json",
    },
    storeSubmitUrl: {
        type: OptionType.STRING,
        description: "Page for submitting your own plugins/themes",
        default: "https://github.com/getveya/veya-store",
    },

    // Old plain-text keys – migrated encrypted on startup and then cleared
    apiKeyClaud:    { type: OptionType.STRING, description: "", default: "", hidden: true },
    apiKeyOpenAI:   { type: OptionType.STRING, description: "", default: "", hidden: true },
    apiKeyGemini:   { type: OptionType.STRING, description: "", default: "", hidden: true },
    apiKeyDeepSeek: { type: OptionType.STRING, description: "", default: "", hidden: true },
});

export function currentProvider(): Provider {
    return (settings.store.aiProvider as Provider) ?? "claude";
}

const MODEL_KEY: Record<Provider, string> = {
    claude: "modelClaude", openai: "modelOpenAI", gemini: "modelGemini", deepseek: "modelDeepSeek",
    xai: "modelXai", mistral: "modelMistral", groq: "modelGroq", openrouter: "modelOpenRouter",
};

/** "auto" = VEYA picks the best model the key can use */
export function modelFor(p: Provider): string {
    const m = (settings.store as any)[MODEL_KEY[p]];
    return (typeof m === "string" && m.trim()) || "auto";
}

export function setModelFor(p: Provider, model: string) {
    (settings.store as any)[MODEL_KEY[p]] = model.trim() || "auto";
}

/** Old fixed default models → "auto" (one-time) */
export function migrateModels() {
    const s = settings.store as any;
    if (s.modelsMigrated) return;
    const OLD = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gemini-2.5-flash", "gemini-2.5-pro", "deepseek-chat", "deepseek-reasoner"];
    for (const key of Object.values(MODEL_KEY)) if (!s[key] || OLD.includes(s[key])) s[key] = "auto";
    s.modelsMigrated = true;
}

export function providerLabel(p: Provider) {
    return PROVIDERS.find(x => x.id === p)?.label ?? p;
}


export const LANGUAGES: { name: string; native: string; }[] = [
    ["English", "English"], ["German", "Deutsch"], ["Spanish", "Español"], ["French", "Français"], ["Italian", "Italiano"],
    ["Portuguese", "Português"], ["Brazilian Portuguese", "Português (Brasil)"], ["Dutch", "Nederlands"], ["Polish", "Polski"],
    ["Turkish", "T\u00fcrk\u00e7e"], ["Russian", "Русский"], ["Ukrainian", "Українська"], ["Arabic", "العربية"], ["Persian", "فارسی"],
    ["Hindi", "हिन्दी"], ["Bengali", "বাংলা"], ["Urdu", "اردو"], ["Chinese (Simplified)", "简体中文"], ["Chinese (Traditional)", "繁體中文"],
    ["Japanese", "日本語"], ["Korean", "한국어"], ["Vietnamese", "Tiếng Việt"], ["Thai", "ไทย"], ["Indonesian", "Bahasa Indonesia"],
    ["Malay", "Bahasa Melayu"], ["Filipino", "Filipino"], ["Swedish", "Svenska"], ["Norwegian", "Norsk"], ["Danish", "Dansk"],
    ["Finnish", "Suomi"], ["Icelandic", "Íslenska"], ["Czech", "Čeština"], ["Slovak", "Slovenčina"], ["Hungarian", "Magyar"],
    ["Romanian", "Română"], ["Bulgarian", "Български"], ["Greek", "Ελληνικά"], ["Serbian", "Српски"], ["Croatian", "Hrvatski"],
    ["Bosnian", "Bosanski"], ["Slovenian", "Slovenščina"], ["Albanian", "Shqip"], ["Lithuanian", "Lietuvių"], ["Latvian", "Latviešu"],
    ["Estonian", "Eesti"], ["Hebrew", "עברית"], ["Kurdish", "Kurdî"], ["Swahili", "Kiswahili"], ["Afrikaans", "Afrikaans"],
    ["Catalan", "Català"], ["Basque", "Euskara"], ["Galician", "Galego"], ["Irish", "Gaeilge"], ["Welsh", "Cymraeg"],
    ["Tamil", "தமிழ்"], ["Telugu", "తెలుగు"], ["Punjabi", "ਪੰਜਾਬੀ"], ["Georgian", "ქართული"], ["Armenian", "Հայերեն"],
    ["Azerbaijani", "Azərbaycanca"], ["Kazakh", "Қазақша"], ["Uzbek", "Oʻzbekcha"], ["Mongolian", "Монгол"], ["Latin", "Latina"],
].map(([name, native]) => ({ name, native }));

/** The language VEYA translates into ("auto" = Discord/system language) */
export function targetLanguage(): string {
    const t = (settings.store.translateTarget || "auto").trim();
    if (t && t !== "auto") return t;
    try {
        const loc = document.documentElement.lang || navigator.language || "en";
        return new Intl.DisplayNames(["en"], { type: "language" }).of(loc.split("-")[0]) || "English";
    } catch { return "English"; }
}
