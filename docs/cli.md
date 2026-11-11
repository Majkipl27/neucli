# The neucli CLI

```bash
neucli generate site.yaml -o ./my-site
```

Run it as often as you like. Each run rewrites what neucli owns and leaves the rest of the project alone.

## Who owns what

| Path | Owner | What happens on `generate` |
|---|---|---|
| `src/neucli/**` (pages, components, primitives, hooks, `App.tsx`, `theme.css`) | neucli | Rewritten to match the config. Tracked in the manifest. |
| `index.html` | neucli | Rewritten (title, language, favicon, fonts come from the config). Tracked. |
| `package.json` | shared | Merged, see below. |
| `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/custom/README.md` | you | Written once when missing, never again. |
| `src/custom/**` and everything else | you | Never written, changed or deleted. A missing `file:` component gets a starter file once. |
| `.neucli/manifest.json`, `.neucli/config.lock.yaml` | neucli | Bookkeeping. Commit them with the project. |

Put your own CSS in `src/index.css` (it imports Tailwind and `./neucli/theme.css`), your own components in `src/custom/`, and plug them in with [`file:` components](format.md#your-own-components-file).

## The manifest

`.neucli/manifest.json` lists every file neucli wrote with a sha256 of its content. That's how a run knows what it may touch:

- **A generated file you edited** (its content no longer matches the hash) is skipped with a warning instead of overwritten. It stays flagged on later runs until you regenerate it with `--force` or undo the edit. Move the change into the config or `src/custom/` instead.
- **A generated file the config no longer produces** is deleted, but only while it still matches its hash. An edited one is kept and flagged; `--force` deletes it.
- **A file that isn't in the manifest** is never overwritten or deleted, even inside `src/neucli/`.
- **A first run into a folder that already has files neucli would write** (say, another project's `index.html`) is refused before anything is written. Pick an empty folder, or pass `--force` to overwrite those files.

## package.json

neucli manages only the dependencies it needs (React, the router when there's more than one page, Vite, Tailwind, TypeScript, and `dependencies:` from the config):

- A needed dependency is added, or updated if its version is still the one neucli wrote last time. If you changed the version, yours stays.
- A dependency neucli added earlier and no longer needs is removed, unless you changed its version.
- Missing `dev`, `build` and `preview` scripts are added. Your scripts, dependencies and other fields are kept as they are.

## Folders from an older neucli

Before the manifest, generated code lived in `src/components`, `src/pages`, `src/primitives` and `src/App.tsx`. neucli recognises such a folder (it has `.neucli/config.lock.yaml` but no manifest) and stops with an explanation. `--migrate` then:

- deletes the old generated files (`src/components/*.tsx`, `src/pages/*.tsx`, `src/primitives/*`, `src/App.tsx`, `src/ScrollToHash.tsx`, `src/hooks/useSEO.ts`, and v0's `tailwind.config.js` / `postcss.config.js`);
- replaces the old root files (`index.html`, `src/main.tsx`, `src/index.css`, `vite.config.ts`, the tsconfigs) with today's;
- updates neucli's dependencies in `package.json` and keeps yours;
- leaves every other file alone.

## Options

| Flag | Effect |
|---|---|
| `-o, --output <dir>` | Where the project goes (default `./output`). |
| `--force` | Overwrite or delete generated files you edited, and overwrite files neucli didn't write. Files neucli never wrote are still never deleted. |
| `--migrate` | Switch a folder from an older neucli to the `src/neucli/` layout. |
| `--keep-stale` | Keep generated files the config no longer produces. |
| `--allow-edited` | Exit with 0 even when edited files were skipped. |

## Output and exit codes

Every run lists what it did: `+` new, `~` rewritten, `*` created for you, `✗` removed, `!` skipped because you edited it. Then a summary such as `3 written, 1 skipped (edited by hand), 41 unchanged`.

| Code | Meaning |
|---|---|
| 0 | Done. |
| 1 | Nothing was written: the config is invalid, files neucli doesn't own are in the way, or the folder needs `--migrate`. |
| 2 | Generated, but some edited files were skipped (use `--allow-edited` to get 0, for example in CI where that's expected). |
