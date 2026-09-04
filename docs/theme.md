# Themes

A theme is everything in `theme/`. It reads the data the engine prepared and decides how the
site looks. It never touches `content/` and never imports from `engine/`.

Eleventy is already configured, so a theme is just templates:

```
theme/
  _layouts/      layouts
  _includes/     partials
  _data/         theme-only data, optional
  static/        fonts, icons and anything the CSS references
  index.njk      pages
```

Nunjucks is the default for `.njk`, `.html` and `.md`. You can also use `.11ty.js`.

## Theme assets

A theme ships the files its stylesheets reference. Every directory in `theme/`
is published under its own name, so `theme/static/fonts/x.woff2` is served at
`/static/fonts/x.woff2`. Directories Eleventy reserves are prefixed with an
underscore and are never published.

This is what keeps the theme self-contained. Fonts and icons belong to the
presentation layer, not to `content/`, and a theme that keeps them in `theme/`
works unchanged against any content directory.

Theme and content assets share the site root. If a theme directory has the same
name as a content directory, the content one is published, the theme one is
skipped, and the build warns. Rename the theme directory if that happens.


## Smallest working theme

`theme/_layouts/base.njk`

```njk
<!doctype html>
<html lang="{{ site.lang }}">
  <head>
    <meta charset="utf-8">
    <title>{{ title or site.title }}</title>
  </head>
  <body>
    <main>{{ content | safe }}</main>
  </body>
</html>
```

`theme/index.njk`

```njk
---
layout: base.njk
title: Home
---
<h1>{{ profile.name }}</h1>
<p>{{ profile.role }}</p>

{% for post in collections_data.blog %}
  <article>
    <a href="{{ post.permalink }}">{{ post.title }}</a>
    <time datetime="{{ post.dateIso }}">{{ post.dateDisplay }}</time>
  </article>
{% endfor %}
```

`npm run dev` and you have a site.

## Two names to remember

Eleventy reserves `content` and `collections`, so the engine publishes those under different
names.

| You want | Use | Not |
|---|---|---|
| the parsed `content.yaml` | `content_data` | `content`, which is the rendered page inside a layout |
| the synthesized collections | `collections_data` or `collections.blog` | `collections` on its own |

`collections_data.blog` and `collections.blog` hold the same entries. The first is the plain
map, the second is the Eleventy collection, which is what you need for pagination.

## Global data

| Key | What it is |
|---|---|
| `site` | `url` `title` `description` `lang` `locale` `favicon` `share_image` |
| `profile` | identity, `social`, `experience`, `education` |
| `collections_data` | `blog` `project` `publication` `certificate` `award` |
| `collection_types` | one row per collection, for building navigation |
| `all_content` | every entry in one list, newest first |
| `pinned_items` | entries from `pinned_content`, in the declared order |
| `taxonomy` | the skills index |
| `stats` | counts per collection and overall |
| `mappings` | the display label dictionaries behind the label filters |
| `build` | `version` `generatedAt` `generatedYear` `locale` `contentDir` |
| `search_index` | the same data written to `/search-index.json` |
| `content_data` | the raw `content.yaml` |
| `contentDir` | absolute path to the content directory, rarely needed |

Eleventy collections: `blog`, `project`, `publication`, `certificate`, `award`, plus
`all_content` and `pinned`.

## What every entry carries

Enough that most templates need no logic.

| Field | Notes |
|---|---|
| `title` `slug` `collection` `permalink` | `permalink` is the internal route |
| `url` | the external link the author wrote, may be absent |
| `description` `excerpt` | `excerpt` is generated from the body when there is one |
| `html` `content` | rendered HTML, and the raw markdown |
| `toc` | `id` `slug` `text` `level`, always matching a real heading |
| `wordCount` `readingTime` | reading time in minutes |
| `primaryDate` `dateDisplay` `dateIso` `year` | `primaryDate` is `date`, or `start` for projects |
| `startDisplay` `endDisplay` | on entries with a range |
| `isOngoing` | true when `end: present` |
| `isExpired` `expiresDisplay` | certificates with an `expires` date |
| `image` `skills` | `image` may be a light and dark pair |
| `newer` `older` | adjacent entries, or null |
| `related` | up to three suggestions |
| `seo` | `canonicalUrl` `title` `description` `image` `ogType` `publishedTime` `publishedIso` |
| `hasMarkdown` | false for inline entries, so you can skip an empty body |

