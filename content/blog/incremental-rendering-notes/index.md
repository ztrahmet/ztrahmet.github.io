---
title: Notes on Incremental Rendering
date: 2025-11-24
description: Working notes on dependency tracking, dirty sets and why the link stage is the part that refuses to become incremental.
image: /images/blogs/incremental.png
skills:
  - Compilers
  - Algorithms
  - Incremental Computation
  - Graph Theory
---

These are working notes rather than a finished argument. I keep coming back to the same
question: given a change to one input, what is the smallest set of outputs that can possibly
be affected, and how cheaply can I compute that set?

## The dependency graph

Model the site as a directed graph $G = (V, E)$ where $V$ is the set of pages and assets, and
an edge $u \to v$ means "rendering $v$ reads something from $u$". A change to $u$ dirties
every vertex reachable from it.

The dirty set for a change set $D \subseteq V$ is the reachable closure

$$
R(D) = \{\, v \in V : \exists\, u \in D \text{ with } u \rightsquigarrow v \,\}
$$

and the cost of a warm build is $\Theta(|R(D)|)$ rather than $\Theta(|V|)$. For a typical
edit, $|R(D)|$ is one or two. For an edit to the base layout, it is everything, and that is
correct: the layout really does affect every page.

### Why the closure is usually tiny

Let $d$ be the mean out-degree of the graph. If dependencies were random, the expected
reachable set would grow like $d^{\ell}$ at depth $\ell$ and the whole thing would be useless.
Real sites are not random. They are shallow and sparse:

$$
\begin{aligned}
|E| &\approx 3.1\,|V| \\
\operatorname{diam}(G) &\le 4 \quad \text{for every site I measured} \\
\mathbb{E}\bigl[|R(\{u\})|\bigr] &< 6
\end{aligned}
$$

The diameter stays small because links between pages are mostly *references*, not
*inclusions*. Referencing a page does not require rendering it, only knowing its title and
URL. That distinction is what keeps the graph shallow, and it is worth defending in the
design of the tool.

## The stubborn part

Three things need global knowledge and therefore resist incrementalisation:

| Stage | Needs | Incremental? |
|---|---|---|
| Parse | one file | yes, trivially |
| Render | one file plus its layout | yes |
| Backlinks | every page's outbound links | no, but cacheable |
| Search index | every page's text | no |
| Sitemap | every page's URL | no, but cheap |

For the search index the honest bound is that you must touch every changed document and
merge into an existing structure, giving

$$
T_{\text{index}}(n, k) = \Theta\!\left(k \log n\right)
$$

if the index is a sorted structure, rather than the $\Theta(n)$ of rebuilding it. In practice
$n$ is small enough that rebuilding wins on constant factors until roughly ten thousand
documents.

### Memory is the real limit

Holding every parsed AST costs

$$
M(n) = n \cdot \bigl( \lVert \text{ast} \rVert + \lVert \text{meta} \rVert \bigr)
$$

which sounds obvious until you measure $\lVert \text{ast} \rVert$ and find it is 40 times the
size of the source markdown. Serialising the cache to disk and paging it back in is slower per
access but bounded, and bounded beats fast when the alternative is the OOM killer.

## Open questions

1. Can the backlink pass be made incremental with a persistent inverted index, and is the
   bookkeeping cheaper than the recompute it avoids?
2. Is there a useful notion of a *partially* dirty page, where only one section re-renders?
3. What does the constant factor on $\Theta(k \log n)$ actually look like for $k = 1$?

I suspect the answer to the second is no, and that trying will produce a cache invalidation
bug I will still be finding in a year.
