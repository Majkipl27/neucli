# neucli

Generate high-performance React + TypeScript + Tailwind CSS applications from a simple YAML configuration.

## Overview

`neucli` is a developer-centric CLI tool designed to eliminate boilerplate and standardize web development. By defining your application's structure, theme, and logic in a single YAML file, `neucli` scaffolds a production-ready Single Page Application (SPA) that you can build and deploy instantly.

It is built for developers who want the speed of a low-code tool without sacrificing the flexibility of a professional React codebase.

## Key Features

- **Config-Driven Engine**: Map your site structure, global elements, and page sections in clean YAML.
- **Incremental Rebuilds**: Built-in content-hashing engine that tracks changes and only updates modified files, ensuring lightning-fast updates.
- **React Router v7 Integration**: Native support for multi-page applications with high-performance, client-side routing.
- **Persistent Global Layouts**: Navbars and Footers are mounted at the application root, preventing unnecessary re-renders during navigation.
- **Smart Dependency Injection**: The tool analyzes your configuration and only includes required NPM packages (like `react-router-dom`) when your project actually needs them.
- **Custom Logic & State**: Embed React hooks, state, and third-party library imports directly into custom component definitions within your YAML.
- **Built-in SEO Power**: Every generated project includes a custom `useSEO` hook that automatically manages document titles and meta tags as you navigate.
- **Full Theme Control**: Map your brand colors and typography directly to Tailwind CSS configuration via the config file.

## Usage

Generate your project with a single command:

```bash
npx neucli generate example.yaml --output ./my-new-site
```

Run it again whenever the config changes. Generated code lives in `src/neucli/` and is rewritten each time; your own code goes in `src/custom/` (or anywhere else outside `src/neucli/`) and is never touched. A manifest tracks what neucli wrote, so a generated file you edited by hand is skipped with a warning instead of overwritten, and a folder with someone else's files is refused. Your own React components plug in from the config with `file:`.

Flags: `--force` (overwrite edited files), `--migrate` (move a folder from an older neucli to the new layout), `--keep-stale`, `--allow-edited`. Exit code 2 means edited files were skipped. Details in [docs/cli.md](docs/cli.md); the config format is in [docs/format.md](docs/format.md).

### Example Configuration

```yaml
meta:
  name: My Project
  lang: en

theme:
  colors:
    primary: "#6366f1"
  fonts:
    heading: Space Grotesk

pages:
  - path: /
    name: Home
    title: Welcome to Neucli
    sections:
      - type: frame
        tag: section
        layout: { align: center, gap: 16, padding: [96, 24] }
        fill: primary
        color: white
        children:
          - type: text
            tag: h1
            content: Build faster than ever.
            font: { family: heading, size: 48, weight: 700 }
          - type: text
            content: From YAML to React.
```

The full format is in [docs/format.md](docs/format.md). `examples/` has two complete sites.

## Project Status

### What's Ready
- [x] Full CLI generation pipeline.
- [x] Multi-page routing infrastructure (React Router v7).
- [x] Incremental rebuilding and stale file cleanup.
- [x] Custom logic injection and scoped state support.
- [x] SEO hook generation.
- [x] Global layout persistence.

### Roadmap
- [x] **Web CMS**: A visual, browser-based editor for managing configurations.
- [ ] **AppShell Layouts**: Modular sidebar and dashboard layout presets.
- [ ] **Expanded Component Library**: Built-in Accordions, Modals, and Carousels.

## License

MIT. See `LICENSE`.