Use `primaryDate` when you need one date field across collections. Blog posts have `date`,
projects have `start`, and only `primaryDate` is on both.

## Profile

`profile.experience` and `profile.education` carry the same presentation fields as entries:
`dateDisplay`, `startDisplay`, `endDisplay`, `startIso`, `endIso`, `isOngoing`, and `duration`.

```njk
{% for job in profile.experience %}
  <h3>{{ job.title }}, {{ job.organization }}</h3>
  <p>{{ job.dateDisplay }} ({{ job.duration.text }})</p>
  <p>{{ job.type | employmentTypeLabel }}, {{ job.modality | modalityLabel("experience") }}</p>
{% endfor %}
```

`duration` is `{ months, years, remainingMonths, text }` where text reads "2 yrs 3 mos".
Current roles sort first.

`dateDisplay` writes an open range as "Jan 2022 – Present", and that word is English. For a
site in another language, build the range yourself, which is what `isOngoing` is for:

```njk
{{ job.startDisplay }} – {% if job.isOngoing %}Heute{% else %}{{ job.endDisplay }}{% endif %}
```

## Filters

| Filter | Use |
|---|---|
| `formatDate(locale?)` | `2023-05-15` becomes `May 15, 2023` |
| `dateRange(end, locale?)` | `Jan 2022 – Present` |
| `isoDate` | full ISO date for `<time datetime>` |
| `rfc822Date` | RSS `pubDate` |
| `duration(end)` | `2 yrs 3 mos` |
| `markdown` | render a string as a block |
| `markdownInline` | render without the wrapping paragraph |
| `absoluteUrl(siteUrl)` | one path to an absolute URL |
| `absoluteUrls(siteUrl, pagePath)` | rewrite links inside HTML to absolute, for feeds. Root relative paths resolve against the site, document relative ones such as `./cover.png` against `pagePath` |
| `slugify` | URL safe slug, handles accents and `C++` |
| `inlineSvg` | an SVG asset path to its markup, for inlining |
| `inlineThemedSvg(baseDir)` | inline the `currentColor` SVGs in a rendered body so they follow the theme |
| `limit(n)` | first n items |
| `where(key, value)` | keep matching items |
| `whereNot(key, value)` | drop matching items |
| `sortBy(key, desc?)` | sort by a property |
| `byRecency` | the engine's own ordering, ongoing first |
| `byDate` | ordering by date alone, ignoring ongoing state |
| `modalityLabel(context)` | `in-person` becomes On-site, or On-campus for education |
| `employmentTypeLabel` `degreeTypeLabel` | `full-time` becomes Full-time |
| `collectionLabel(plural?)` | `blog` becomes Blog or Blog Post |

`limit`, `where` and `sortBy` exist because Nunjucks cannot do them. Its `selectattr` only
tests truthiness, and its `slice` splits a list into chunks instead of taking the first n.

## Patterns

**Navigation without hardcoding collections**

```njk
<nav>
  {% for c in collection_types %}
    {% if c.hasItems %}<a href="{{ c.permalink }}">{{ c.labelPlural }}</a>{% endif %}
  {% endfor %}
</nav>
```

**Archive grouped by year**

```njk
{% for year, posts in collections_data.blog | groupby("year") %}
  <h2>{{ year }}</h2>
  {% for p in posts %}<a href="{{ p.permalink }}">{{ p.title }}</a>{% endfor %}
{% endfor %}
```

