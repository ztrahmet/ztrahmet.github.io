# Content

Everything you publish lives in `content/`. It holds data only. No markup, no logic, no
presentation decisions. The engine reads it, validates it, and hands the result to the theme.

```
content/
  data.yaml              site and profile
  content.yaml           what exists in each collection
  blog/<slug>/index.md   long form entries
  <any folder>/          assets, published at a matching URL
```

Both YAML files start with a schema comment so editors validate as you type:

```yaml
# yaml-language-server: $schema=../engine/schemas/data.schema.json
```

## data.yaml

Two blocks, `site` and `profile`. Both are required.

```yaml
site:
  url: https://username.github.io      # required
  title: Portfolio                     # required
  description: Engineer, work and writing.   # required
  lang: en
  locale: en_US
  favicon: /images/favicon.svg
  share_image: /images/share.png

profile:
  name: Name Surname                   # required
  handle: username                     # required
  role: Software Engineer              # required
  avatar: /images/avatar.svg
  location: San Francisco, CA
  summary: >-
    Short paragraph about you.
  resume: /documents/resume.pdf
  social:
    - label: GitHub
      url: https://github.com/username
    - label: Email
      url: mailto:you@example.com
      icon: gmail
  experience:
    - title: Software Engineer         # required
      organization: Example Corp       # required
      start: 2022-01                   # required
      end: present                     # required
      logo: /images/organizations/example.svg
      url: https://example.com
      type: full-time
      location: San Francisco, CA
      modality: in-person
      description: |-
        What you did there.
      skills: [JavaScript, React]
  education:
    - title: B.Sc. Computer Engineering
      organization: University of Example
      start: 2018-09
      end: 2022-06
      type: bachelor
      grade: 3.64 GPA
```

`experience` and `education` take the same shape, except education adds `grade` and uses
degree types instead of employment types.

Closed vocabularies:

| Field | Values |
|---|---|
| `type` on experience | `full-time` `part-time` `contract` `freelance` `internship` `volunteer` |
| `type` on education | `bachelor` `master` `doctorate` `associate` `bootcamp` `certificate` |
| `modality` | `in-person` `hybrid` `remote` |

Anything outside these fails the build. That is deliberate, since a typo in an enum is
easier to catch now than to spot on a rendered page.

## content.yaml

Declares what exists in each of the five collections, and which entries are pinned.

```yaml
pinned_content:
  - blog:how-to-sign-commits
  - project:open-source-engine

blog:
  - slug: how-to-sign-commits          # metadata comes from the markdown file
  - slug: why-static-wins              # metadata declared inline, no markdown file
    title: Why Static Site Generators Win
    date: 2023-08-15
    description: |-
      One paragraph summary.
    skills: [Web Development, Architecture]
```

### Two ways to declare an entry

An entry is either markdown driven or inline.

**Markdown driven.** List the slug and nothing else. Everything comes from the frontmatter
of `content/<collection>/<slug>/index.md`. Use this when the entry has a body worth reading.

```markdown
---
title: How to Sign Commits with GPG
date: 2023-09-01
description: Setting up GPG keys and signing commits.
image: /images/blogs/gpg.png
skills: [Git, Security]
---

# How to Sign Commits with GPG

Body goes here.
```

**Inline.** Put the metadata straight in `content.yaml` and skip the markdown file. Use this
for entries with no body, like a certificate or an award.

Frontmatter always wins. If a slug has a markdown file, anything you also declare inline for
it in `content.yaml` is ignored.

### Order

Entries listed in `content.yaml` keep their declared order during synthesis, then the whole
collection is sorted newest first. Markdown files you never declared are picked up anyway and
sorted in with the rest, so you can drop a post in and it appears.

Ongoing entries (`end: present`) rank above finished ones. Pinned content is the exception,
it stays in the order you wrote it, because that is a curation choice.

### Required fields per collection

| Collection | Required | Also accepts |
|---|---|---|
| `blog` | `slug` `title` `date` | `url` `image` `description` `skills` |
| `project` | `slug` `title` `start` | `end` `url` `repository` `image` `description` `skills` |
| `publication` | `slug` `title` `publisher` `date` | `url` `image` `authors` `description` `skills` |
| `certificate` | `slug` `title` `issuer` `date` | `expires` `url` `credential_id` `image` `skills` |
| `award` | `slug` `title` `issuer` `date` | `url` `image` `description` `skills` |

Required means required after synthesis. A markdown entry satisfies them through frontmatter,
an inline entry through `content.yaml`.

## Dates

Write `2023`, `2023-05`, or `2023-05-15`. Use `present` for `end` on anything still running.

Partial dates are fine and sort correctly against full ones. You do not need to invent a day
you do not remember.

## Assets

Two ways to reference a file, both resolve to a URL that matches where you put it.

Root relative, for anything shared:

```yaml
image: /images/blogs/cover.png     # content/images/blogs/cover.png
```

Co-located, for files that belong to one entry:

```yaml
image: ./cover.png                 # content/blog/my-post/cover.png
```

Folder names are up to you. Any directory in `content/` that is not a collection is published
under its own name, so `content/images/` and `content/pictures/` behave identically. Nesting is
fine too. There is no required folder and nothing special about the name `images`.

```
content/pictures/logo.png     ->  /pictures/logo.png
content/static/css/site.css   ->  /static/css/site.css
content/downloads/cv.pdf      ->  /downloads/cv.pdf
```

Files sitting next to a markdown entry are published alongside it, so
`content/blog/my-post/cover.png` is served at `/blog/my-post/cover.png`.

Loose files at the top of `content/` are published to the site root, which is how you add a
`CNAME` or a `favicon.ico`. The engine never publishes its own source, so `data.yaml`,
`content.yaml` and any `.md`, `.yml` or `.json` are left out.

Any asset can be a light and dark pair:

```yaml
avatar:
  light: /images/avatar-light.svg
  dark: /images/avatar-dark.svg
```

Social icons accept a plain name (`github`, `gmail`) as well as a path or URL.

A missing asset warns but does not stop the build, so you can write first and add images later.

Adding a file to an existing folder is picked up by the dev server. Adding the very first file
to a brand new folder next to a markdown entry needs a restart, because that mapping is
registered when the server starts.

## Skills

Free text, on any entry and on profile history. They drive the skills index and the related
content suggestions.

Case does not matter for grouping. `Node.js` and `node.js` are one skill, displayed using the
first spelling the engine sees. `C`, `C++` and `C#` stay separate.

## When it breaks

Validation runs before anything is written, and errors name the file and the field:

```
[Schema Validation Failed] in content.yaml [blog -> slug: 'my-post']:
  • at 'root': Missing required property 'title'
```

Run `npm run validate` to check without building.

Two mistakes fail the build on purpose. Declaring the same slug twice in one collection, and
having both `blog/my-post/index.md` and `blog/my-post.md` resolve to the same slug. Both would
otherwise produce two entries at one URL.
