/**
 * advanced-ui.js
 * Interfaz de la Calculadora avanzada: panel de configuración, resultados por
 * circunscripción agrupados por comunidad autónoma y recuento final.
 */

/* ── Colores de partido ────────────────────────────────────── */

const ADV_PARTY_COLORS = {
  'PP': '#1d9be3', 'PSOE': '#e30713', 'VOX': '#63bc00', 'SUMAR': '#d6237f',
  'ERC': '#ffb232', 'JXCAT - JUNTS': '#00c6a9', 'EH BILDU': '#b5cf18',
  'EAJ-PNV': '#008542', 'B.N.G.': '#71c5e8', 'CCA': '#f4c300', 'U.P.N.': '#0056a3',
  'PACMA': '#a5cd39', 'CUP-PR': '#ffed00', 'FO': '#8b1a1a', 'NC-BC': '#f5821f',
  'PDECAT-E-CIU': '#18b3b0', 'RECORTES CERO': '#c0392b', 'PUM+J': '#8e44ad',
  'U.P.L.': '#7d3c98', 'EXISTE': '#16a085', 'PCTE': '#a93226', 'GBAI': '#ff6600',
  'SY': '#d4442c', 'ADELANTE ANDALUCÍA': '#2e8b57', 'ESCAÑOS EN BLANCO': '#9e9e9e',
  'JM+': '#5d6d7e', 'XAV': '#af7ac5', 'BQEX': '#117864', 'CJ': '#873600',
  'FE DE LAS JONS': '#34495e', 'PAR': '#c39bd3', 'ESPAÑA VACIADA': '#f1948a',
  'PH': '#48c9b0', 'CPM': '#1abc9c', 'PREPAL': '#6c3483'
};

let _advParties = null;     // datos de la elección cargada
let _advResult  = null;     // último resultado calculado
let _advConfig  = null;
let _advColorCache = new Map();
let _advCollapsed  = new Set();   // nombres de CCAA colapsadas
let _advExpandedDistricts = new Set();
let _advLoading = false;
let _advLoaded  = false;

function advPartyColor(p) {
  const k = (p.siglas || p.name || '').toUpperCase();
  if (ADV_PARTY_COLORS[k]) return ADV_PARTY_COLORS[k];
  if (_advColorCache.has(k)) return _advColorCache.get(k);
  const c = PALETTE[_advColorCache.size % PALETTE.length];
  _advColorCache.set(k, c);
  return c;
}

/* ── Utilidades de formato ─────────────────────────────────── */

const advNum = n => formatVotes(n || 0);
const advPct = n => (n || 0).toFixed(2) + '%';

function advEscape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Carga de datos ────────────────────────────────────────── */

async function advLoadElection(force) {
  if (_advLoading) return;
  _advLoading = true;
  if (force) advClearCache();

  const key = select('#adv-election')?.value || ADV_ELECTIONS[0].key;
  advRenderStatus(`<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos electorales desde Google Sheets…</div>`);
  select('#adv-results').innerHTML = '';
  select('#adv-summary').innerHTML = '';

  try {
    _advParties = await advGetElectionData(key);
    _advLoaded = true;

    if (!_advParties.rows.length) {
      advRenderStatus(`<div class="adv-notice error"><strong>La hoja no contiene filas de datos.</strong> Los datos deben empezar en la fila 6.</div>`);
      return;
    }

    _advConfig = advDefaultConfig(_advParties.meta);
    advSyncConfigToForm();
    advUpdateHeader();
    advRun();
  } catch (err) {
    _advLoaded = false;
    advRenderStatus(
      `<div class="adv-notice error"><strong>No se pudieron cargar los datos.</strong><br>${advEscape(err.message)}</div>` +
      `<div class="adv-notice info">La hoja debe estar compartida como <em>«Cualquier persona con el enlace · Lector»</em> para que la calculadora pueda leerla.</div>`
    );
  } finally {
    _advLoading = false;
  }
}

function advRenderStatus(html) {
  const el = select('#adv-status');
  if (el) el.innerHTML = html;
}

function advUpdateHeader() {
  const m = _advParties?.meta;
  if (!m) return;
  const partes = [m.tipo, m.subtipo].filter(Boolean).join(' · ');
  const anios = [...new Set(_advParties.rows.map(r => r.anio))].filter(Boolean).join(', ');
  updateText(select('#adv-subtitle'),
    `${partes}${m.pais ? ' · ' + m.pais.charAt(0).toUpperCase() + m.pais.slice(1) : ''}${anios ? ' · ' + anios : ''} · ` +
    `${_advParties.rows.length} circunscripciones de origen · ${_advParties.parties.length} candidaturas`);
}