**One page per entry**

```njk
---
pagination:
  data: collections.blog
  size: 1
  alias: post
permalink: "{{ post.permalink }}"
layout: base.njk
---
<h1>{{ post.title }}</h1>
{{ post.html | safe }}

{% if post.older %}<a href="{{ post.older.permalink }}">{{ post.older.title }}</a>{% endif %}
```

**Skill pages**

```njk
---
pagination:
  data: taxonomy.allSkills
  size: 1
  alias: skill
permalink: "/skills/{{ skill.slug }}/"
---
<h1>{{ skill.name }} ({{ skill.count }})</h1>
{% for item in skill.items %}
  <a href="{{ item.permalink }}">{{ item.title }}</a>
{% endfor %}
```

Lists arrive in `byRecency` order, which puts ongoing entries first because that answers
"what am I working on". A list headed "Recent", or one grouped into year headings, is asking
a different question and needs `byDate`, or an old project that is still running will sit
above this year's posts.

`skill.permalink` on a reference points at the entry, or at `/cv/#experience` and
`/cv/#education` for profile history. A theme that moves those sections must keep the
matching ids, or change `PROFILE_ANCHORS` in `engine/config/enums.js`.
`skill.url` is the external link, when there is one, and `skill.logo` is the entry's mark.

**Latest across everything**

```njk
{% for item in all_content | limit(5) %}
  <a href="{{ item.permalink }}">{{ item.title }}</a>
  <span>{{ item.collection | collectionLabel(false) }}</span>
{% endfor %}
```

**RSS**

```njk
---
permalink: /feed.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>{{ site.title }}</title>
  <link>{{ site.url }}</link>
  {%- for item in all_content | limit(20) %}
  <item>
    <title>{{ item.title }}</title>
    <link>{{ item.permalink | absoluteUrl(site.url) }}</link>
    <pubDate>{{ item.primaryDate | rfc822Date }}</pubDate>
    <description>{{ item.excerpt }}</description>
  </item>
  {%- endfor %}
</channel></rss>
```

**Head metadata**

```njk
<link rel="canonical" href="{{ post.seo.canonicalUrl }}">
<meta property="og:type" content="{{ post.seo.ogType }}">
<meta property="og:image" content="{{ post.seo.image }}">
{% if post.seo.publishedIso %}
  <meta property="article:published_time" content="{{ post.seo.publishedIso }}">
{% endif %}
```

**Search**

`/search-index.json` is written on every build. Fetch it and filter client side, or pass
`search_index` straight into a template. Each record has `title`, `subtitle`, `description`,
`content` as plain text, `skills`, `permalink` and `typeLabel`.

## Colouring an asset

An SVG referenced by `<img>` is a separate document, so `currentColor` inside it
never sees the page and the asset keeps whatever colours it was drawn with. Pass
the path through `inlineSvg` to put the markup in the page instead, and a file
drawn with `currentColor` then takes the colour it inherits:

```njk
{% set svg = profile.avatar | inlineSvg %}
{% if svg %}<span class="avatar">{{ svg | safe }}</span>
{% else %}<img src="{{ profile.avatar }}" alt="">{% endif %}
```

```css
.avatar { color: var(--ink-2); }
```

The filter returns an empty string for anything that is not a readable SVG, so
the fallback covers raster images and external URLs. Scripts and event handlers
are stripped from the markup.

An asset drawn with fixed colours is unaffected by inlining, which is how a light
and dark pair keeps working.

## Light and dark assets

Any asset may be a string or a `{ light, dark }` pair, so check before printing:

```njk
{% if profile.avatar.light %}
  <img src="{{ profile.avatar.light }}" class="light-only">
  <img src="{{ profile.avatar.dark }}" class="dark-only">
{% else %}
  <img src="{{ profile.avatar }}">
{% endif %}
```

## Empty states

