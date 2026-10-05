# VEYA-AI Plugin Guide

How to build your own plugins and themes and share them with others.

---

## Creating a plugin

In Discord go to **Settings → VEYA-AI → New Plugin**.

### Write it yourself

```js
// VEYA-AI community plugin
// Available API: VEYA.ai, VEYA.storage, VEYA.utils

module.exports = {
  // Called when the plugin is enabled
  onLoad: async () => {
    console.log("My plugin is running!");

    // Ask the AI
    const answer = await VEYA.ai.ask("Give me a fun fact.");
    console.log("AI says:", answer);

    // Store something
    VEYA.storage.set("myValue", { test: true });
  },

  // Called when the plugin is disabled (optional)
  onUnload: () => {
    console.log("Plugin disabled.");
  },
};
```

### Let the AI write it

Describe what the plugin should do and click **Generate**. Always read the generated code before saving it.

---

## The VEYA API

### `VEYA.ai` – AI functions

```js
// Simple question
const answer = await VEYA.ai.ask("What is 2+2?");

// With a system prompt
const answer = await VEYA.ai.ask("Translate: Hallo", "You are a translator.");

// Conversation with history
const answer = await VEYA.ai.chat([
  { role: "system", content: "You are an assistant." },
  { role: "user", content: "Hi!" },
  { role: "assistant", content: "Hi! How can I help?" },
  { role: "user", content: "What is Discord?" },
]);

// Active provider
const provider = VEYA.ai.getProvider(); // "claude" | "openai" | "gemini" | "deepseek"
```

### `VEYA.storage` – local storage

```js
VEYA.storage.set("myKey", { data: "here" });   // save
const value = VEYA.storage.get("myKey");        // read (null if missing)
VEYA.storage.delete("myKey");                   // delete
```

### `VEYA.utils` – helpers

```js
const userId = VEYA.utils.getUserId();           // your Discord user ID
const date = VEYA.utils.formatDate(Date.now());  // formatted date
```

---

## Security review

Plugins that you did not write yourself (imported, from the store, AI-generated, examples) do not start until you
approve them. VEYA shows the code and highlights risky lines, for example:

- access to your login token
- code that is loaded or generated at runtime (`eval`, `new Function`, `import()`)
- obfuscated code
- network requests, `localStorage`, `innerHTML`

Avoid these in your own plugins – otherwise other users will see warnings.

---

## Sharing plugins and themes

1. In the **Plugins** or **Themes** tab click **Export**.
2. A `.veya.json` file is downloaded.
3. Send the file to your friends.
4. They import it in the **Import** tab (drag & drop works).

Or submit it to the [online store](https://github.com/getveya/veya-store) so everyone can find it.

---

## Examples

The `examples/` folder contains ready-made packages:

- `example-plugin-ai-status.veya.json` – an AI quote of the day
- `example-theme-dark-neon.veya.json` – a dark neon theme

---

## Creating a theme

Go to **Settings → VEYA-AI → New Theme**.

```css
/* Override Discord's CSS variables */
:root, .theme-dark, .visual-refresh {
  --background-primary: #12140f;   /* main background */
  --background-secondary: #0d0f0b; /* sidebar */
  --brand-500: #ccff00;            /* accent colour */
  --text-normal: #e2e7d8;          /* normal text */
  --header-primary: #ffffff;       /* headings */
}
```

Or describe a theme, click **Generate**, try it with **Test live in Discord** and **Save** it.
