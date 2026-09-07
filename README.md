# Portfolio Engine

A fast, schema-validated, data-driven portfolio generator built on Eleventy.

```mermaid
flowchart LR
  Content["content/ (Pure Data)"] --> Engine["engine/ (Compiler)"] --> Theme["theme/ (Presentation)"]
```

## Quick Start

```bash
npm install
npm run dev         # Start local server with hot reloading
npm run build       # Compile static site to _site/
npm run validate    # Dry-run validation of content and schemas
npm test            # Run Vitest test suite
```

### Custom Content Repository

To build against an external or private content repository:

```bash
npm run dev -- --content ../site-content
npm run build -- --content ../site-content
```

## Documentation

- [**Content Guide**](docs/content.md) — How to manage site data (`data.yaml`, `content.yaml`), structure collections, handle assets and links, and configure automated GitHub Pages deployment from a private content repository.
- [**Engine & Theme Guide**](docs/engine.md) — Architecture overview, build pipeline lifecycle, global data surfaces, template filters, and instructions for authoring custom themes.
