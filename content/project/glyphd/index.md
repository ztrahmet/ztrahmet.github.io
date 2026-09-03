---
title: "glyphd: a Font Subsetting Daemon"
start: 2024-08
end: present
url: https://glyphd.example.dev
repository: https://github.com/username/glyphd
image: /images/projects/glyphd.png
logo: /images/projects/glyphd-mark.svg
description: A long-running service that subsets and caches web fonts on demand, so a page ships only the glyphs it actually uses.
skills:
  - Go
  - Typography
  - HTTP
  - Caching
---

Shipping a full Latin font when a page uses forty characters is normal and slightly absurd.
`glyphd` sits in front of a font directory, works out which glyphs a page needs, and serves a
subset built for exactly that request.

## Using it

```bash
# start against a directory of source fonts
glyphd serve --fonts ./fonts --cache /var/cache/glyphd --addr :7000

# ask for a subset covering a specific string
curl 'http://localhost:7000/subset?family=Instrument+Sans&weight=400&text=Hello'
```

The response is a `woff2` with a long-lived `ETag`. The cache key is the tuple of family,
weight, axis positions and the sorted set of code points, so two pages needing the same
glyphs share one file.

## Configuration

```toml
[server]
addr = ":7000"
max_body = "2MiB"

[cache]
dir = "/var/cache/glyphd"
max_size = "512MiB"
eviction = "lru"

[[family]]
name = "Instrument Sans"
file = "InstrumentSans[wght].ttf"
axes = { wght = [400, 700] }
```

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--fonts` | `./fonts` | Directory of source font files |
| `--cache` | `$XDG_CACHE_HOME/glyphd` | Where subsets are written |
| `--addr` | `:7000` | Listen address |
| `--preload` | none | Comma separated families to subset at boot |
| `--strict` | `false` | Fail on a missing glyph instead of substituting |

## How it works

Three stages, of which only the middle one is interesting:

1. Parse the request into a code point set. Ranges are accepted, so `U+0000-00FF` works as
   well as literal text.
2. Subset the font. This delegates to `harfbuzz` through cgo, keeping the glyph closure so
   that ligatures and mark positioning survive.
3. Compress to `woff2` and write through to the cache.

The glyph closure in step two is the part people get wrong when they roll their own. Dropping
a glyph that a ligature or a mark attachment refers to produces a font that renders fine in
your test string and breaks on someone's name.

```go
// Closure expands a code point set to every glyph reachable through
// substitution and positioning tables, so ligatures survive subsetting.
func Closure(face *hb.Face, cps []rune) (glyphs []hb.GlyphID, err error) {
    set := hb.NewSet()
    defer set.Destroy()
    for _, r := range cps {
        set.Add(face.NominalGlyph(r))
    }
    face.CollectGlyphClosure(set)
    return set.Items(), nil
}
```

## Status

Running in production for one site, which is mine. The numbers on that site: a 91 KB Latin
subset became 11 KB for the home page and 19 KB for the longest article. I would not yet
recommend pointing it at anything you cannot restart.
