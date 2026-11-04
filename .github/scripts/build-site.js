'use strict';
// Builds the SideBOX site from the sidebox/ folder into _site/, so the published lists always match the repository.
// Runs in the Pages workflow on every push (uploads and deletes on github.com included); also runs locally:
//   node .github/scripts/build-site.js            -> _site/ (git-ignored) for a preview
//
// What it does:
//   - Landing page (sidebox/index.html): the folder list between <!--FOLDERS--> and <!--/FOLDERS--> is rebuilt from
//     the immediate subfolders of sidebox/. The date between <!--BUILT--> and <!--/BUILT--> is set to today.
//   - Each folder: index.html is generated, listing every .html page in it.
//   - Notes and settings (*.md, *.json) are used for the build but not published.
//
// Optional settings, per folder (all fields optional):
//   sidebox.json  {"title": "...", "description": "...", "order": 1, "keepIndex": true}
//                 keepIndex: the folder has its own index.html; publish it unchanged.
//   boards.json   {"<page>.html": {"title": "...", "description": "...", "order": 1, "listed": false}}
//                 title: the name shown in the list; without it, the page's own <title> is used.
//                 description falls back to the page's meta description.
//                 listed:false keeps a page online by direct link but off the list.

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const src = path.join(repo, 'sidebox');
const out = path.join(repo, '_site');
const today = new Date().toISOString().slice(0, 10);

const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const unesc = v => String(v).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k]);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (fs.existsSync(f)) console.warn(`warning: ${f}: ${e.message}`); return {}; } };
const pretty = name => name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title);
const num = v => (Number.isFinite(v) ? v : 999);
const published = name => !name.startsWith('.') || name === '.nojekyll';
const isSetting = name => /\.(md|json)$/i.test(name);

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (!published(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else if (!isSetting(e.name)) fs.copyFileSync(a, b);
  }
}

fs.rmSync(out, { recursive: true, force: true });
copyTree(src, out);

const folders = fs.readdirSync(src, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.'))
  .map(e => {
    const dir = path.join(src, e.name);
    const s = readJson(path.join(dir, 'sidebox.json'));
    return { name: e.name, dir, title: s.title || pretty(e.name), description: s.description || `Open the ${s.title || pretty(e.name)} folder.`, order: num(s.order), keepIndex: !!s.keepIndex };
  })
  .sort(byOrder);

// Folder pages.
for (const f of folders) {
  const meta = readJson(path.join(f.dir, 'boards.json'));
  const pages = fs.readdirSync(f.dir)
    .filter(n => /\.html?$/i.test(n) && n.toLowerCase() !== 'index.html' && !(meta[n] && meta[n].listed === false))
    .map(n => {
      const html = fs.readFileSync(path.join(f.dir, n), 'utf8');
      const m = meta[n] || {};
      const title = m.title || unesc(((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || pretty(n.replace(/\.html?$/i, ''))).trim());
      const desc = m.description || unesc((html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || '');
      return { file: n, title, description: desc, order: num(m.order) };
    })
    .sort(byOrder);
  f.count = pages.length;
  if (f.keepIndex && fs.existsSync(path.join(f.dir, 'index.html'))) continue;

  const cards = pages.length
    ? pages.map((p, i) => `<a class="board" href="${encodeURIComponent(p.file)}"><span class="n">${String(i + 1).padStart(2, '0')}</span>` +
        `<span><b>${esc(p.title)}</b>${p.description ? `<small>${esc(p.description)}</small>` : ''}</span><span class="go">Open</span></a>`).join('\n      ')
    : '<p>This folder is ready for its first page.</p>';

  fs.writeFileSync(path.join(out, f.name, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(f.title)} — SideBOX</title>
  <meta name="description" content="${esc(f.description)}">
  <style>
    :root{color-scheme:dark;font-family:"Segoe UI",system-ui,sans-serif;background:#071116;color:#edf4ef}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
    main{width:min(680px,100%);border:1px solid #24434a;padding:40px;background:#0c1b22;box-sizing:border-box}
    p,small{color:#9db0ad;line-height:1.65}a{color:#c7ff4a}
    h1{text-wrap:balance}
    .boards{display:grid;gap:12px;margin:24px 0 32px}
    .board{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding:16px 18px;border:1px solid #24434a;
      background:#0f2229;color:#edf4ef;text-decoration:none}
    .board:hover,.board:focus-visible{border-color:#c7ff4a;outline:none}
    .board b{display:block;font-weight:600}.board small{display:block;font-size:13px}
    .n{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;color:#ff6f59}.go{font-size:13px;color:#c7ff4a}
    @media (max-width:480px){main{padding:24px}.go{display:none}.board{grid-template-columns:auto 1fr}}
  </style>
</head>
<body><main><p>SideBOX / Folder</p><h1>${esc(f.title)}</h1>
    <div class="boards">
      ${cards}
    </div>
    <a href="../">Return to SideBOX</a></main></body>
</html>
`, 'utf8');
}

// Landing page folder list.
const landing = path.join(out, 'index.html');
if (fs.existsSync(landing)) {
  let html = fs.readFileSync(landing, 'utf8');
  const links = folders.length
    ? folders.map((f, i) => `<a class="linkcard" href="${encodeURIComponent(f.name)}/"><span class="glyph">${String(i + 1).padStart(2, '0')}</span>` +
        `<span><b>${esc(f.title)}</b><small>${esc(f.description)}</small></span><span class="arrow">↗</span></a>`).join('\n')
    : '<div class="empty-folder">No SideBOX folders have been added yet.</div>';
  if (!/<!--FOLDERS-->[\s\S]*?<!--\/FOLDERS-->/.test(html)) throw new Error('sidebox/index.html has no <!--FOLDERS--> ... <!--/FOLDERS--> markers');
  html = html.replace(/<!--FOLDERS-->[\s\S]*?<!--\/FOLDERS-->/, `<!--FOLDERS-->\n${links}\n<!--/FOLDERS-->`);
  html = html.replace(/<!--BUILT-->[\s\S]*?<!--\/BUILT-->/, `<!--BUILT-->${today}<!--/BUILT-->`);
  fs.writeFileSync(landing, html, 'utf8');
}

console.log(`SideBOX site built in _site: ${folders.length} folder(s)` + folders.map(f => `\n  ${f.name}: ${f.count} page(s) listed${f.keepIndex ? ' (own index)' : ''}`).join(''));
