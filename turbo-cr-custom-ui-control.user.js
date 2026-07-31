// ==UserScript==
// @name         turbo.cr — custom UI control (grid, thumbnails, size + pagination)
// @namespace    https://github.com/daailouivan/turbo-cr-custom-ui-control
// @version      1.1.0
// @description  A custom UI control for turbo.cr album (/a/<id>) pages: replaces the hover-only floating thumbnail with a persistent grid where each card shows the thumbnail above the title, plus size/views/actions. Adds a thumbnail-size slider, a Grid/List toggle, and client-side pagination (per-page selectable) with Prev/Next + page numbers. Live-updates on search/sort.
// @author       daailouivan
// @match        https://turbo.cr/a/*
// @match        https://*.turbo.cr/a/*
// @icon         https://turbo.cr/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const LS_SIZE = 'tc_grid_size'; // px
  const LS_VIEW = 'tc_grid_view'; // 'grid' | 'list'
  const LS_PERP = 'tc_grid_perpage'; // number | 'all'

  const PER_PAGE_OPTS = [12, 24, 48, 96, 'all'];

  const getSize = () => parseInt(localStorage.getItem(LS_SIZE) || '240', 10);
  const getView = () => localStorage.getItem(LS_VIEW) || 'grid';
  const getPerP = () => {
    const v = localStorage.getItem(LS_PERP);
    if (v === 'all') return 'all';
    const n = parseInt(v, 10);
    return PER_PAGE_OPTS.includes(n) ? n : 24; // default 24 (not "all")
  };

  const css = `
#tc-grid-ui{margin:14px 0;}
#tc-grid-bar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:10px 12px;
  background:#11151c99;border:1px solid #2b6cb0;border-radius:10px;color:#eee;
  font:13px/1.3 system-ui,sans-serif;position:sticky;top:8px;z-index:50;backdrop-filter:blur(6px);}
#tc-grid-bar b{color:#63b3ed}
#tc-grid-bar .grp{display:inline-flex;align-items:center;gap:6px;opacity:.9}
#tc-grid-bar label{display:inline-flex;align-items:center;gap:6px;opacity:.85}
#tc-grid-bar input[type=range]{width:120px;accent-color:#63b3ed}
#tc-grid-bar select{background:#1a202c;color:#eee;border:1px solid #2b6cb0;border-radius:7px;padding:4px 8px;font:12px system-ui}
#tc-grid-bar .seg{display:inline-flex;border:1px solid #2b6cb0;border-radius:8px;overflow:hidden}
#tc-grid-bar .seg button{background:#1a202c;color:#eee;border:0;padding:5px 11px;cursor:pointer;font:12px system-ui}
#tc-grid-bar .seg button.on{background:#2b6cb0;color:#fff}
#tc-grid-bar .hint{opacity:.6;margin-left:auto;font-size:11px}
#tc-grid{display:grid;gap:14px;margin-top:12px;}
#tc-grid.grid{grid-template-columns:repeat(auto-fill,minmax(var(--tc-size,240px),1fr));}
#tc-grid.list{display:flex;flex-direction:column;gap:8px}
.tc-card{background:#0e1218cc;border:1px solid #ffffff14;border-radius:12px;overflow:hidden;
  display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
.tc-card:hover{border-color:#2b6cb0;transform:translateY(-2px)}
.tc-card .thumb{display:block;width:100%;aspect-ratio:427/240;object-fit:cover;background:#000;cursor:pointer}
.tc-card .body{padding:9px 10px;display:flex;flex-direction:column;gap:5px}
.tc-card .name{font-weight:600;color:#fff;font-size:13px;word-break:break-word;line-height:1.25}
.tc-card .meta{font-size:11px;color:#9aa4b2;display:flex;gap:10px;flex-wrap:wrap}
.tc-card .acts{display:flex;gap:6px;margin-top:3px}
.tc-card .acts a,.tc-card .acts button{width:32px;height:32px;border-radius:9px;
  border:1px solid #ffffff14;background:#1a202c;color:#cfd8e3;display:inline-flex;
  align-items:center;justify-content:center;text-decoration:none;cursor:pointer;font-size:12px}
.tc-card .acts a:hover,.tc-card .acts button:hover{background:#2b6cb0;color:#fff;border-color:#2b6cb0}
/* list mode: thumbnail on the left, compact */
#tc-grid.list .tc-card{flex-direction:row;align-items:center}
#tc-grid.list .tc-card .thumb{width:var(--tc-size,240px);max-width:40vw;flex:0 0 auto}
#tc-grid.list .tc-card .body{flex:1}
#tc-grid.list .tc-card .acts{margin-top:0;margin-left:auto}
/* pager */
#tc-pager{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin:16px 0 4px}
#tc-pager button{min-width:34px;padding:6px 10px;border-radius:8px;border:1px solid #2b6cb0;
  background:#1a202c;color:#eee;cursor:pointer;font:12px system-ui}
#tc-pager button:hover:not(:disabled){background:#2b6cb0;color:#fff}
#tc-pager button.on{background:#2b6cb0;color:#fff}
#tc-pager button:disabled{opacity:.35;cursor:default}
#tc-pager .info{opacity:.7;font-size:12px;margin:0 4px}
.tc-card .chk{position:absolute}
`;

  // ---- state ----
  let currentPage = 1;
  let lastRowSig = '';

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n < 10 ? 2 : 1) + ' ' + u[i];
  }

  function rowData(tr) {
    const id = tr.getAttribute('data-id');
    const name = tr.getAttribute('data-name') || (tr.querySelector('.name,.font-semibold') || {}).textContent || '';
    const size = tr.getAttribute('data-size') || (tr.querySelector('.file-size') || {}).getAttribute?.('data-bytes') || '';
    const views = tr.getAttribute('data-views') || '';
    const a = tr.querySelector('a[data-thumb]');
    const thumb = (a && a.getAttribute('data-thumb')) || '';
    return { id, name, size, views, thumb };
  }

  function cardHTML(d) {
    const sz = fmtBytes(d.size);
    return (
      `<div class="tc-card" data-id="${d.id}">` +
      `<a class="thumb" href="/v/${d.id}" target="_blank" title="Watch: ${d.name}">` +
      `<img loading="lazy" src="${d.thumb}" alt="" onerror="this.style.opacity=.25">` +
      `</a>` +
      `<div class="body">` +
      `<a class="name" href="/v/${d.id}" target="_blank">${d.name}</a>` +
      `<div class="meta"><span>${sz}</span><span>${d.views} views</span><span>${d.id}</span></div>` +
      `<div class="acts">` +
      `<a href="/v/${d.id}" target="_blank" title="Watch"><i class="fa-solid fa-play"></i></a>` +
      `<a href="/d/${d.id}" target="_blank" title="Download"><i class="fa-solid fa-download"></i></a>` +
      `<button data-embed="${d.id}" title="Embed codes"><i class="fa-solid fa-code"></i></button>` +
      `</div>` +
      `</div>` +
      `</div>`
    );
  }

  function getRows() {
    const tbody = document.getElementById('fileTbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr.file-row'));
  }

  function buildBar() {
    const bar = document.getElementById('tc-grid-bar');
    const size = getSize();
    const view = getView();
    const perP = getPerP();
    const perOpts = PER_PAGE_OPTS.map((o) =>
      `<option value="${o}"${String(o) === String(perP) ? ' selected' : ''}>${o === 'all' ? 'All' : o + ' / page'}</option>`
    ).join('');

    bar.innerHTML =
      '<b>turbo.cr grid</b>' +
      `<label>Size <input type="range" min="120" max="420" step="10" value="${size}" id="tc-size">` +
      `<span id="tc-size-val">${size}px</span></label>` +
      `<span class="grp">Per page <select id="tc-perpage">${perOpts}</select></span>` +
      `<span class="seg"><button data-v="grid" class="${view === 'grid' ? 'on' : ''}">Grid</button>` +
      `<button data-v="list" class="${view === 'list' ? 'on' : ''}">List</button></span>` +
      `<span class="hint" id="tc-hint"></span>`;

    bar.querySelector('#tc-size').addEventListener('input', (e) => {
      const v = e.target.value;
      localStorage.setItem(LS_SIZE, v);
      const valEl = document.getElementById('tc-size-val');
      if (valEl) valEl.textContent = v + 'px';
      const g = document.getElementById('tc-grid');
      if (g) g.style.setProperty('--tc-size', v + 'px');
    });
    bar.querySelector('#tc-perpage').addEventListener('change', (e) => {
      localStorage.setItem(LS_PERP, e.target.value);
      currentPage = 1;
      renderGrid();
    });
    bar.querySelectorAll('.seg button').forEach((b) => {
      b.addEventListener('click', () => {
        localStorage.setItem(LS_VIEW, b.getAttribute('data-v'));
        buildBar(); // refresh toggle highlight
        applyView();
      });
    });
  }

  function applyView() {
    const g = document.getElementById('tc-grid');
    if (g) g.className = getView();
  }

  function pagerHTML(total, perPage, page) {
    if (perPage === 'all' || total <= perPage) return '';
    const pages = Math.ceil(total / perPage);
    const parts = [];
    parts.push(`<button data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>`);
    // windowed page numbers
    const win = [];
    const push = (p) => { if (p >= 1 && p <= pages && !win.includes(p)) win.push(p); };
    push(1); push(2);
    for (let p = page - 2; p <= page + 2; p++) push(p);
    push(pages - 1); push(pages);
    win.sort((a, b) => a - b);
    let prev = 0;
    win.forEach((p) => {
      if (p - prev > 1) parts.push('<button disabled>…</button>');
      parts.push(`<button data-pg="${p}" class="${p === page ? 'on' : ''}">${p}</button>`);
      prev = p;
    });
    parts.push(`<button data-pg="next" ${page >= pages ? 'disabled' : ''}>Next ›</button>`);
    parts.push(`<span class="info">Page ${page} / ${pages}</span>`);
    return parts.join('');
  }

  function renderGrid() {
    const rows = getRows();
    const total = rows.length;
    const perPage = getPerP();

    // reset to page 1 when the row set changes (search/sort)
    const sig = rows.map((r) => r.getAttribute('data-id')).join('|');
    if (sig !== lastRowSig) { lastRowSig = sig; currentPage = 1; }

    const hint = document.getElementById('tc-hint');
    if (hint) hint.textContent = `${total} files · thumbnails lifted from hover`;

    const grid0 = document.getElementById('tc-grid');
    const pager = document.getElementById('tc-pager');
    if (!grid0 || !pager) return;

    let slice = rows;
    if (perPage !== 'all' && total > perPage) {
      const pages = Math.ceil(total / perPage);
      if (currentPage > pages) currentPage = pages;
      if (currentPage < 1) currentPage = 1;
      const start = (currentPage - 1) * perPage;
      slice = rows.slice(start, start + perPage);
    }
    grid0.innerHTML = slice.map((r) => cardHTML(rowData(r))).join('');

    // re-bind embed buttons (mirror site behaviour)
    grid0.querySelectorAll('button[data-embed]').forEach((b) => {
      b.addEventListener('click', () => {
        const orig = document.querySelector(`button[data-embed="${b.getAttribute('data-embed')}"]`);
        if (orig) orig.click();
      });
    });

    pager.innerHTML = pagerHTML(total, perPage, currentPage);
    pager.querySelectorAll('button[data-pg]').forEach((b) => {
      if (b.disabled) return;
      b.addEventListener('click', () => {
        const v = b.getAttribute('data-pg');
        if (v === 'prev') currentPage = Math.max(1, currentPage - 1);
        else if (v === 'next') currentPage++;
        else currentPage = parseInt(v, 10);
        renderGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // hide original table so we don't show duplicates
    const tbody = document.getElementById('fileTbody');
    if (tbody) tbody.closest('table').style.display = 'none';
  }

  function init() {
    if (!document.getElementById('fileTbody')) return;
    let wrap = document.getElementById('tc-grid-ui');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tc-grid-ui';
      const bar = document.createElement('div');
      bar.id = 'tc-grid-bar';
      const grid = document.createElement('div');
      grid.id = 'tc-grid';
      const pager = document.createElement('div');
      pager.id = 'tc-pager';
      wrap.appendChild(bar);
      wrap.appendChild(grid);
      wrap.appendChild(pager);

      const tbody = document.getElementById('fileTbody');
      tbody.closest('table').parentElement.insertBefore(wrap, tbody.closest('table'));

      if (!document.getElementById('tc-grid-style')) {
        const s = document.createElement('style');
        s.id = 'tc-grid-style';
        s.textContent = css;
        document.head.appendChild(s);
      }
      buildBar();
      // expose for listeners
      window.__tcGrid = grid;
    }
    applyView();
    renderGrid();
  }

  // grid is looked up live via getElementById where needed (see applyView / slider)

  // ---- wiring ----
  // Observe ONLY the tbody (rows added/removed by site search/sort) — not the whole doc,
  // so our own grid/pager writes don't retrigger a render loop.
  let raf = 0;
  const mo = new MutationObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (document.getElementById('fileTbody')) { renderGrid(); }
    });
  });

  // also re-render on the site's search input (filters tbody)
  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'fileSearch' || e.target.placeholder?.includes('filename'))) {
      renderGrid();
    }
  });

  init();
  setTimeout(init, 400);
  setTimeout(init, 1200);

  // attach observer after first init (tbody must exist)
  const t = setInterval(() => {
    const tb = document.getElementById('fileTbody');
    if (tb) { mo.observe(tb, { childList: true, subtree: true }); clearInterval(t); }
  }, 300);
})();
