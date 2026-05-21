/* ==========================================================================
   HMS Schema v8 — shared renderer
   Provides three globals:
     renderIndex()             — used by index.html (draws module cards + search)
     renderModule(MODULE)      — used by every modules/*.html (draws cards + drawer)
     renderFKLink(targetTable) — returns href for cross-module FK navigation

   Frozen — AI must not edit this file. To change a table or column, edit the
   MODULE object inside the relevant modules/*.html instead.
   ========================================================================== */

const SCHEMA_VERSION = 'v8.0';

// ---------- THEME ----------
let LIGHT = false;
function applyTheme() {
  document.body.classList.toggle('L', LIGHT);
  const r = document.getElementById('root');
  if (r) r.classList.toggle('L', LIGHT);
  const ti = document.getElementById('togi');
  if (ti) ti.textContent = LIGHT ? '☾' : '☀';
}
function toggleTheme() {
  LIGHT = !LIGHT;
  try { localStorage.setItem('hms-theme', LIGHT ? 'L' : 'D'); } catch (e) {}
  applyTheme();
}
try { LIGHT = localStorage.getItem('hms-theme') === 'L'; } catch (e) {}

// ---------- CROSS-MODULE FK LINK ----------
function renderFKLink(targetTable) {
  const modId = (typeof CATALOG !== 'undefined') ? CATALOG[targetTable] : null;
  if (!modId) return null;
  const entry = (typeof MANIFEST !== 'undefined') ? MANIFEST.find(m => m.id === modId) : null;
  if (!entry) return null;
  const isIndexContext = !!document.querySelector('script[src="shared/renderer.js"]');
  const prefix = isIndexContext ? '' : '../';
  return `${prefix}${entry.file}#${targetTable}`;
}

// ---------- FIELD RENDER HELPERS ----------
function dot(f) {
  if (f.pk) return '<div class="dot dpk"></div>';
  if (f.fk) return '<div class="dot dfk"></div>';
  if (f.uk) return '<div class="dot duk"></div>';
  return '<div class="dot dnl"></div>';
}
function bgs(f) {
  const b = [];
  if (f.pk) b.push('<span class="bg bpk">PK</span>');
  if (f.fk) {
    const link = renderFKLink(f.fk);
    const arrow = link
      ? `<a href="${link}" title="Go to ${f.fk} in module">→ ${f.fk}</a>`
      : `→ ${f.fk}`;
    b.push(`<span class="bg bfk">${arrow}</span>`);
  }
  if (f.uk && !f.pk) b.push('<span class="bg buk">UQ</span>');
  if (f.nl) b.push('<span class="bg bnl">null</span>');
  if (f.nw) b.push('<span class="bg bnew">NEW</span>');
  if (f.ud) b.push('<span class="bg bupd">UPDATED</span>');
  return b.join('');
}

// ---------- AUTO-DESCRIPTION (when desc: not provided) ----------
function autoDesc(tableName, f) {
  const n = f.n;
  const t = (f.t || '').toLowerCase();
  if (f.pk) return `Primary key for the ${tableName} table.`;
  if (n === 'tenant_id') return 'Multi-tenancy partition. Every row carries a tenant_id from day 1.';
  if (n === 'created_at') return 'Audit timestamp set on row creation. Never updated.';
  if (n === 'updated_at') return 'Last modification time. Auto-updated by trigger on every UPDATE.';
  if (n === 'created_by') return 'User who created this row. FK to users.id.';
  if (n === 'updated_by') return 'User of the most recent UPDATE.';
  if (n === 'version') return 'Optimistic-lock counter; incremented on every UPDATE.';
  if (n === 'is_active') return 'Soft-delete flag. False rows are excluded from default queries.';
  if (n.endsWith('_at') && t.includes('timestamp')) return 'Timestamp recording when this event occurred.';
  if (f.fk) return `Foreign key to the ${f.fk} table.${f.nl ? ' Nullable — optional relationship.' : ''}`;
  if (n.startsWith('is_')) return `Boolean flag — ${n.slice(3).replace(/_/g, ' ')}.`;
  if (t.includes('jsonb')) return 'JSONB structured field — see type column for shape.';
  if (t.includes('text')) return 'Free-form text.' + (f.nl ? ' Optional.' : ' Required.');
  return `Field on the ${tableName} table.`;
}