/* ── Formulario de configuración ───────────────────────────── */

function advBuildFormulaOptions() {
  const sel = select('#adv-formula');
  if (!sel || sel.options.length) return;
  [{ key: 'pr', label: 'Sistemas proporcionales' }, { key: 'maj', label: 'Sistemas mayoritarios' }].forEach(g => {
    const grp = document.createElement('optgroup');
    grp.label = g.label;
    FORMULAS.filter(f => f.group === g.key && f.id !== 'majority_round2').forEach(f => {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      grp.appendChild(o);
    });
    sel.appendChild(grp);
  });
}

function advBuildElectionOptions() {
  const sel = select('#adv-election');
  if (!sel || sel.options.length) return;
  ADV_ELECTIONS.forEach(e => {
    const o = document.createElement('option');
    o.value = e.key; o.textContent = e.label;
    sel.appendChild(o);
  });
}

/** Vuelca la configuración actual en los controles del formulario. */
function advSyncConfigToForm() {
  const c = _advConfig;
  if (!c) return;
  select('#adv-level').value    = c.circunscripcion;
  select('#adv-formula').value  = c.formula;

  select('#adv-b1-on').checked  = c.barrera1.activa;
  select('#adv-b1-level').value = c.barrera1.nivel;
  select('#adv-b1-val').value   = c.barrera1.valor;

  select('#adv-b2-on').checked  = c.barrera2.activa;
  select('#adv-b2-level').value = c.barrera2.nivel;
  select('#adv-b2-val').value   = c.barrera2.valor;

  select('#adv-seats-mode').value = c.seatsMode;
  select('#adv-total-seats').value = c.totalSeats;
  select('#adv-min-seats').value   = c.minPorCircunscripcion;
  select('#adv-reparto-base').value = c.repartoBase;
  select('#adv-blanco').checked = c.blancoEnDenominador;

  advRefreshFormState();
}

/** Lee el formulario y devuelve la configuración. */
function advReadForm() {
  return {
    circunscripcion: select('#adv-level').value,
    formula:         select('#adv-formula').value,
    barrera1: {
      activa: select('#adv-b1-on').checked,
      nivel:  select('#adv-b1-level').value,
      valor:  parseFloat(select('#adv-b1-val').value) || 0
    },
    barrera2: {
      activa: select('#adv-b2-on').checked,
      nivel:  select('#adv-b2-level').value,
      valor:  parseFloat(select('#adv-b2-val').value) || 0
    },
    blancoEnDenominador: select('#adv-blanco').checked,
    seatsMode:   select('#adv-seats-mode').value,
    totalSeats:  parseInt(select('#adv-total-seats').value) || 350,
    minPorCircunscripcion: parseInt(select('#adv-min-seats').value) || 0,
    repartoBase: select('#adv-reparto-base').value
  };
}

/** Habilita/deshabilita bloques del formulario según su estado. */
function advRefreshFormState() {
  select('#adv-b1-fs').dataset.disabled = String(!select('#adv-b1-on').checked);
  select('#adv-b2-fs').dataset.disabled = String(!select('#adv-b2-on').checked);
  setDisplay(select('#adv-custom-seats'), select('#adv-seats-mode').value === 'custom');

  // Al agrupar en una sola circunscripción estatal, la barrera de comunidad
  // y la de circunscripción se vuelven equivalentes a la nacional.
  const level = select('#adv-level').value;
  [['#adv-b1-level', '#adv-b1-hint'], ['#adv-b2-level', '#adv-b2-hint']].forEach(([selId, hintId]) => {
    const sel = select(selId), hint = select(hintId);
    if (!sel || !hint) return;
    let msg = '';
    if (level === 'nacional' && sel.value !== 'nacional') msg = 'Con circunscripción estatal equivale a la barrera nacional.';
    else if (level === 'ccaa' && sel.value === 'ccaa')    msg = 'Con circunscripción autonómica equivale a la de circunscripción.';
    hint.textContent = msg;
    setDisplay(hint, !!msg);
  });
}

function advOnConfigChange() {
  advRefreshFormState();
  if (_advLoaded) advRun();
}

/* ── Cálculo y render ──────────────────────────────────────── */

