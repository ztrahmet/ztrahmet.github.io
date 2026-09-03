---
title: Schemas That Fail Loudly
date: 2026-02-09
description: A defence of closed vocabularies, additionalProperties false, and errors that name the field. Written after one typo cost an afternoon.
image: /images/blogs/schemas.png
skills:
  - Schema Design
  - JSON Schema
  - Developer Experience
  - YAML
---

I lost an afternoon to `modality: onsite`. The schema allowed `in-person`, `hybrid` and
`remote`. It did not allow `onsite`, but it also did not *reject* it. The key was simply
ignored, the page rendered with a blank field, and I went looking for the bug in the
template layer where it certainly was not.

## Silence is the bug

There are three ways a system can respond to a key it does not understand.

- **Ignore it.** The default in most YAML and JSON pipelines. Cheapest to implement and the
  most expensive to debug.
- **Warn about it.** Better, until warnings scroll past in CI and everyone learns to ignore
  them.
- **Refuse to build.** Loud, occasionally annoying, and the only one that actually works.

> A validation error is a message from the past version of you who knew what the field was
> called. Do not silence it.

## Closing the vocabulary

Two lines do most of the work:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "organization", "start", "end"],
  "properties": {
    "modality": { "enum": ["in-person", "hybrid", "remote"] }
  }
}
```

`additionalProperties: false` catches the misspelled key. The `enum` catches the misspelled
*value*. You need both, because they fail differently:

| Mistake | Caught by | Message you want |
|---|---|---|
| `modallity: remote` | `additionalProperties` | unknown property `modallity` |
| `modality: onsite` | `enum` | `onsite` is not one of in-person, hybrid, remote |
| missing `start` | `required` | missing required property `start` |
| `start: yesterday` | `pattern` | does not match `YYYY[-MM[-DD]]` |

## Two layers, not one

The subtlety is *when* to check. A declaration file often carries only a reference, with the
real fields living elsewhere:

```yaml
blog:
  - slug: how-to-sign-commits     # everything else comes from the markdown
  - slug: why-static-wins         # everything declared right here
    title: Why Static Site Generators Win
    date: 2023-08-15
```

So the declaration schema can only require `slug`. The full field set is not knowable until
the markdown and the YAML have been merged. That means two passes:

1. Validate the declaration. Is this a well formed reference?
   - only `slug` is required
   - unknown keys still rejected
2. Validate the synthesised entry. Is this a complete, publishable thing?
   - every required field present
   - every enum value legal
   - dates parse

Skipping the second pass is the common mistake. It is the only one that knows whether an
entry is actually finished.

## Make the message do the work

Ajv's raw output is accurate and nearly unreadable. It is worth the fifty lines to rewrite
it into something that names the file, the entry and the field:

```
[Schema Validation Failed] in content.yaml [blog -> slug: 'my-post']:
  • at 'root': Missing required property 'title'
```

Compare that with `data/blog/3 must have required property 'title'`. Same information,
~~roughly~~ entirely different experience. The first one tells you which file to open.

Related reading: the [JSON Schema specification](https://json-schema.org/specification) is
drier than it needs to be but the `$defs` and `$ref` sections repay the effort.
