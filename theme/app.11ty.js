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

/* Search palette. Powered by MiniSearch for fuzzy full-text indexing,
   prefix search, typo tolerance, and multi-keyword relevance boosting. */
(function () {
  var trigger = document.querySelector('[data-search-trigger]');
  var dialog = document.getElementById('palette');
  if (!trigger || !dialog || typeof dialog.showModal !== 'function') return;

  var input = dialog.querySelector('.palette__input');
  var list = dialog.querySelector('.palette__list');
  var status = dialog.querySelector('.palette__status');
  var closer = dialog.querySelector('[data-palette-close]');

  var miniSearch = null;
  var recordsCount = 0;
  var results = [];
  var cursor = 0;

  function load() {
    if (miniSearch) return Promise.resolve(miniSearch);
    return fetch('/search-index.json')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var records = data.records || [];
        recordsCount = records.length;
        if (typeof MiniSearch !== 'undefined') {
          miniSearch = new MiniSearch({
            fields: ['title', 'skills', 'subtitle', 'description', 'content'],
            storeFields: ['title', 'subtitle', 'permalink', 'typeLabel', 'dateDisplay'],
            searchOptions: {
              boost: { title: 4, skills: 3, subtitle: 2, description: 1 },
              fuzzy: 0.2,
              prefix: true
            }
          });
          miniSearch.addAll(records);
        }
        return miniSearch;
      })
      .catch(function () {
        return null;
      });
  }

  function option(record, index) {
    var item = document.createElement('li');
    item.className = 'palette__option';
    item.id = 'palette-option-' + index;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(index === cursor));

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
    list.textContent = '';
    for (var i = 0; i < results.length; i++) list.appendChild(option(results[i], i));
    input.setAttribute('aria-expanded', results.length ? 'true' : 'false');
    if (results.length) {
      input.setAttribute('aria-activedescendant', 'palette-option-' + cursor);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
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

    if (miniSearch) {
      results = miniSearch.search(query).slice(0, 12);
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
    dialog.showModal();
    load().then(function () {
      search();
      input.focus();
    });
  }

  trigger.addEventListener('click', function (event) {
    event.preventDefault();
    open();
  });

  if (closer) closer.addEventListener('click', function () { dialog.close(); });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });

  input.addEventListener('input', search);

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
`;

export function render() {
  const miniSearchSource = fs.readFileSync(MINISEARCH_SOURCE, 'utf8');
  return `${miniSearchSource}\n\n${clientScripts}`;
}
