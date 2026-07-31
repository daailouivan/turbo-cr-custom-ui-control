// ==UserScript==
// @name         turbo.cr — custom UI control (direct download / source grabber)
// @namespace    https://github.com/daailouivan/turbo-cr-custom-ui-control
// @version      1.0.0
// @description  A custom UI control for turbo.cr: bypasses the "I'm not a robot" gate on /d/ pages and surfaces the real signed CDN URL + original filename on embed/d/v pages. Injects a download bar (direct link, copy URL, blob-save). Album-aware.
// @author       daailouivan
// @match        https://turbo.cr/*
// @match        https://*.turbo.cr/*
// @icon         https://turbo.cr/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ORIGIN = location.origin; // https://turbo.cr
  // Video id patterns: /embed/<id>  /d/<id>  /v/<id>  /watch/<id>
  const SINGLE_RE = /\/(?:embed|d|v|watch)\/([A-Za-z0-9_\-]{4,})/i;
  const API = (id) => `${ORIGIN}/api/sign?v=${encodeURIComponent(id)}`;

  const css = `
#tc-bar{position:fixed;top:12px;right:12px;z-index:2147483647;max-width:340px;
  background:#11151ccc;backdrop-filter:blur(6px);color:#eee;font:13px/1.4 system-ui,sans-serif;
  border:1px solid #2b6cb0;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px #0008;}
#tc-bar b{color:#63b3ed}
#tc-bar .row{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
#tc-bar button{cursor:pointer;border:1px solid #2b6cb0;background:#1a202c;color:#eee;
  border-radius:7px;padding:5px 9px;font:12px system-ui,sans-serif}
#tc-bar button:hover{background:#2b6cb0;color:#fff}
#tc-bar a.dl{text-decoration:none}
#tc-bar .meta{opacity:.75;font-size:11px;margin-top:6px;word-break:break-all}
#tc-bar .err{color:#fc8181}
#tc-list{margin-top:8px;max-height:240px;overflow:auto}
#tc-list .it{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #ffffff14}
#tc-list .it a{color:#63b3ed;text-decoration:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

  function addStyle() {
    if (document.getElementById('tc-style')) return;
    const s = document.createElement('style');
    s.id = 'tc-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function makeBar() {
    addStyle();
    let bar = document.getElementById('tc-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'tc-bar';
    bar.innerHTML = '<b>turbo.cr</b> · resolving source…';
    document.body.appendChild(bar);
    return bar;
  }

  async function sign(id, referer) {
    const r = await fetch(API(id), {
      headers: { accept: '*/*', referer: referer || location.href },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || j.success !== true || !j.url) throw new Error('no url in response');
    return j; // {filename, original_filename, url, success}
  }

  function fmtExp(exp) {
    if (!exp) return '';
    const d = new Date(exp * 1000);
    return 'expires ' + d.toLocaleString();
  }

  function downloadViaBlob(url, name, btn) {
    btn.textContent = 'fetching…';
    fetch(url, { headers: { referer: location.href } })
      .then((r) => r.blob())
      .then((b) => {
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = name || 'video.mp4';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 60000);
        btn.textContent = 'Save (blob)';
      })
      .catch((e) => {
        btn.textContent = 'blob failed';
        console.error('[turbo.cr] blob save failed', e);
      });
  }

  function buildSingleUI(id) {
    const bar = makeBar();
    sign(id)
      .then((j) => {
        const name = j.original_filename || j.filename || (id + '.mp4');
        bar.innerHTML =
          '<b>turbo.cr</b> · source resolved' +
          `<div class="meta">${j.filename || ''} &rarr; <b>${name}</b><br>${fmtExp(urlExp(j.url))}</div>` +
          '<div class="row">' +
          `<a class="dl" href="${j.url}" target="_blank" rel="noopener"><button>Open video</button></a>` +
          `<button data-act="copy">Copy URL</button>` +
          `<button data-act="blob">Save (blob)</button>` +
          '</div>';
        bar.querySelector('[data-act="copy"]').onclick = () => {
          navigator.clipboard.writeText(j.url).then(() => {
            const b = bar.querySelector('[data-act="copy"]');
            b.textContent = 'Copied!';
            setTimeout(() => (b.textContent = 'Copy URL'), 1200);
          });
        };
        bar.querySelector('[data-act="blob"]').onclick = (e) =>
          downloadViaBlob(j.url, name, e.target);
      })
      .catch((e) => {
        bar.innerHTML = `<b>turbo.cr</b> · <span class="err">failed: ${e.message}</span>`;
      });
  }

  function urlExp(url) {
    try {
      const m = /[?&]exp=(\d+)/.exec(url);
      return m ? parseInt(m[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  // ---- Album / listing pages: scan for video links ----
  async function buildAlbumUI() {
    const ids = new Set();
    document.querySelectorAll('a[href]').forEach((a) => {
      const m = SINGLE_RE.exec(a.href);
      if (m && m[1]) ids.add(m[1]);
    });
    // also any element carrying a data-video-id / data-id
    document.querySelectorAll('[data-video-id],[data-id]').forEach((el) => {
      const v = el.getAttribute('data-video-id') || el.getAttribute('data-id');
      if (v && /[A-Za-z0-9_\-]{4,}/.test(v)) ids.add(v);
    });
    if (ids.size === 0) return false;

    const bar = makeBar();
    bar.innerHTML = `<b>turbo.cr</b> · album: ${ids.size} video(s) — resolving…`;
    const list = document.createElement('div');
    list.id = 'tc-list';
    bar.appendChild(list);

    let done = 0;
    for (const id of ids) {
      const row = document.createElement('div');
      row.className = 'it';
      row.innerHTML = `<a href="${ORIGIN}/embed/${id}" target="_blank" rel="noopener">${id}</a><button>resolve</button>`;
      list.appendChild(row);
      const btn = row.querySelector('button');
      try {
        const j = await sign(id);
        const name = j.original_filename || j.filename || id + '.mp4';
        btn.textContent = '↓';
        btn.onclick = () => {
          const a = document.createElement('a');
          a.href = j.url;
          a.download = name;
          a.click();
        };
        row.querySelector('a').title = name;
        row.insertAdjacentHTML(
          'beforeend',
          `<span style="opacity:.6;font-size:11px">${name}</span>`
        );
      } catch (e) {
        btn.textContent = 'err';
        btn.title = e.message;
      }
      done++;
      if (done % 5 === 0) bar.firstChild.textContent = `turbo.cr · album: ${done}/${ids.size} resolved…`;
    }
    bar.firstChild.innerHTML = `<b>turbo.cr</b> · album: ${ids.size} video(s) resolved`;
    return true;
  }

  function main() {
    if (!document.body) return;
    const m = SINGLE_RE.exec(location.pathname);
    if (m && m[1]) {
      buildSingleUI(m[1]);
      return;
    }
    // not a single page — try album/listing scan
    buildAlbumUI();
  }

  // Re-run on SPA-ish navigations (XenForo uses some pjax)
  const obs = new MutationObserver(() => {
    if (!document.getElementById('tc-bar')) main();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  main();
})();