// ---------- VALUE PARSING (for enum-like type strings) ----------
function parseValues(typeStr) {
  if (!typeStr) return [];
  const after = typeStr.split('·')[1] || typeStr;
  const matches = after.match(/'([^']+)'/g);
  if (!matches || matches.length < 2) return [];
  return matches.map(m => m.replace(/'/g, ''));
}

// ---------- DRAWER ----------
function openFieldDrawer(table, fieldIdx) {
  const f = table.f[fieldIdx];
  if (!f) return;
  const desc = f.desc || autoDesc(table.n, f);
  const vals = parseValues(f.t);

  const tags = [];
  if (f.pk) tags.push(['PK', 'pk']);
  if (f.fk) tags.push([`FK → ${f.fk}`, 'fk']);
  if (f.uk) tags.push(['UNIQUE', 'uk']);
  if (f.nl) tags.push(['NULLABLE', 'nl']);
  if (f.nw) tags.push([`NEW IN ${SCHEMA_VERSION}`, 'new']);
  if (f.ud) tags.push(['UPDATED', 'upd']);

  const fkLink = f.fk ? renderFKLink(f.fk) : null;
  const fkRow = fkLink
    ? `<div class="dr-meta-k">Target</div><div class="dr-meta-v"><a class="dr-fk-link" href="${fkLink}">${f.fk} →</a></div>`
    : '';

  const constraints = [];
  if (f.pk) constraints.push(['Primary key', 'PK']);
  if (f.uk) constraints.push(['Unique', 'UK']);
  if (f.fk) constraints.push(['Foreign key', '→ ' + f.fk]);
  constraints.push(['Nullable', f.nl ? 'YES' : (f.pk ? '—' : 'NO')]);
  const defMatch = (f.t || '').match(/DEFAULT\s+(\S+)/i);
  if (defMatch) constraints.push(['Default', defMatch[1]]);

  document.getElementById('drHead').innerHTML = `
    <div class="dr-eyebrow">Field detail</div>
    <div class="dr-title"><span class="dr-table">${table.n}</span><span class="dr-dot">.</span><span class="dr-field">${f.n}</span></div>
    <div class="dr-tags">${tags.map(([t,c]) => `<span class="dr-tag dr-tag-${c}">${t}</span>`).join('')}</div>
    <button class="dr-close" id="drCloseBtn">×</button>
  `;
  document.getElementById('drBody').innerHTML = `
    <div class="dr-section">
      <div class="dr-section-label">Type</div>
      <div class="dr-typebox">${f.t || '—'}</div>
    </div>
    <div class="dr-section">
      <div class="dr-section-label">Description</div>
      <div class="dr-desc">${desc}</div>
    </div>
    ${vals.length > 0 ? `
      <div class="dr-section">
        <div class="dr-section-label">Allowed values · ${vals.length}</div>
        <div class="dr-vals">${vals.map((v,i) => `<div class="dr-val"><span>${v}</span><span class="dr-val-tag">option ${i+1}</span></div>`).join('')}</div>
      </div>` : ''}
    <div class="dr-section">
      <div class="dr-section-label">Constraints</div>
      <div class="dr-meta-grid">
        ${constraints.map(([k,v]) => `<div class="dr-meta-k">${k}</div><div class="dr-meta-v">${v}</div>`).join('')}
        ${fkRow}
      </div>
    </div>
  `;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drOverlay').classList.add('open');
  document.getElementById('drCloseBtn').addEventListener('click', closeDrawer);
}
function closeDrawer() {
  const d = document.getElementById('drawer'); if (d) d.classList.remove('open');
  const o = document.getElementById('drOverlay'); if (o) o.classList.remove('open');
}

// ---------- MODULE PAGE RENDER ----------
function renderModule(M) {
  const totalF = M.tables.reduce((s,t) => s + t.f.length, 0);
  const newT = M.tables.filter(t => t.nw).length;
  const updT = M.tables.filter(t => t.ud && !t.nw).length;
  const newF = M.tables.reduce((s,t) => s + t.f.filter(f => f.nw).length, 0);
  const updF = M.tables.reduce((s,t) => s + t.f.filter(f => f.ud).length, 0);

  let chips = '';
  if (newT) chips += `<span class="chip chip-new">${newT} new table${newT>1?'s':''}</span>`;
  if (updT) chips += `<span class="chip chip-upd">${updT} updated table${updT>1?'s':''}</span>`;
  if (newF) chips += `<span class="chip chip-new">${newF} new field${newF>1?'s':''}</span>`;
  if (updF) chips += `<span class="chip chip-upd">${updF} updated</span>`;

  // Group cards by feature if features array provided
  const renderCard = (t) => {
    const isNew = t.nw, isUpd = t.ud && !t.nw;
    const changed = t.f.filter(f => f.nw || f.ud).length;
    let hdExtras = '';
    if (isNew) hdExtras += '<span class="ntag ntag-new">NEW TABLE</span>';
    else if (isUpd) hdExtras += '<span class="ntag ntag-upd">UPDATED</span>';
    else if (changed > 0) hdExtras += `<span class="ntag ntag-new">${changed} changed</span>`;
    const hdrBg = LIGHT ? M.lbg : M.bg;
    const desc = t.desc ? `<div class="tdesc">${t.desc}</div>` : '';
    const hd = `<div class="chd" style="background:${hdrBg}">${hdExtras}<span class="tn">${t.n}</span><span class="tc">${t.f.length} fields</span></div>${desc}`;
    const rows = t.f.map((f,i) => `<div class="row${f.nw?' nw':f.ud?' ud':''}" data-tbl="${t.n}" data-fld="${i}">${dot(f)}<span class="fn">${f.n}</span><span class="ft">${f.t||''}</span>${bgs(f)}</div>`).join('');
    return `<div class="card" id="${t.n}">${hd}${rows}</div>`;
  };

  let body = '';
  let featureBar = '';
  const featureList = (M.features || []).map(fid => {
    const tbls = M.tables.filter(t => t.feature === fid);
    const flds = tbls.reduce((s,t) => s + t.f.length, 0);
    return { id: fid, tableCount: tbls.length, fieldCount: flds };
  }).filter(f => f.tableCount > 0);

  if (featureList.length > 0) {
    featureBar = `<div class="feature-bar">` +
      featureList.map(f => `<a href="#feat-${f.id}" class="feature-tag">${f.id.replace(/-/g,' ')} · ${f.tableCount}</a>`).join('') +
      `</div>`;

    M.features.forEach(featureId => {
      const tbls = M.tables.filter(t => t.feature === featureId);
      if (!tbls.length) return;
      const flds = tbls.reduce((s,t) => s + t.f.length, 0);
      body += `<div class="feature-section" id="feat-${featureId}"><div class="feature-section-label">▸ ${featureId.replace(/-/g,' ')} <span style="color:var(--t2);margin-left:6px">· ${tbls.length} table${tbls.length>1?'s':''} · ${flds} fields</span></div><div class="grid">${tbls.map(renderCard).join('')}</div></div>`;
    });
    // Tables without a feature tag
    const orphans = M.tables.filter(t => !t.feature || !M.features.includes(t.feature));
    if (orphans.length) {
      const oFlds = orphans.reduce((s,t) => s + t.f.length, 0);
      body += `<div class="feature-section" id="feat-other"><div class="feature-section-label">▸ other <span style="color:var(--t2);margin-left:6px">· ${orphans.length} tables · ${oFlds} fields</span></div><div class="grid">${orphans.map(renderCard).join('')}</div></div>`;
    }
  } else {
    body = `<div class="grid">${M.tables.map(renderCard).join('')}</div>`;
  }

  const root = document.getElementById('root');
  root.className = 'R';
  root.innerHTML = `
    <div class="totals">
      <span class="totals-label">${M.name}</span>
      <div class="totals-divider"></div>
      <div class="totals-stat"><span class="totals-num">${M.tables.length}</span><span class="totals-cap">tables</span></div>
      <div class="totals-stat"><span class="totals-num">${totalF}</span><span class="totals-cap">fields</span></div>
      <span class="totals-version">${SCHEMA_VERSION}</span>
    </div>
    <div class="top">
      <div class="crumbs">
        <a href="../index.html">All modules</a><span class="sep">›</span><span>${M.name}</span>
      </div>
      <button class="tog" onclick="toggleTheme()" aria-label="Toggle theme"><span id="togi">☀</span></button>
    </div>
    <div class="wrap"><div class="body">
      <div class="sbar">
        <div><div class="sn" style="color:${M.color}">${featureList.length}</div><div class="sl">FEATURES</div></div>
        <div><div class="sn" style="color:${M.color}">${M.tables.length}</div><div class="sl">TABLES</div></div>
        <div><div class="sn" style="color:${M.color}">${totalF}</div><div class="sl">FIELDS</div></div>
        <div style="margin-left:4px;font-size:10px;color:var(--t3);align-self:center;font-family:sans-serif">${M.id}</div>
        <div class="chips">${chips}</div>
      </div>
      ${featureBar}
      ${body}
    </div></div>
    <div class="foot">
      <div class="li"><div class="dot dpk"></div>primary key</div>
      <div class="li"><div class="dot dfk"></div>foreign key</div>
      <div class="li"><div class="dot duk"></div>unique</div>
      <div class="li"><div class="dot dnl"></div>nullable</div>
      <div class="li" style="margin-left:6px"><span style="width:24px;height:10px;border-radius:2px;display:inline-block;background:var(--ambl);border:1px solid var(--amb2)"></span>new field/table</div>
      <div class="li"><span style="width:24px;height:10px;border-radius:2px;display:inline-block;background:var(--updl);border:1px solid rgba(68,128,200,.2)"></span>updated</div>
    </div>
    <div class="dr-overlay" id="drOverlay" onclick="closeDrawer()"></div>
    <aside class="drawer" id="drawer" aria-hidden="true">
      <div class="dr-head" id="drHead"></div>
      <div class="dr-body" id="drBody"></div>
    </aside>
  `;
  // Wire row clicks
  root.querySelectorAll('.row[data-tbl]').forEach(el => {
    el.addEventListener('click', () => {
      const t = M.tables.find(tt => tt.n === el.dataset.tbl);
      if (t) openFieldDrawer(t, parseInt(el.dataset.fld, 10));
    });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  applyTheme();

  // Scroll to anchor if present
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) setTimeout(() => target.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
  }
}

// ---------- INDEX PAGE RENDER ----------
function renderIndex() {
  const totalTables = MANIFEST.reduce((s,m) => s + m.tableCount, 0);
  const totalFields = MANIFEST.reduce((s,m) => s + (m.fieldCount || 0), 0);
  const totalFeatures = MANIFEST.reduce((s,m) => s + (m.featureCount || 0), 0);
  const platformMods = MANIFEST.filter(m => m.id.startsWith('platform-'));
  const featureMods = MANIFEST.filter(m => !m.id.startsWith('platform-'));

  const card = (m) => `
    <a class="module-card" href="${m.file}">
      <div class="m-bar" style="background:${m.color}"></div>
      <div class="m-name">${m.name}</div>
      <div class="m-id">${m.id}</div>
      <div class="m-stats">
        <div class="m-stat"><span class="m-stat-num">${m.featureCount ?? '—'}</span><span class="m-stat-cap">features</span></div>
        <div class="m-stat"><span class="m-stat-num">${m.tableCount}</span><span class="m-stat-cap">tables</span></div>
        <div class="m-stat"><span class="m-stat-num">${m.fieldCount ?? '—'}</span><span class="m-stat-cap">fields</span></div>
      </div>
    </a>`;

  const root = document.getElementById('root');
  root.className = 'R';
  root.innerHTML = `
    <div class="totals">
      <span class="totals-label">HMS Schema</span>
      <div class="totals-divider"></div>
      <div class="totals-stat"><span class="totals-num">${MANIFEST.length}</span><span class="totals-cap">modules</span></div>
      <div class="totals-stat"><span class="totals-num">${totalFeatures}</span><span class="totals-cap">features</span></div>
      <div class="totals-stat"><span class="totals-num">${totalTables}</span><span class="totals-cap">tables</span></div>
      <div class="totals-stat"><span class="totals-num">${totalFields}</span><span class="totals-cap">fields</span></div>
      <span class="totals-version">${SCHEMA_VERSION}</span>
    </div>
    <div class="top">
      <div class="crumbs"><span>Module browser</span></div>
      <button class="tog" onclick="toggleTheme()" aria-label="Toggle theme"><span id="togi">☀</span></button>
    </div>
    <div class="search-box">
      <span style="color:var(--t3);font-size:12px">⌕</span>
      <input id="searchInput" type="text" placeholder="Search any table across all modules…" autocomplete="off">
    </div>
    <div class="search-results" id="searchResults"></div>
    <div class="module-section-label">Platform layer · shared infrastructure</div>
    <div class="module-grid">${platformMods.map(card).join('')}</div>
    <div class="module-section-label">Feature layer · business bounded contexts</div>
    <div class="module-grid">${featureMods.map(card).join('')}</div>
    <div style="padding:14px;text-align:center;color:var(--t3);font-size:10px;font-family:sans-serif">
      v8 — module-split schema · click any module to inspect its tables
    </div>
  `;
  applyTheme();

  // Wire search
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.remove('on'); results.innerHTML = ''; return; }
    const hits = Object.keys(CATALOG)
      .filter(t => t.toLowerCase().includes(q))
      .slice(0, 30)
      .map(t => {
        const modId = CATALOG[t];
        const mod = MANIFEST.find(m => m.id === modId);
        if (!mod) return '';
        return `<div class="search-row" onclick="window.location='${mod.file}#${t}'"><span class="sn-name">${t}</span><span class="sn-mod">${mod.name}</span></div>`;
      }).join('');
    results.innerHTML = hits || `<div class="search-row" style="color:var(--t3);cursor:default"><span class="sn-name">No tables match "${q}"</span></div>`;
    results.classList.add('on');
  });
}
