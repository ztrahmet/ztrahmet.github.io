import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esmPath = fileURLToPath(import.meta.resolve('minisearch'));
const MINISEARCH_SOURCE = path.resolve(path.dirname(esmPath), '../umd/index.js');

export const data = {
  permalink: '/assets/app.js',
  eleventyExcludeFromCollections: true
};

const clientScripts = `
/* Colour scheme control. The page already works without this: it follows the
   system preference. This adds the override and remembers it. */
(function () {
  var root = document.documentElement;
  var group = document.querySelector('.scheme');
  if (!group) return;

  function read() {
    try { return localStorage.getItem('scheme') || 'auto'; } catch (e) { return 'auto'; }
  }

  function apply(mode) {
    if (mode === 'auto') delete root.dataset.theme;
    else root.dataset.theme = mode;
    var buttons = group.querySelectorAll('[data-scheme]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].dataset.scheme === mode));
    }
  }

  apply(read());

  group.addEventListener('click', function (event) {
    var button = event.target.closest('[data-scheme]');
    if (!button) return;
    var mode = button.dataset.scheme;
    try {
      if (mode === 'auto') localStorage.removeItem('scheme');
      else localStorage.setItem('scheme', mode);
    } catch (e) {}
    apply(mode);
  });
})();

/* Shared search index loader and MiniSearch cache. */
var getSearchIndex = (function () {
  var promise = null;
  return function () {
    if (promise) return promise;
    promise = fetch('/search-index.json')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var records = data.records || [];
        var recordsById = {};
        for (var rIdx = 0; rIdx < records.length; rIdx++) {
          recordsById[records[rIdx].id] = records[rIdx];
        }

        if (typeof MiniSearch !== 'undefined') {
          var miniSearch = new MiniSearch({
            fields: [
              'title',
              'skills',
              'subtitle',
              'issuer',
              'publisher',
              'authors',
              'typeLabel',
              'type',
              'credential_id',
              'links',
              'headings',
              'dateDisplay',
              'date',
              'location',
              'description',
              'content',
              'searchable'
            ],
            storeFields: [
              'title',
              'subtitle',
              'permalink',
              'typeLabel',
              'dateDisplay',
              'date',
              'type',
              'id',
              'skills',
              'slug'
            ],
            searchOptions: {
              boost: {
                title: 12,
                skills: 10,
                subtitle: 7,
                issuer: 7,
                publisher: 7,
                credential_id: 6,
                authors: 5,
                headings: 4,
                links: 3.5,
                typeLabel: 3.5,
                type: 3.5,
                description: 3,
                dateDisplay: 2.5,
                date: 2.5,
                location: 2,
                content: 0.5,
                searchable: 0.5
              },
              prefix: true,
              fuzzy: function (term) {
                // Strict numeric matching: do not fuzzy-match years like "2024" to "2026"
                if (/^\\d+$/.test(term)) return 0;
                // Strict for very short terms (1-3 chars e.g. "go", "c", "aws", "git")
                if (term.length <= 3) return 0;
                // 1 edit distance for 4-char terms
                if (term.length === 4) return 1;
                // 2 edit distance for terms >= 5 chars (tolerates typos e.g. "pythn", "dokcer", "googel", "typogrphy")
                return 2;
              },
              combineWith: 'OR'
            }
          });
          miniSearch.addAll(records);

          function hasWord(text, word) {
            if (!text || !word) return false;
            var idx = text.indexOf(word);
            if (idx === -1) return false;
            var before = idx === 0 || !/[a-z0-9_]/i.test(text.charAt(idx - 1));
            var after = (idx + word.length >= text.length) || !/[a-z0-9_]/i.test(text.charAt(idx + word.length));
            return before && after;
          }

          var FIELD_WEIGHTS = {
            title: 15,
            skills: 12,
            subtitle: 7,
            issuer: 7,
            publisher: 7,
            credential_id: 6,
            authors: 5,
            headings: 4,
            links: 3.5,
            typeLabel: 3.5,
            description: 3,
            date: 2.5,
            location: 2,
            content: 0.5
          };

          function calculateRelevance(item, query, msResult) {
            var q = (query || '').toLowerCase().trim();
            if (!q) return 0;
            var terms = q.split(/\\s+/).filter(Boolean);
            if (!terms.length) return 0;

            var score = 0;
            var title = (item.title || '').toLowerCase();
            var subtitle = (item.subtitle || '').toLowerCase();
            var desc = (item.description || '').toLowerCase();
            var skills = Array.isArray(item.skills) ? item.skills.map(function (s) { return String(s).toLowerCase(); }) : [];
            var issuer = (item.issuer || '').toLowerCase();
            var publisher = (item.publisher || '').toLowerCase();
            var authors = Array.isArray(item.authors) ? item.authors.map(function (a) { return String(a).toLowerCase(); }).join(' ') : '';
            var links = (item.links || '').toLowerCase();
            var headings = Array.isArray(item.headings) ? item.headings.map(function (h) { return String(h).toLowerCase(); }).join(' ') : '';
            var typeLabel = (item.typeLabel || '').toLowerCase();
            var type = (item.type || '').toLowerCase();
            var dateStr = (item.dateDisplay || item.date || '').toLowerCase();
            var content = (item.content || '').toLowerCase();

            // 1. Dominant exact whole-query matches
            if (title === q) {
              score += 300;
            } else if (title.indexOf(q) === 0) {
              score += 180;
            } else if (title.indexOf(q) !== -1) {
              score += 100;
            }

            // Exact skill match
            if (skills.indexOf(q) !== -1) {
              score += 160;
            } else {
              for (var sIdx = 0; sIdx < skills.length; sIdx++) {
                if (skills[sIdx].indexOf(q) === 0) {
                  score += 80;
                  break;
                }
              }
            }

            // Exact phrase in metadata
            if (q.length > 2) {
              if (issuer.indexOf(q) !== -1) score += 70;
              if (subtitle.indexOf(q) !== -1) score += 50;
              if (desc.indexOf(q) !== -1) score += 40;
            }

            // 2. Term-by-term scoring with field weights
            var termsMatched = 0;
            for (var tIdx = 0; tIdx < terms.length; tIdx++) {
              var term = terms[tIdx];
              var termMatched = false;
              var termMaxWeight = 0;

              if (title.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.title * (hasWord(title, term) ? 1.5 : 1.0));
              }
              if (skills.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.skills * 1.5);
              } else {
                for (var sk = 0; sk < skills.length; sk++) {
                  if (skills[sk].indexOf(term) !== -1) {
                    termMatched = true;
                    termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.skills);
                    break;
                  }
                }
              }
              if (subtitle.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.subtitle);
              }
              if (issuer.indexOf(term) !== -1 || publisher.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.issuer);
              }
              if (authors.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.authors);
              }
              if (headings.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.headings);
              }
              if (links.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.links);
              }
              if (typeLabel.indexOf(term) !== -1 || type.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.typeLabel);
              }
              if (desc.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.description);
              }
              if (dateStr.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.date);
              }
              if (content.indexOf(term) !== -1) {
                termMatched = true;
                termMaxWeight = Math.max(termMaxWeight, FIELD_WEIGHTS.content);
              }

              // MiniSearch fuzzy / prefix fallback
              if (!termMatched && msResult && msResult.match) {
                var matchedKeys = Object.keys(msResult.match);
                for (var mIdx = 0; mIdx < matchedKeys.length; mIdx++) {
                  var mk = matchedKeys[mIdx];
                  if (mk.indexOf(term) === 0 || term.indexOf(mk) === 0) {
                    termMatched = true;
                    termMaxWeight = Math.max(termMaxWeight, 2.0);
                    break;
                  } else {
                    termMatched = true;
                    termMaxWeight = Math.max(termMaxWeight, 1.0);
                    break;
                  }
                }
              }

              if (termMatched) {
                termsMatched++;
                score += termMaxWeight * 6;
              }
            }

            var coverage = terms.length > 0 ? (termsMatched / terms.length) : 1;
            score *= Math.pow(coverage, 2);

            if (msResult && msResult.score) {
              score += msResult.score * 0.2;
            }

            var dateToParse = item.date || item.dateDisplay || '';
            var yearMatches = dateToParse.match(/(?:19|20)\\d\\d/);
            if (yearMatches) {
              var yr = parseInt(yearMatches[0], 10);
              if (!isNaN(yr)) {
                score += Math.max(0, (yr - 2015) * 0.05);
              }
            }

            return score;
          }

          function search(query, options) {
            options = options || {};
            var q = (query || '').trim();
            if (!q) return [];
            var searchOpts = {};
            if (options.filter) {
              var targetType = options.filter;
              searchOpts.filter = function (record) {
                return record.type === targetType;
              };
            }
            var rawResults = miniSearch.search(q, searchOpts);
            var scoredResults = [];
            for (var i = 0; i < rawResults.length; i++) {
              var r = rawResults[i];
              var fullItem = recordsById[r.id] || r;
              r.calcScore = calculateRelevance(fullItem, q, r);
              scoredResults.push(r);
            }
            scoredResults.sort(function (a, b) {
              return b.calcScore - a.calcScore;
            });
            return scoredResults;
          }

          return {
            miniSearch: miniSearch,
            search: search,
            totalRecords: records.length,
            records: records
          };
        }
        return null;
      })
      .catch(function () {
        return null;
      });
    return promise;
  };
})();

/* Mobile navigation menu toggle */
(function () {
  var rail = document.getElementById('rail') || document.querySelector('.rail');
  var toggle = document.querySelector('[data-menu-toggle]');
  var backdrop = document.querySelector('[data-menu-backdrop]');
  if (!rail || !toggle) return;

  function setMenuOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      rail.classList.add('is-open');
    } else {
      rail.classList.remove('is-open');
    }
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = toggle.getAttribute('aria-expanded') === 'true';
    setMenuOpen(!isOpen);
  });

  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenuOpen(false);
    });
  }

  // Close when clicking a nav link or search trigger
  rail.addEventListener('click', function (e) {
    var target = e.target;
    if (target.closest('.nav__item') || target.closest('[data-search-trigger]')) {
      setMenuOpen(false);
    }
  });

  // Close when clicking outside rail
  document.addEventListener('click', function (e) {
    if (toggle.getAttribute('aria-expanded') === 'true' && !rail.contains(e.target)) {
      setMenuOpen(false);
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  // Reset menu state when resized above mobile breakpoint (60rem = 960px)
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 960 && toggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
    }
  });
})();

/* Search palette (modal dialog). Powered by MiniSearch for fuzzy full-text indexing,
   prefix search, typo tolerance, and multi-keyword relevance boosting. */
(function () {
  var triggers = document.querySelectorAll('[data-search-trigger]');
  var dialog = document.getElementById('palette');
  if (!triggers.length || !dialog || typeof dialog.showModal !== 'function') return;

  var input = dialog.querySelector('.palette__input');
  var list = dialog.querySelector('.palette__list');
  var status = dialog.querySelector('.palette__status');
  var closer = dialog.querySelector('[data-palette-close]');

  var searchEngine = null;
  var recordsCount = 0;
  var results = [];
  var cursor = 0;

  function option(record, index) {
    var item = document.createElement('li');
    item.className = 'palette__option is-entering';
    item.setAttribute('data-id', record.id || record.permalink);
    item.id = 'palette-option-' + index;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(index === cursor));
    item.addEventListener('animationend', function () {
      item.classList.remove('is-entering');
    }, { once: true });

    var link = document.createElement('a');
    link.className = 'palette__link';
    link.href = record.permalink;

    var title = document.createElement('span');
    title.className = 'palette__title';
    title.textContent = record.title;

    var meta = document.createElement('span');
    meta.className = 'palette__meta';
    meta.textContent = record.typeLabel + (record.dateDisplay ? ' · ' + record.dateDisplay : '');

    link.appendChild(title);
    link.appendChild(meta);
    item.appendChild(link);
    return item;
  }

  function render() {
    input.setAttribute('aria-expanded', results.length ? 'true' : 'false');
    if (results.length) {
      input.setAttribute('aria-activedescendant', 'palette-option-' + cursor);
    } else {
      input.removeAttribute('aria-activedescendant');
    }

    var existing = {};
    var oldItems = Array.prototype.slice.call(list.children);
    oldItems.forEach(function (child) {
      var id = child.getAttribute('data-id');
      if (id) existing[id] = child;
    });

    var matchedIds = {};
    results.forEach(function (rec) {
      var id = rec.id || rec.permalink;
      matchedIds[id] = true;
    });

    oldItems.forEach(function (child) {
      var id = child.getAttribute('data-id');
      if (!matchedIds[id] && child.parentNode === list) {
        list.removeChild(child);
      }
    });

    results.forEach(function (rec, idx) {
      var id = rec.id || rec.permalink;
      var existingEl = existing[id];
      var currentChildAtIndex = list.children[idx];

      if (existingEl) {
        existingEl.id = 'palette-option-' + idx;
        existingEl.setAttribute('aria-selected', String(idx === cursor));
        if (existingEl !== currentChildAtIndex) {
          list.insertBefore(existingEl, currentChildAtIndex || null);
        }
      } else {
        var newEl = option(rec, idx);
        list.insertBefore(newEl, currentChildAtIndex || null);
      }
    });
  }

  function search() {
    var query = input.value.trim();
    cursor = 0;
    if (!query) {
      results = [];
      render();
      status.textContent = recordsCount ? recordsCount + ' entries indexed' : '';
      return;
    }

    if (searchEngine) {
      results = searchEngine.search(query).slice(0, 12);
    } else {
      results = [];
    }

    render();
    status.textContent = results.length
      ? results.length + ' result' + (results.length === 1 ? '' : 's')
      : 'No matches for “' + query + '”';
  }

  function move(step) {
    if (!results.length) return;
    cursor = (cursor + step + results.length) % results.length;
    render();
    var active = document.getElementById('palette-option-' + cursor);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    input.value = '';
    results = [];
    cursor = 0;
    render();
    var rail = document.querySelector('.rail');
    var menuToggle = document.querySelector('[data-menu-toggle]');
    if (rail && menuToggle) {
      rail.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
    dialog.showModal();
    getSearchIndex().then(function (res) {
      if (res) {
        searchEngine = res;
        recordsCount = res.totalRecords;
      }
      search();
      input.focus();
    });
  }

  Array.prototype.forEach.call(triggers, function (t) {
    t.addEventListener('click', function (event) {
      event.preventDefault();
      open();
    });
  });

  if (closer) closer.addEventListener('click', function () { dialog.close(); });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });

  var paletteFrame = null;
  function schedulePaletteSearch() {
    if (paletteFrame) cancelAnimationFrame(paletteFrame);
    paletteFrame = requestAnimationFrame(search);
  }

  input.addEventListener('input', schedulePaletteSearch);

  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter' && results[cursor]) {
      event.preventDefault();
      window.location.href = results[cursor].permalink;
    }
  });

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    var combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (combo || (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      if (dialog.open) return;
      event.preventDefault();
      open();
    }
  });
})();

/* Inline page search on collection tabs (Everything, Blog, Projects, Publications, Skills). */
(function () {
  var container = document.querySelector('[data-page-search]');
  if (!container) return;

  var input = container.querySelector('.page-search__input');
  var resultsContainer = container.querySelector('.page-search__results');
  var staticList = document.querySelector('[data-static-list]');
  if (!input || !resultsContainer) return;

  var filterCollection = container.getAttribute('data-filter') || '';
  var isSkillsPage = window.location.pathname.split('/').filter(Boolean)[0] === 'skills';

  function updateStatus(text) {
    var status = resultsContainer.querySelector('.page-search__status');
    if (!text) {
      if (status) status.remove();
      return;
    }
    if (!status) {
      status = document.createElement('p');
      status.className = 'page-search__status';
      resultsContainer.insertBefore(status, resultsContainer.firstChild);
    }
    status.textContent = text;
  }

  function handleSkillsSearch(query) {
    var tierItems = Array.prototype.slice.call(document.querySelectorAll('.tier__item'));
    var tiers = Array.prototype.slice.call(document.querySelectorAll('.tier'));

    if (!query) {
      updateStatus('');
      tierItems.forEach(function (item) {
        item.classList.remove('is-filtered-out', 'is-filtered-in');
      });
      tiers.forEach(function (tier) {
        tier.classList.remove('is-filtered-out');
      });
      return;
    }

    getSearchIndex().then(function (res) {
      if (!res) return;

      var skillMatches = res.search(query, { filter: 'skill' });
      var matchedSlugs = {};
      var matchedNames = {};

      if (skillMatches.length > 0) {
        skillMatches.forEach(function (m) {
          if (m.slug) matchedSlugs[m.slug] = true;
          if (m.title) matchedNames[m.title.toLowerCase()] = true;
        });
      } else {
        var allMatches = res.search(query);
        allMatches.forEach(function (m) {
          if (Array.isArray(m.skills)) {
            m.skills.forEach(function (s) {
              matchedNames[s.toLowerCase()] = true;
            });
          }
        });
      }

      var count = 0;
      tierItems.forEach(function (item) {
        var href = item.getAttribute('href') || '';
        var parts = href.split('/').filter(Boolean);
        var slug = parts[parts.length - 1] || '';
        var text = item.textContent.trim().toLowerCase();

        var isMatch = matchedSlugs[slug] || matchedNames[text];
        if (isMatch) {
          item.classList.remove('is-filtered-out');
          item.classList.add('is-filtered-in');
          count++;
        } else {
          item.classList.remove('is-filtered-in');
          item.classList.add('is-filtered-out');
        }
      });

      tiers.forEach(function (tier) {
        var visibleItem = tier.querySelector('.tier__item:not(.is-filtered-out)');
        if (visibleItem) {
          tier.classList.remove('is-filtered-out');
        } else {
          tier.classList.add('is-filtered-out');
        }
      });

      updateStatus(count
        ? count + ' skill' + (count === 1 ? '' : 's') + ' matching “' + query + '”'
        : 'No skills matching “' + query + '”');
    });
  }

  function renderCard(record) {
    var li = document.createElement('li');
    li.className = 'card is-entering';
    li.setAttribute('data-id', record.id || record.permalink);
    li.addEventListener('animationend', function () {
      li.classList.remove('is-entering');
    }, { once: true });

    var a = document.createElement('a');
    a.className = 'card__link';
    a.href = record.permalink;

    var meta = document.createElement('span');
    meta.className = 'card__meta';
    if (record.dateDisplay) {
      var dateSpan = document.createElement('span');
      dateSpan.className = 'card__date';
      dateSpan.textContent = record.dateDisplay;
      meta.appendChild(dateSpan);
    }
    if (record.typeLabel) {
      var tagSpan = document.createElement('span');
      tagSpan.className = 'card__tag';
      tagSpan.textContent = record.typeLabel;
      meta.appendChild(tagSpan);
    }

    var main = document.createElement('span');
    main.className = 'card__main';

    var title = document.createElement('span');
    title.className = 'card__title';
    title.textContent = record.title;
    main.appendChild(title);

    if (record.subtitle) {
      var sub = document.createElement('span');
      sub.className = 'card__sub';
      sub.textContent = record.subtitle;
      main.appendChild(sub);
    }

    a.appendChild(meta);
    a.appendChild(main);
    li.appendChild(a);
    return li;
  }

  function updateCards(matches) {
    var ol = resultsContainer.querySelector('.cards');
    if (!matches.length) {
      if (ol) ol.remove();
      return;
    }
    if (!ol) {
      ol = document.createElement('ol');
      ol.className = 'cards';
      resultsContainer.appendChild(ol);
    }

    var existing = {};
    var oldCards = Array.prototype.slice.call(ol.children);
    oldCards.forEach(function (card) {
      var id = card.getAttribute('data-id');
      if (id) existing[id] = card;
    });

    var matchedIds = {};
    matches.forEach(function (m) {
      var id = m.id || m.permalink;
      matchedIds[id] = true;
    });

    oldCards.forEach(function (card) {
      var id = card.getAttribute('data-id');
      if (!matchedIds[id] && card.parentNode === ol) {
        ol.removeChild(card);
      }
    });

    matches.forEach(function (m, idx) {
      var id = m.id || m.permalink;
      var existingEl = existing[id];
      var currentChildAtIndex = ol.children[idx];

      if (existingEl) {
        if (existingEl !== currentChildAtIndex) {
          ol.insertBefore(existingEl, currentChildAtIndex || null);
        }
      } else {
        var newEl = renderCard(m);
        ol.insertBefore(newEl, currentChildAtIndex || null);
      }
    });
  }

  function handleSearch() {
    var query = input.value.trim();

    if (isSkillsPage) {
      handleSkillsSearch(query);
      return;
    }

    if (!query) {
      updateStatus('');
      var ol = resultsContainer.querySelector('.cards');
      if (ol) ol.remove();
      if (staticList) {
        staticList.classList.remove('is-search-hidden');
        staticList.style.display = '';
      }
      return;
    }

    getSearchIndex().then(function (res) {
      if (!res) return;

      var matches = res.search(query, { filter: filterCollection || undefined });

      if (staticList) {
        staticList.classList.add('is-search-hidden');
        staticList.style.display = 'none';
      }

      updateStatus(matches.length
        ? matches.length + ' result' + (matches.length === 1 ? '' : 's') + ' for “' + query + '”'
        : 'No matches for “' + query + '”');

      updateCards(matches);
    });
  }

  var searchFrame = null;
  function scheduleSearch() {
    if (searchFrame) cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(handleSearch);
  }

  input.addEventListener('input', scheduleSearch);
  input.addEventListener('search', scheduleSearch);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (searchFrame) cancelAnimationFrame(searchFrame);
      input.value = '';
      handleSearch();
      input.blur();
    }
  });
})();

/* Back to top. Hidden without JS, since the control would do nothing; the
   browser's own Home key already covers the no-script case. */
(function () {
  var button = document.querySelector('[data-totop]');
  if (!button) return;

  var shown = false;
  var threshold = 0;

  function measure() { threshold = Math.round(window.innerHeight * 0.75); }

  function update() {
    var should = window.scrollY > threshold;
    if (should === shown) return;
    shown = should;
    button.classList.toggle('is-shown', shown);
    button.tabIndex = shown ? 0 : -1;
  }

  button.tabIndex = -1;
  measure();
  update();

  button.addEventListener('click', function () {
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', function () { measure(); update(); });
})();

/* Print action on the CV. Hidden without JS, since Cmd+P still works. */
(function () {
  var buttons = document.querySelectorAll('[data-print]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () { window.print(); });
  }
})();

/* Reading rail. Fills the contents rule as the article is read, and marks the
   section currently in view. Offsets are measured once and re-measured on
   resize, so scrolling is pure arithmetic and never forces a layout. */
(function () {
  var rail = document.querySelector('[data-reading]');
  var article = document.querySelector('.entry');
  if (!rail || !article) return;

  var links = Array.prototype.slice.call(rail.querySelectorAll('.toc__item a'));
  if (!links.length) return;

  var offsets = [];
  var articleTop = 0;
  var articleHeight = 0;
  var active = -1;

  function remeasure() {
    var box = article.getBoundingClientRect();
    articleTop = box.top + window.scrollY;
    articleHeight = box.height;
    offsets = links.map(function (link) {
      var id = decodeURIComponent(link.getAttribute('href').slice(1));
      var target = document.getElementById(id);
      return target ? target.getBoundingClientRect().top + window.scrollY : Infinity;
    });
    update();
  }

  function update() {
    var scrollable = articleHeight - window.innerHeight;
    var read = scrollable > 0
      ? Math.min(Math.max((window.scrollY - articleTop) / scrollable, 0), 1)
      : 1;
    rail.style.setProperty('--read', read.toFixed(4));

    var mark = window.scrollY + 120;
    var index = 0;
    for (var i = 0; i < offsets.length; i++) {
      if (offsets[i] <= mark) index = i;
    }
    if (index !== active) {
      if (active > -1) links[active].removeAttribute('aria-current');
      links[index].setAttribute('aria-current', 'true');
      active = index;
    }
  }

  remeasure();
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
})();

/* Body graphics become numbered figures, captioned from the description they
   already carry. */
(function () {
  var prose = document.querySelector('.prose');
  if (!prose) return;

  function describe(node) {
    return node.tagName === 'IMG' ? node.alt : node.getAttribute('aria-label');
  }

  function clear(node) {
    if (node.tagName === 'IMG') node.alt = '';
    else node.removeAttribute('aria-label');
  }

  var graphics = prose.querySelectorAll('p > img:only-child, p > svg.inline-svg:only-child');
  Array.prototype.forEach.call(graphics, function (graphic) {
    var description = describe(graphic);
    if (!description) return;

    var paragraph = graphic.parentNode;
    var caption = document.createElement('figcaption');
    var text = document.createElement('span');
    text.className = 'figure__text';
    text.textContent = description;
    caption.appendChild(text);

    var figure = document.createElement('figure');
    figure.className = 'figure';
    figure.appendChild(graphic);
    figure.appendChild(caption);
    clear(graphic);

    paragraph.parentNode.replaceChild(figure, paragraph);
  });
})();


/* Smooth accordion animation for mobile Table of Contents <details class="toc-mobile">. */
(function () {
  var details = document.querySelectorAll('details.toc-mobile');
  if (!details.length) return;

  Array.prototype.forEach.call(details, function (el) {
    var summary = el.querySelector('summary');
    var drawer = el.querySelector('.toc-mobile__drawer');
    if (!summary || !drawer) return;

    summary.addEventListener('click', function (e) {
      var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      if (el.open) {
        e.preventDefault();
        el.classList.add('is-closing');
        drawer.style.gridTemplateRows = '0fr';
        drawer.style.opacity = '0';
        setTimeout(function () {
          el.removeAttribute('open');
          el.classList.remove('is-closing');
          drawer.style.gridTemplateRows = '';
          drawer.style.opacity = '';
        }, 260);
      }
    });
  });
})();

/* Expandable card lists with smooth collapsible drawer */
(function () {
  var expandables = document.querySelectorAll('[data-collapsible]');
  if (!expandables.length) return;

  Array.prototype.forEach.call(expandables, function (container) {
    var trigger = container.querySelector('[data-expand-trigger]');
    var drawer = container.querySelector('[data-collapsible-drawer]');
    if (!trigger || !drawer) return;

    var textEl = trigger.querySelector('.btn__text');
    var labelMore = trigger.getAttribute('data-label-more');
    var labelLess = trigger.getAttribute('data-label-less');

    trigger.addEventListener('click', function () {
      var isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      var nextState = !isExpanded;

      trigger.setAttribute('aria-expanded', String(nextState));
      drawer.setAttribute('data-expanded', String(nextState));
      drawer.setAttribute('aria-hidden', String(!nextState));

      if (textEl) {
        textEl.textContent = nextState ? labelLess : labelMore;
      }
    });
  });
})();
`;

export function render() {
  const miniSearchSource = fs.readFileSync(MINISEARCH_SOURCE, 'utf8');
  return `${miniSearchSource}\n\n${clientScripts}`;
}
