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

### Example Configuration

```yaml
meta:
  name: My Project
  lang: en

theme:
  colors:
    primary: "#6366f1"
  fonts:
    heading: "Inter"

pages:
  - path: /
    name: Home
    title: Welcome to Neucli
    sections:
      - type: hero
        props:
          title: Build faster than ever.
          subtitle: From YAML to Production.
```

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

Open sourced under the GNU GPL License.
