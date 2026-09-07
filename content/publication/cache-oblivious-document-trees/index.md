---
title: Cache-Oblivious Layout for Document Trees
publisher: ACM Transactions on the Web
date: 2025-06
link:
  - label: DOI
    url: https://doi.org/10.1145/3712000
image: /images/publications/cache-oblivious.png
logo: /images/organizations/acm.svg
authors:
  - Name Surname
  - Jane Doe
  - A. Researcher
description: A layout strategy for document trees that achieves optimal cache behaviour without knowing the cache parameters, with an empirical study over 40 real documentation sites.
skills:
  - Compilers
  - Algorithms
  - Web Performance
  - Research
---

## Abstract

Static site generators traverse a tree of documents once per build, and the order in which
those documents are laid out in memory determines how many cache misses that traversal costs.
We show that a van Emde Boas layout of the document tree achieves an asymptotically optimal
number of memory transfers without the generator knowing the cache line size $B$ or the cache
capacity $M$, and we measure the effect on forty real documentation sites.

## Model

We use the standard two-level ideal cache model. Memory transfers move $B$ contiguous words
between a cache of size $M$ and an unbounded main memory. An algorithm is *cache-oblivious*
when it references neither $B$ nor $M$.

A root-to-leaf traversal of a tree of $n$ nodes laid out naively costs

$$
Q_{\text{naive}}(n) = \Theta(\log n)
$$

memory transfers, because each level of the descent is likely to touch a fresh cache line.
The van Emde Boas layout recursively splits the tree at height $h/2$ and lays out the top
subtree followed by each bottom subtree contiguously, giving

$$
Q_{\text{vEB}}(n) = \Theta\!\left( \log_{B} n \right) = \Theta\!\left( \frac{\log n}{\log B} \right)
$$

which is optimal and, crucially, is achieved without $B$ appearing anywhere in the algorithm.

### Extending to full traversal

A build does not perform one descent; it visits every node. For a full traversal the relevant
bound is the sorting-style term

$$
Q_{\text{scan}}(n) = \Theta\!\left( \frac{n}{B} \log_{M/B} \frac{n}{B} \right)
$$

and the question is whether a document tree is large enough for the logarithmic factor to
matter. For $n < M/B$ it is not, and a simple scan is optimal. We show in Section 4 that the
crossover for typical node sizes sits near $n \approx 34{,}000$ documents.

We write the total build cost as the sum of a per-node term and the transfer term, where
$c_{\text{node}}$ absorbs parsing and rendering:

$$
\begin{aligned}
T(n) &= c_{\text{node}} \cdot n + c_{\text{mem}} \cdot Q(n) \\
     &= c_{\text{node}} \cdot n + c_{\text{mem}} \cdot \Theta\!\left( \frac{n}{B} \log_{M/B} \frac{n}{B} \right)
\end{aligned}
$$

Because $c_{\text{node}} \gg c_{\text{mem}}$ for markdown parsing, the layout only becomes
visible once parsing is cached. This explains why the effect is invisible in cold-build
benchmarks and pronounced in warm ones.

## Results

| Corpus | Documents $n$ | Naive (ms) | vEB (ms) | Speedup |
|---|---:|---:|---:|---:|
| Small docs sites | 340 | 41 | 39 | 1.05× |
| Medium docs sites | 4 100 | 512 | 388 | 1.32× |
| Large docs sites | 28 000 | 4 070 | 2 210 | 1.84× |
| Synthetic | 250 000 | 39 800 | 15 100 | 2.64× |

The measured exponent on the large corpora is consistent with the predicted
$\Theta(\log_{B} n)$ within one standard deviation across ten runs.

> The practical finding is narrower than the theoretical one. Below roughly thirty thousand
> documents, layout is not your problem, and the effort is better spent on making the parse
> stage skippable.

## Threats to validity

1. The corpora are public documentation sites, which are more uniform in document size than
   general web content. Variance in $\lVert \text{node} \rVert$ weakens the layout benefit.
2. Measurements were taken on a single microarchitecture. The model is oblivious, but the
   constants are not.
3. We do not model the effect of the operating system page cache, which for the largest
   corpus is doing work the model attributes to main memory.

## Availability

The implementation, the corpora manifests and the measurement harness are archived at the DOI
above. The layout pass itself is about 200 lines and is the least interesting part of the
artefact.