function advRun() {
  if (!_advParties) return;
  _advConfig = advReadForm();
  try {
    _advResult = advCalculate(_advParties, _advConfig);
  } catch (err) {
    advRenderStatus(`<div class="adv-notice error"><strong>Error al calcular.</strong><br>${advEscape(err.message)}</div>`);
    return;
  }
  advRenderStatus(_advResult.warnings.map(w =>
    `<div class="adv-notice warn"><strong>Aviso sobre los datos de origen:</strong> ${advEscape(w)}</div>`).join(''));
  advRenderSummary();
  advRenderResults();
}

function advRenderSummary() {
  const s = _advResult.summary;
  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const items = [
    ['Circunscripciones', advNum(s.numDistricts), false],
    [seatWord.charAt(0).toUpperCase() + seatWord.slice(1), advNum(s.totalSeats), false],
    ['Votos válidos', advNum(s.totalValid), true],
    ['Votos en blanco', advNum(s.totalBlanco), true],
    ['Participación', s.participacion > 0 ? advPct(s.participacion) : '—', true],
    ['Desproporción (Gallagher)', s.gallagher.toFixed(2), false]
  ];
  select('#adv-summary').innerHTML =
    `<div class="adv-summary">` +
    items.map(([l, v, m]) =>
      `<div class="adv-summary-item"><small>${advEscape(l)}</small><div class="v${m ? ' muted' : ''}">${v}</div></div>`).join('') +
    `</div>`;
}

function advRenderResults() {
  select('#adv-results').innerHTML = advNationalCard() + advDistrictsCard();
  advAttachResultHandlers();
}

/* ── Recuento final (nacional) ─────────────────────────────── */

