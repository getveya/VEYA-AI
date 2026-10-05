# VEYA Community Store

Community plugins and themes for [VEYA-AI](https://github.com/getveya/VEYA-AI). Everything listed here appears in Discord under **Settings → VEYA-AI → Online Store**.

## Structure

- `index.json` – the list of all entries
- `plugins/*.veya.json`, `themes/*.veya.json` – the packages (exactly as VEYA exports them)

Every entry in `index.json`:

| Field | Required | Meaning |
|-------|----------|---------|
| `type` | yes | `plugin` or `theme` |
| `id` | yes | unique ID, same as inside the package |
| `name` | yes | display name |
| `url` | yes | path to the package – relative to `index.json` or a full https URL |
| `description`, `author`, `version`, `tags` | no | shown in the store |

## Submitting

1. Export your plugin or theme in VEYA (**Export** button).
2. Open a pull request that adds the `.veya.json` file to `plugins/` or `themes/` and an entry to `index.json`.

Every submitted plugin is reviewed before it is accepted. Plugins must not access tokens, load remote code, obfuscate their code or send data to third parties.

> Content in this store comes from the community. VEYA asks every user to review and approve a plugin before it runs.
