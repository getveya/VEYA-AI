<p align="center">
  <img src="assets/veya-logo.png" width="96" alt="VEYA-AI logo">
</p>

<h1 align="center">VEYA-AI</h1>

<p align="center"><b>AI for Discord.</b> A <a href="https://github.com/Vendicated/Vencord">Vencord</a>-based client mod with a built-in AI assistant – chat, translate, catch up, voice messages and a server builder.</p>

---

## Community

- Support Discord: [discord.gg/veya-ai](https://discord.gg/veya-ai)
- Instagram: [@veya_ai_](https://www.instagram.com/veya_ai_/)
- TikTok: [@veya_ai_](https://www.tiktok.com/@veya_ai_)

## Features

- **AI chat** – open it from the VEYA button next to the emoji picker or the small VEYA logo in the top-right corner. It reads the open channel, streams answers live, renders Discord markdown and can be dragged and resized.
- **Message actions** – right-click any message to translate it, explain it, get a reply suggestion, explain an image, copy text out of an image or transcribe a voice message.
- **Channel summaries** – the latest messages of a channel as a short bullet list.
- **Catch up** – "What did I miss?" summarises everything that arrived since you last read a channel.
- **Reminders** – right-click a message → remind me later; a notification jumps right back to it.
- **Live translation** – optional translations under foreign-language messages.
- **Writing helper** – fix, shorten, soften or translate your draft right in the message box.
- **Server builder** – right-click your server, describe it, and VEYA creates roles, categories, channels, welcome texts and optionally a logo and banner (only adds, never deletes).
- **Server analysis** – activity stats, top channels and members, embeds and bots plus an AI report with suggestions.
- **Server knowledge, personas & game companion** – teach VEYA your server rules, pick a personality, and get tips for the game you are playing.
- **Progress bar** – long tasks show their progress at the top of Discord.
- **VEYA Motion** – optional smooth animations across Discord.
- **Themes & plugins** – handled by Vencord itself (Settings → Vencord).
- **8 AI providers** – Claude, ChatGPT, Gemini, DeepSeek, Grok, Mistral, Groq and OpenRouter (hundreds of models with one key).
- **Automatic model selection** – VEYA loads the live model list of your provider, picks the best one and switches to the next working model by itself if one is removed, overloaded or rate-limited.
- **Secure key storage** – API keys are encrypted with Windows' built-in encryption and never leave Discord's main process.

---

## Installation (Windows)

**[Download the latest VEYA-AI-Setup.exe](https://github.com/getveya/VEYA-AI/releases/latest)** from the Releases page.

1. Run `VEYA-AI-Setup-<version>.exe` – **no admin rights and no Node.js required**.
2. Optionally enter your API keys, pick your Discord version and click **Install**.
3. Discord restarts – the VEYA button sits next to the emoji picker.

Open **VEYA-AI** from the Start menu or desktop at any time to:

- **Repair** – if VEYA is missing after a Discord update (normally fixed automatically).
- **Update / reinstall**
- **Uninstall** – also available under Windows Settings → Apps.

> If regular Vencord is installed, VEYA replaces it. Your Vencord settings are kept.

---

## API keys & models

| Provider | Get a key | Free tier | Images | Voice messages |
|----------|-----------|:---------:|:------:|:--------------:|
| **Claude** | [console.anthropic.com](https://console.anthropic.com/settings/keys) | – | ✓ | – |
| ChatGPT | [platform.openai.com](https://platform.openai.com/api-keys) | – | ✓ | ✓ (Whisper) |
| Gemini | [aistudio.google.com](https://aistudio.google.com/app/apikey) | ✓ | ✓ | ✓ |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | – | – | – |
| Grok (xAI) | [console.x.ai](https://console.x.ai) | – | ✓ | – |
| Mistral | [console.mistral.ai](https://console.mistral.ai/api-keys) | ✓ | ✓ | – |
| Groq | [console.groq.com](https://console.groq.com/keys) | ✓ | – | ✓ (Whisper) |
| OpenRouter | [openrouter.ai](https://openrouter.ai/keys) | some models | ✓ | – |

The model is set to **Auto** by default: VEYA picks the best model your key can use and switches automatically when one stops working.
You can still pick a fixed model from the live list in Discord: **Settings → VEYA → AI & Settings** (with *Test* and *Find working model* buttons).
If the active provider can't handle images or voice messages, VEYA uses another provider you have a key for.

---

## License

GPL-3.0 – based on [Vencord](https://github.com/Vendicated/Vencord) by Vendicated and contributors.

> Client mods violate Discord's Terms of Service. Use at your own risk.
