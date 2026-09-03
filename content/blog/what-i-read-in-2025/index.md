---
title: What I Read in 2025
date: 2026-01-06
description: The books and papers that changed how I work, and a few that did not. Ordered by how often I have gone back to them.
skills:
  - Reading
  - Technical Writing
---

I read less than I meant to and more than last year, which is the usual outcome. These are the
ones I have actually returned to, rather than the ones I merely finished.

## Books

**Crafting Interpreters**, Robert Nystrom. The best technical book I have read in years. It
builds the same language twice, once as a tree walking interpreter and once as a bytecode VM,
and the second half quietly teaches you why the first half was slow. Free online at
https://craftinginterpreters.com and worth buying anyway.

**A Philosophy of Software Design**, John Ousterhout. Short, opinionated, occasionally wrong,
and the chapter on "deep modules" changed how I review pull requests. The argument is that an
interface should be small relative to the functionality behind it, and that most of our
abstractions are shallow enough to be a net cost.

> The greatest limitation in writing software is our ability to understand the systems we are
> creating.

**Data-Oriented Design**, Richard Fabian. I bounced off this twice before it landed. It is
really a book about the gap between the model in your head and the layout in memory, and it
is much more relevant to a document compiler than I expected.

~~**The Mythical Man-Month**~~. I reread it and I no longer think the essays outside the title
one have aged well. Read the title essay and the one on second-system effect, skip the rest.

## Papers

- [Incremental Computation via Function Caching](https://doi.org/10.1145/75277.75305), Pugh
  and Teitelbaum, 1989. Everything the current generation of build tools rediscovered, written
  down thirty-five years ago.
- [Build Systems à la Carte](https://doi.org/10.1017/S0956796820000088), Mokhov, Mitchell and
  Peyton Jones. Takes the design space of build systems and factors it into two orthogonal
  choices. Genuinely clarifying.
- [Cache-Oblivious Algorithms](https://doi.org/10.1145/1721837.1721859), Frigo et al. I came
  for the B-tree analysis and stayed for the realisation that the same reasoning applies to
  document trees.

## Things I abandoned

Two textbooks and one very long blog series, all for the same reason: they explained *what*
without ever explaining *why*. I have stopped feeling guilty about closing those.

For 2026 the list is shorter and mostly re-reads. The marginal value of a fourth pass through
*Crafting Interpreters* seems higher than a first pass through something merely new.