function advNationalCard() {
  const r = _advResult;
  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const withSeats = r.national.filter(p => p.seats > 0);
  const without   = r.national.filter(p => p.seats === 0 && p.votes > 0);
  const maxSeats  = Math.max(1, ...withSeats.map(p => p.seats));
  const showReal  = r.config.seatsMode === 'sheet' && r.national.some(p => p.realSeats > 0);

  const row = p => {
    const color = advPartyColor(p);
    const delta = p.seats - p.realSeats;
    const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    return `<tr>
      <td><div class="adv-party-cell">
        <span class="color-swatch" style="background:${color}"></span>
        <span class="adv-party-name" title="${advEscape(p.name)}">${p.siglas ? `<span class="adv-party-siglas">${advEscape(p.siglas)}</span> · ` : ''}${advEscape(p.name)}</span>
      </div></td>
      <td class="adv-num">${advNum(p.votes)}</td>
      <td class="adv-num">${advPct(p.votePct)}</td>
      <td><div class="adv-seat-wrap">
        <span class="adv-seat-badge" style="background:${color}">${p.seats}</span>
        <div class="adv-bar-outer"><div class="adv-bar" style="width:${(p.seats / maxSeats * 100).toFixed(1)}%;background:${color}"></div></div>
      </div></td>
      <td class="adv-num">${advPct(p.seatPct)}</td>
      <td class="adv-num ${p.diff > 0 ? 'adv-diff-pos' : p.diff < 0 ? 'adv-diff-neg' : ''}">${p.diff > 0 ? '+' : ''}${p.diff.toFixed(2)}</td>
      ${showReal ? `<td class="adv-num"><span class="adv-real-delta ${deltaCls}">${p.realSeats}${delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}</span></td>` : ''}
    </tr>`;
  };

  const tailNote = without.length
    ? `<div style="padding:7px 12px;border-top:1px solid var(--border-light);font-size:0.72rem;color:var(--text-muted);font-style:italic">
         ${without.length} candidatura${without.length === 1 ? '' : 's'} más sin ${advEscape(seatWord)}
         (${advNum(without.reduce((s, p) => s + p.votes, 0))} votos, ${advPct(without.reduce((s, p) => s + p.votePct, 0))}).
       </div>`
    : '';

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>Recuento final · ${advEscape(_advConfig.circunscripcion === 'nacional' ? 'circunscripción estatal' : _advConfig.circunscripcion === 'ccaa' ? 'circunscripciones autonómicas' : 'circunscripciones provinciales')}
      <span class="formula-tag" style="margin-left:auto">${advEscape(FORMULAS.find(f => f.id === _advConfig.formula)?.name || _advConfig.formula)}</span>
    </div>
    <div style="overflow-x:auto">
    <table id="adv-national-table">
      <thead><tr>
        <th style="width:34%">Candidatura</th>
        <th class="adv-num" style="width:12%">Votos</th>
        <th class="adv-num" style="width:9%">% votos</th>
        <th style="width:19%">${advEscape(seatWord.charAt(0).toUpperCase() + seatWord.slice(1))}</th>
        <th class="adv-num" style="width:9%">% esc.</th>
        <th class="adv-num" style="width:8%">Dif. %</th>
        ${showReal ? `<th class="adv-num" style="width:9%" title="Escaños reales según la hoja de datos">Reales</th>` : ''}
      </tr></thead>
      <tbody>${withSeats.map(row).join('') || `<tr><td colspan="7" class="adv-empty">Ninguna candidatura obtiene representación.</td></tr>`}</tbody>
    </table>
    </div>
    ${tailNote}
  </div>`;
}

/* ── Resultados por circunscripción ────────────────────────── */

function advDistrictsCard() {
  const r = _advResult;
  const level = _advConfig.circunscripcion;

  if (level === 'nacional') {
    return `<div class="card">
      <div class="card-header"><span class="dot"></span>Circunscripción única</div>
      <div style="padding:10px 12px">${advDistrictHTML(r.districts[0], true)}</div>
    </div>`;
  }

  // Agrupación por comunidad autónoma (por nombre: los códigos pueden tener erratas).
  const groups = new Map();
  r.districts.forEach(d => {
    const k = d.ccaaName || d.name;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  const body = [...groups.entries()].map(([ccaa, ds]) => {
    const seats  = ds.reduce((s, d) => s + d.seats, 0);
    const votes  = ds.reduce((s, d) => s + d.validVotes, 0);
    const open   = !_advCollapsed.has(ccaa);

    // Composición de escaños de la comunidad para la barra apilada.
    const comp = new Map();
    ds.forEach(d => d.results.forEach(p => {
      if (p.seats > 0) comp.set(p.key, { p, seats: (comp.get(p.key)?.seats || 0) + p.seats });
    }));
    const stack = [...comp.values()].sort((a, b) => b.seats - a.seats)
      .map(x => `<span style="width:${(x.seats / Math.max(1, seats) * 100).toFixed(2)}%;background:${advPartyColor(x.p)}" title="${advEscape(x.p.siglas || x.p.name)}: ${x.seats}"></span>`).join('');

    return `<div class="adv-ccaa">
      <button class="adv-ccaa-header" data-ccaa="${advEscape(ccaa)}" aria-expanded="${open}">
        <span class="adv-ccaa-arrow">${open ? '▼' : '▶'}</span>
        <span class="adv-ccaa-name">${advEscape(ccaa)}</span>
        <span class="adv-ccaa-meta">${ds.length} circunscripci${ds.length === 1 ? 'ón' : 'ones'}</span>
        <span class="adv-ccaa-seats">
          <span class="adv-stack">${stack}</span>
          <span class="adv-ccaa-stat">${advNum(votes)} votos</span>
          <span class="adv-ccaa-stat"><b>${seats}</b> esc.</span>
        </span>
      </button>
      <div class="adv-ccaa-body" data-ccaa-body="${advEscape(ccaa)}" ${open ? '' : 'hidden'}>
        ${ds.map(d => advDistrictHTML(d, false)).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>Resultados por circunscripción
      <span class="adv-toolbar">
        <button class="adv-mini-btn" id="adv-expand-all">Expandir todo</button>
        <button class="adv-mini-btn" id="adv-collapse-all">Colapsar todo</button>
      </span>
    </div>
    ${body}
  </div>`;
}

const ADV_VISIBLE_ROWS = 6;

function advDistrictHTML(d, alwaysFull) {
  const expanded = alwaysFull || _advExpandedDistricts.has(d.id);
  const rows = d.results;
  // Se muestran siempre las candidaturas con escaño y las bloqueadas por barrera
  // que habrían tenido opciones; el resto queda tras el desplegable.
  const primary = rows.filter(p => p.seats > 0);
  const rest    = rows.filter(p => p.seats === 0);
  const shown   = expanded ? rows : [...primary, ...rest.slice(0, Math.max(0, ADV_VISIBLE_ROWS - primary.length))];
  const hidden  = rows.length - shown.length;

  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const realTotal = [...d.realSeats.values()].reduce((a, b) => a + b, 0);
  const showReal  = _advConfig.seatsMode === 'sheet' && realTotal > 0;

  const tr = p => {
    const color = advPartyColor(p);
    const cls = p.blockedReason ? 'adv-blocked' : p.seats === 0 ? 'adv-noseat' : '';
    return `<tr class="${cls}">
      <td><div class="adv-party-cell">
        <span class="color-swatch" style="background:${color}"></span>
        <span class="adv-party-name" title="${advEscape(p.name)}">${advEscape(p.siglas || p.name)}</span>
        ${p.blockedReason ? `<span class="adv-blocked-tag" title="No supera la barrera electoral">barrera ${advEscape(p.blockedReason)}</span>` : ''}
      </div></td>
      <td class="adv-num">${advNum(p.votes)}</td>
      <td class="adv-num">${advPct(p.pct)}</td>
      <td class="adv-num">${p.seats > 0 ? `<span class="adv-seat-badge" style="background:${color}">${p.seats}</span>` : '—'}</td>
      ${showReal ? `<td class="adv-num adv-real-delta ${p.seats > p.realSeats ? 'up' : p.seats < p.realSeats ? 'down' : ''}">${p.realSeats || '—'}</td>` : ''}
    </tr>`;
  };

  return `<div class="adv-district">
    <div class="adv-district-head">
      <span class="adv-district-name">${advEscape(d.name)}</span>
      <span class="adv-district-meta">${advNum(d.validVotes)} votos válidos${d.members.length > 1 ? ` · ${d.members.length} provincias` : ''}</span>
      <span class="adv-district-seats"><b>${d.seats}</b> ${advEscape(seatWord)}${showReal && realTotal !== d.seats ? ` · ${realTotal} reales` : ''}</span>
    </div>
    <div class="adv-district-table-scroll">
    <table>
      <thead><tr>
        <th>Candidatura</th>
        <th class="adv-num" style="width:20%">Votos</th>
        <th class="adv-num" style="width:13%">%</th>
        <th class="adv-num" style="width:14%">Esc.</th>
        ${showReal ? `<th class="adv-num" style="width:12%" title="Escaños reales según la hoja">Reales</th>` : ''}
      </tr></thead>
      <tbody>${shown.map(tr).join('') || `<tr><td colspan="5" class="adv-empty">Sin datos.</td></tr>`}</tbody>
    </table>
    </div>
    ${hidden > 0 ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▼ Ver ${hidden} candidatura${hidden === 1 ? '' : 's'} más</button>` : ''}
    ${expanded && !alwaysFull && rows.length > ADV_VISIBLE_ROWS ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▲ Ocultar</button>` : ''}
  </div>`;
}

/* ── Interacción ───────────────────────────────────────────── */

function advAttachResultHandlers() {
  selectAll('#adv-results .adv-ccaa-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const ccaa = btn.dataset.ccaa;
      const body = select(`#adv-results [data-ccaa-body="${CSS.escape(ccaa)}"]`);
      const open = _advCollapsed.has(ccaa);
      if (open) _advCollapsed.delete(ccaa); else _advCollapsed.add(ccaa);
      if (body) body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      const arrow = btn.querySelector('.adv-ccaa-arrow');
      if (arrow) arrow.textContent = open ? '▼' : '▶';
    });
  });

  selectAll('#adv-results .adv-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.district;
      if (_advExpandedDistricts.has(id)) _advExpandedDistricts.delete(id);
      else _advExpandedDistricts.add(id);
      advRenderResults();
    });
  });

  const expand = select('#adv-expand-all');
  const collapse = select('#adv-collapse-all');
  if (expand) expand.addEventListener('click', () => { _advCollapsed.clear(); advRenderResults(); });
  if (collapse) collapse.addEventListener('click', () => {
    _advResult.districts.forEach(d => _advCollapsed.add(d.ccaaName || d.name));
    advRenderResults();
  });
}

/* ── Inicialización ────────────────────────────────────────── */

function advInit() {
  advBuildElectionOptions();
  advBuildFormulaOptions();

  ['#adv-level', '#adv-formula', '#adv-b1-on', '#adv-b1-level', '#adv-b1-val',
   '#adv-b2-on', '#adv-b2-level', '#adv-b2-val', '#adv-blanco',
   '#adv-seats-mode', '#adv-total-seats', '#adv-min-seats', '#adv-reparto-base'
  ].forEach(sel => {
    const el = select(sel);
    if (el) el.addEventListener('change', advOnConfigChange);
  });

  select('#adv-reload')?.addEventListener('click', () => advLoadElection(true));
  select('#adv-election')?.addEventListener('change', () => advLoadElection(false));
  select('#adv-reset')?.addEventListener('click', () => {
    if (!_advParties) return;
    _advConfig = advDefaultConfig(_advParties.meta);
    advSyncConfigToForm();
    advRun();
  });
}

/** Carga perezosa: sólo se descargan los datos al abrir la pestaña. */
function advEnsureLoaded() {
  if (!_advLoaded && !_advLoading) advLoadElection(false);
}

document.addEventListener('DOMContentLoaded', advInit);
