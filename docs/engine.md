# Engine

The engine turns `content/` into a single validated data tree, then hands that tree to
Eleventy so the theme can render it. It knows nothing about markup.

```
content/  ->  engine/  ->  theme/
  data        compiler     presentation
```

The rule that keeps this working: the engine never imports from the theme, and the theme never
reads `content/` directly. Everything crosses that boundary as data.

## Commands

```bash
npm run dev         # local server with live reload
npm run build       # write the static site to _site
npm run validate    # check content, synthesize, print a summary, write nothing
npm test            # run the test suite
```

All three accept a different content directory, which is how you test a theme against someone
else's content:

```bash
npm run build -- ./other-content
npm run build -- --output dist --content ./other-content
npm run dev -- --port 3000
```

## What happens on a build

`loadEngineData()` runs the whole pipeline in order and returns one object.

1. **Read** `data.yaml` and `content.yaml`.
2. **Validate** both against JSON Schema. Errors stop here, before anything is written.
3. **Normalize assets.** Paths resolve to real URLs, light and dark pairs are kept, missing
   files warn. Asset folders can be named anything, since the engine publishes any
   non-collection directory under its own name. The theme's own directories are published
   the same way, so a theme can ship its fonts without putting them in `content/`.
4. **Synthesize collections.** Markdown files and inline declarations merge into one list per
   collection. Each entry gets rendered HTML, a table of contents, reading time, an excerpt,
   display dates, SEO metadata, prev and next pointers, and related entries.
5. **Resolve pinned content.** A broken reference is a build error, not a blank card.
6. **Build the skills index** across profile history and every collection.
7. **Derive theme views.** Collection registry, combined feed, enriched profile.
8. **Build the search index**, also written to `_site/search-index.json`.

The result is compiled once per build and reused by every template. During `dev` the cache
clears on each rebuild, so edits show up immediately.

## Layout

```
engine/
  cli.js               build, dev, validate
  index.js             re-exports everything
  types.d.ts           the data contract the theme codes against
  config/              enums, display labels, paths, date and slug formatting
  schemas/             JSON Schema for data.yaml, content.yaml, and each collection item
  validation/          Ajv setup and readable error messages
  pipeline/            the stages listed above, one concern per file
  search/              search index and plain text extraction
  eleventy/            Eleventy config, global data, filters, passthrough copies
  tests/               Vitest suite
```

## Validation

Two layers, because they answer different questions.

`content.yaml` only needs a `slug` per entry, since the rest may live in a markdown file.
After synthesis, each entry is checked against its collection schema, where the full field set
is required. That is the point where the engine knows whether an entry is actually complete.

Every schema sets `additionalProperties: false`. An unknown key is an error rather than a
value that silently disappears.

## Markdown

Rendered at build time with markdown-it. Math goes through KaTeX and ships as static HTML, so
no script runs in the browser.

Math uses `$inline$` and `$$block$$`. Currency, shell variables and fenced code are left alone,
so `$50 - $100` and `$HOME` render as written.

Headings get anchor IDs, and the table of contents is derived from the same parse that produces
the HTML. A TOC entry always points at a heading that exists.

## Ordering

`pipeline/ordering.js` holds two comparators over one shared body of rules. In order: entries
with a date rank above those without, then newer primary date, then later end date, then title,
organization and slug.

The last three exist so that two otherwise equal entries always come out in the same order,
whatever the filesystem hands back.

`compareByRecency` adds one step ahead of the date: ongoing entries rank above finished ones.
It answers "what is live", and it is the order every collection is built in.

`compareByDate` leaves that step out, so an entry sits wherever its date puts it. It answers
"what is newest", which is what a list headed Recent and a year grouped archive need. Without
it, a project started in 2021 and still running sorts above a post from this year, and year
headings stop descending.

## Tests

```bash
npm test
npm run test:watch
```

Fixtures live in `engine/tests/fixtures/`, with a valid content directory and a set of
deliberately broken YAML files used to check that validation fails the way it should.
