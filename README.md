# turbo.cr — UI control (userscript)

A [ViolentMonkey](https://violentmonkey.github.io/) / TamperMonkey userscript that reworks
turbo.cr **album** pages (`https://turbo.cr/a/<id>`) into a persistent grid.

turbo.cr only shows a floating thumbnail on hover for each file. This script lifts that
thumbnail up **above the title** for every entry and lays the list out as a grid, plus:

- **Thumbnail size slider** (120–420 px, persisted) — sits in the sticky control bar.
- **Grid / List toggle** — list mode puts the thumbnail on the left, compact.
- **Client-side pagination** — "Per page" selector (12 / 24 / 48 / 96 / All, default 24),
  with Prev / Next and a windowed page-number pager. Large albums no longer render every
  entry at once.
- Each card shows file name, size, view count, id, and Watch / Download / Embed actions.
- Re-renders live when the site's own search / sort changes the file list.

## Install

1. Install ViolentMonkey or TamperMonkey.
2. Import `turbo-cr-ui-control.user.js` (drag it onto the dashboard, or *New > From file*).
3. Hard-reload an album page (`/a/<id>`).

`@match`: `https://turbo.cr/a/*` and `https://*.turbo.cr/a/*`.

## Notes

- turbo.cr has **no native album pagination** — all entries are server-rendered into
  `#fileTbody`. Pagination here is purely client-side over those rows.
- Thumbnails come from `data-thumb` (`static.scdn.st/.../thumbs/<id>.jpg`). A faded/blank
  card image means that attribute was missing/blocked for that entry.
- The original table is hidden (not removed) to avoid duplicates; the site's own row
  actions are preserved underneath.

## Files

- `turbo-cr-ui-control.user.js` — the script.

## License

MIT.
