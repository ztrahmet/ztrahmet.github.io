---
title: Optimizing Static Web Generators for Scale
publisher: IEEE Software Engineering Journal
date: 2023-11
link:
  - label: DOI
    url: https://doi.org/10.1000/182
image: /images/publications/opt-ssg.png
logo: /images/organizations/ieee.svg
authors:
  - Name Surname
  - Jane Doe
description: Benchmark study examining AST caching, incremental compilation and memory bounds across five static site generators at up to 100,000 documents.
skills:
  - Compilers
  - Performance
  - Web Engineering
---

## Abstract

We benchmark five widely used static site generators across corpora ranging from $10^2$ to
$10^5$ markdown documents, and identify the three bottlenecks that determine whether a
generator remains usable at scale: repeated parsing, unbounded intermediate representation
growth, and a link resolution pass that is quadratic in the number of cross references.

## Method

Each generator built the same corpus five times after two warm-up runs. We report the median
wall clock time and peak resident set size. Corpora were generated from a fixed distribution
of document lengths, with mean $\mu = 1{,}240$ words and standard deviation
$\sigma = 890$ words, matched to a sample of real documentation sites.

Build time was modelled as

$$
T(n) = \alpha n + \beta n \log n + \gamma n^{2}
$$

and the coefficients fitted per generator. A non-zero $\gamma$ is the signature of a link
resolution pass that compares every reference against every page, and it is the difference
between a generator that scales and one that does not.

## Findings

Three of the five generators showed a statistically significant $\gamma$ term. For those, the
crossover where the quadratic term dominates the linear one is

$$
n^{*} = \frac{\alpha}{\gamma}
$$

which for the worst case measured is $n^{*} \approx 6{,}400$ documents, well inside the range
real projects reach.

| Generator | $\alpha$ (ms/doc) | $\gamma$ (µs/doc²) | Peak RSS at $n = 10^5$ |
|---|---:|---:|---:|
| A | 0.91 | 0.00 | 1.4 GB |
| B | 1.34 | 0.00 | 2.9 GB |
| C | 0.77 | 0.21 | 6.1 GB |
| D | 2.10 | 0.04 | 1.1 GB |
| E | 1.02 | 0.33 | out of memory |

Memory was the harder failure. Generator E held every parsed AST for the whole build, and
peak usage grew as

$$
M(n) = n \cdot \lVert \text{ast} \rVert \approx 40\,n \cdot \lVert \text{source} \rVert
$$

which exhausted a 32 GB machine before the corpus did.

## Recommendations

1. Cache parsed ASTs keyed by content hash, not by path or modification time.
2. Build an index for cross references rather than scanning. This removes $\gamma$ entirely.
3. Bound the intermediate representation. Serialise to disk and page back in.

The full harness and corpora are available at the DOI above.