Content is optional, so guard anything that might be missing. `stats` and `collection_types`
tell you what exists before you render a heading for it.

```njk
{% if stats.collections.publication.total %}
  <h2>Publications</h2>
{% endif %}
```

## Rendered bodies

`entry.html` is markdown output, so a theme has to style what markdown can produce, not only
what the sample content happens to use: headings down to `h6`, loose lists whose items hold
their own paragraphs, definition lists, `figure` and `figcaption`, `details`, `kbd`, `mark`,
`abbr`, and KaTeX. Anything left unstyled falls back to browser defaults, which ignore the
palette, and `h4` in particular comes out larger than the `h3` above it.

Two of those need somewhere to scroll or they crop: `.table-scroll`, which the engine wraps
every table in, and `.katex-display`. Give both `overflow-x: auto`, and set it back to
`visible` in print, because paper does not scroll.

Fenced code arrives already highlighted, as `hljs-` class names carrying no colour of their own.
The theme owns that palette. This one maps the classes to `--syn-*` tokens declared per scheme,
so code follows light and dark like everything else.

## Controls

Anything clickable that is not running text uses `.btn`: the adjacent entries, an entry's
external destinations, the CV actions, back to top. It is square like the rest of the page and
presses in by `--press` rather than lighting up, so the feedback is physical. `.btn--out` marks
a link that leaves the site, `.btn--back` one that goes backwards, and `.btn--key` the single
action a page actually wants taken. Each moves its arrow in the direction it travels.

`.dither` lays an ordered pixel pattern behind an element and fades it out along the run. It is
deliberately used once, on the one key action, because a texture that appears everywhere stops
drawing attention to anything.

## Controls that need a script

The document ships with `class="no-js"` on `<html>`, and a small inline script in the head
removes it before the first paint. Anything that cannot work without a script — the scheme
switch, the shortcut hint, the print action, back to top — is written in the markup and removed
by CSS under `.no-js`.

Do it this way round. Marking those controls `hidden` and revealing them from the deferred
script also works, but they then arrive after the page has been painted and push what is already
on screen. The same script sets `is-mac`, which is how the shortcut hint picks between its two
labels without either being written in later.

## Motion

Page changes use cross-document view transitions. `.rail` is the only element with a
`view-transition-name`, so it is the one thing the browser carries across: it keeps the same
element and slides it, which it has reason to do because a page with a margin column uses the
wider shell. Everything else is the root snapshot, and it cross-fades.

Name only what genuinely persists. A named element whose box differs between pages gets
interpolated between the two, and that movement is visible: naming `.main` scaled the content
from 760 to 984 and read as a zoom, and naming `.page__body` interpolated its height and read as
the page scrolling itself. A cross-fade has no geometry to get wrong.

## Print

The printed CV is a different document from the screen one, because it has to survive an
applicant tracking system: those read the PDF's text layer and nothing else. The print block
rebuilds the page rather than restyling it.

- **One column.** The screen CV puts dates in a rail beside each record. A parser that
  reconstructs by geometry sees two columns and interleaves them, so print puts the date on the
  title's line instead.
- **Standard families.** The web fonts embed as Type 3, a procedural format several parsers read
  badly. Arial and Helvetica embed as CID TrueType with a usable unicode map.
- **Section names a parser searches for**: Summary, Skills, Experience, Education, Publications,
  Projects, Certifications, Awards. Two of those, Summary and Skills, exist only on paper.
- **Nothing meaningful is a graphic.** Marks and the timeline spine are dropped.

Two traps to know about when adding to this block. `rem` resolves against the root, not the
body, so anything left in `rem` keeps its screen size however small the body is set. And any
screen rule with higher specificity wins here too: `.rows:has(.mark) .row__link` and
`.record__org a` both had to be named explicitly before print could restyle them.

## Contract

`engine/types.d.ts` is the full typed contract. It is kept in sync with what the engine
actually returns, so when a field name is unclear, read that file rather than guessing.
