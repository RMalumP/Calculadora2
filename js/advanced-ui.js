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

/**
 * Cambios hechos en esta sesión sobre los datos de la hoja.
 * Estructura: { [idCircunscripcion]: { seats?: número, votes: { [partido]: número } } }
 * Viven sólo en memoria: no se envían a Google Sheets ni alteran la hoja.
 * Se indexan por circunscripción, así que cada nivel (provincia, comunidad o
 * estatal) conserva sus propios cambios.
 */
let _advEdits = {};
let _advEditMode = false;
let _advLoading = false;
let _advLoaded  = false;

const ADV_MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function advMesLabel(mes) {
  const n = parseInt(mes, 10);
  return ADV_MESES[n] || (mes ? String(mes) : '');
}

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

  // Los cambios de sesión se refieren a los datos que se van a sustituir.
  _advEdits = {};
  const key = select('#adv-election')?.value || ADV_ELECTIONS[0].key;
  advRenderStatus(`<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos electorales desde Google Sheets…</div>`);
  select('#adv-results').innerHTML = '';
  select('#adv-summary').innerHTML = '';

  try {
    _advParties = await advGetElectionData(key);
    _advLoaded = true;

    if (!_advParties.rows.length) {
      advRenderStatus(advNoRowsDiagnostic(_advParties.debug));
      return;
    }

    const defaultYearKey = advBuildYearSelect(_advParties);
    _advConfig = advDefaultConfig(_advParties.meta);
    _advConfig.yearKey = defaultYearKey;
    advSyncConfigToForm();
    advRun();
  } catch (err) {
    _advLoaded = false;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/edit`;
    advRenderStatus(
      `<div class="adv-notice error">
         <strong>No se pudieron cargar los datos.</strong><br>${advEscape(err.message)}
       </div>
       <div class="adv-notice info">
         <a href="${sheetUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">Abrir la hoja de cálculo</a>
         para revisar los permisos, y después
         <button type="button" id="adv-retry" class="adv-mini-btn" style="border-color:var(--border);color:var(--accent)">Reintentar</button>
       </div>`
    );
    select('#adv-retry')?.addEventListener('click', () => advLoadElection(true));
    updateText(select('#adv-subtitle'), 'Sin datos cargados');
  } finally {
    _advLoading = false;
  }
}

/**
 * Diagnóstico para cuando la hoja se lee pero no se detecta ninguna fila de
 * datos: probablemente el parser no ha reconocido alguna columna clave.
 * Muestra lo que sí ha detectado para poder corregirlo sin volver a
 * adivinar a ciegas la estructura de la hoja.
 */
function advNoRowsDiagnostic(debug) {
  const cols = debug?.metaCols || {};
  const need = { provName: 'Nombre de provincia', ccaaName: 'Nombre de comunidad', seatsBase: 'Nº diputados/circunscripción' };
  const rowsOk = [], rowsMissing = [];
  Object.entries(need).forEach(([k, label]) => (cols[k] !== undefined ? rowsOk : rowsMissing).push(label));

  const scanTable = (debug?.rowScan || []).map(s =>
    `fila gviz #${s.row} (×"votos"=${s.votosCount}): ${s.preview.map(advEscape).join(' | ')}`
  ).join('\n');

  return `<div class="adv-notice error">
    <strong>La hoja se ha leído, pero no se ha detectado ninguna fila de datos.</strong><br>
    ${debug && !debug.headerRowFound
      ? 'No se ha encontrado ninguna fila con celdas de texto "Votos", así que no se ha podido localizar la cabecera de la tabla de partidos.'
      : rowsMissing.length
      ? `No se ha reconocido la columna de cabecera para: <strong>${rowsMissing.map(advEscape).join(', ')}</strong>.
         Revisa el texto de esas columnas en la fila de cabecera detectada más abajo.`
      : 'Todas las columnas clave se han reconocido, pero ninguna fila después de la cabecera tiene texto en la columna de provincia.'}
  </div>
  <details class="adv-notice info" style="cursor:pointer" open>
    <summary style="cursor:pointer;font-weight:700">Ver diagnóstico técnico</summary>
    <div style="margin-top:8px;font-family:monospace;font-size:0.72rem;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6">Versión del parser: ${ADV_PARSER_VERSION}
Filas totales recibidas de Google Sheets: ${debug?.totalRowsFromSheet ?? '?'}
Cabecera encontrada por contenido ("Votos"): ${debug?.headerRowFound ? 'sí' : 'no (se usó la fila de reserva 5)'}
Fila de cabecera usada: índice gviz ${debug?.headerRowIndex ?? '?'}

Primeras filas devueltas por Google Sheets (índice gviz, no el número de fila que ves en Sheets):
${scanTable || '(sin datos)'}

Columnas leídas en la fila de cabecera: ${(debug?.headerRowTexts || []).map(advEscape).join(' | ') || '(ninguna)'}
Columnas identificadas: ${JSON.stringify(cols)}
Filas de datos exploradas tras la cabecera: ${debug?.numDataRowsScanned ?? '?'}</div>
  </details>`;
}

function advRenderStatus(html) {
  const el = select('#adv-status');
  if (el) el.innerHTML = html;
}

/**
 * Convocatorias distintas presentes en la hoja: una hoja puede mezclar filas
 * de más de una elección real (p. ej. dos convocatorias del mismo año, como
 * abril y noviembre de 2019), así que se agrupa por año+mes y se deduplica
 * para que el desplegable muestre una única entrada por convocatoria, no una
 * por cada fila/provincia.
 */
function advElectionDates(data) {
  const map = new Map();
  data.rows.forEach(r => {
    if (!r.anio) return;
    const key = `${r.anio}|${r.mes || ''}`;
    if (!map.has(key)) map.set(key, { key, anio: r.anio, mes: r.mes || '' });
  });
  return [...map.values()].sort((a, b) =>
    String(a.anio).localeCompare(String(b.anio), 'es', { numeric: true }) ||
    (parseInt(a.mes, 10) || 0) - (parseInt(b.mes, 10) || 0));
}

/** Repuebla el desplegable de convocatoria y devuelve la clave a seleccionar por defecto. */
function advBuildYearSelect(data) {
  const dates = advElectionDates(data);
  const sel = select('#adv-year');
  if (!sel) return dates[dates.length - 1]?.key || '';

  const sameYear = new Map();
  dates.forEach(d => sameYear.set(d.anio, (sameYear.get(d.anio) || 0) + 1));

  sel.innerHTML = '';
  dates.forEach(d => {
    const o = document.createElement('option');
    o.value = d.key;
    const mesLabel = advMesLabel(d.mes);
    o.textContent = (sameYear.get(d.anio) > 1 && mesLabel)
      ? `${d.anio} (${mesLabel})`
      : String(d.anio);
    sel.appendChild(o);
  });

  updateText(select('#adv-year-hint'),
    dates.length > 1
      ? 'Esta hoja incluye más de una convocatoria; elige cuál calcular.'
      : 'Esta hoja sólo contiene esta convocatoria.');
  setDisplay(select('#adv-year-field'), true);
  sel.disabled = dates.length <= 1;

  return dates[dates.length - 1]?.key || '';
}

function advUpdateHeader(rows) {
  const m = _advParties?.meta;
  if (!m) return;
  const partes = [m.tipo, m.subtipo].filter(Boolean).join(' · ');
  const first = rows[0];
  const fecha = first ? [first.anio, advMesLabel(first.mes)].filter(Boolean).join(' de ') : '';
  updateText(select('#adv-subtitle'),
    `${partes}${m.pais ? ' · ' + m.pais.charAt(0).toUpperCase() + m.pais.slice(1) : ''}${fecha ? ' · ' + fecha : ''} · ` +
    `${rows.length} circunscripciones de origen · ${_advParties.parties.length} candidaturas`);
}

/** Filas de la elección seleccionada en el desplegable de convocatoria. */
function advSelectedRows() {
  const key = _advConfig?.yearKey;
  if (!key) return _advParties.rows;
  const filtered = _advParties.rows.filter(r => `${r.anio}|${r.mes || ''}` === key);
  return filtered.length ? filtered : _advParties.rows;
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
  if (c.yearKey) select('#adv-year').value = c.yearKey;
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
    yearKey: select('#adv-year')?.value || '',
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

/* ── Secciones plegables del panel de configuración ────────── */

const ADV_LEVEL_LABEL = { provincia: 'Provincial', ccaa: 'Autonómica', nacional: 'Estatal' };
const ADV_BARRIER_LABEL = { circunscripcion: 'circunscripción', ccaa: 'comunidad', nacional: 'nacional' };

/** Abre o pliega una sección de configuración. */
function advToggleSection(section, open) {
  const willOpen = open !== undefined ? open : !section.classList.contains('open');
  section.classList.toggle('open', willOpen);
}

/** Resumen de una línea con el estado de cada sección, visible al plegarla. */
function advUpdateSummaries() {
  const c = _advConfig;
  if (!c) return;

  const yearSel = select('#adv-year');
  updateText(select('#adv-sum-eleccion'),
    [select('#adv-election')?.selectedOptions[0]?.textContent, yearSel?.selectedOptions[0]?.textContent]
      .filter(Boolean).join(' · ') || '—');

  const formulaName = FORMULAS.find(f => f.id === c.formula)?.name || c.formula;
  updateText(select('#adv-sum-reparto'), `${ADV_LEVEL_LABEL[c.circunscripcion] || c.circunscripcion} · ${formulaName}`);

  const barreras = [];
  if (c.barrera1.activa) barreras.push(`${c.barrera1.valor}% ${ADV_BARRIER_LABEL[c.barrera1.nivel] || ''}`.trim());
  if (c.barrera2.activa) barreras.push(`${c.barrera2.valor}% ${ADV_BARRIER_LABEL[c.barrera2.nivel] || ''}`.trim());
  updateText(select('#adv-sum-barreras'), barreras.length ? barreras.join(' + ') : 'Sin barrera');

  const seatsTxt = c.seatsMode === 'custom'
    ? `${c.totalSeats} personalizados · mín. ${c.minPorCircunscripcion}`
    : `${_advResult?.summary?.totalSeats ?? '—'} según la hoja`;
  updateText(select('#adv-sum-escanos'), seatsTxt);
}

/** Conecta el plegado de todas las secciones de configuración. */
function advInitSections() {
  selectAll('.adv-cfg').forEach(section => {
    section.querySelector('.adv-cfg-toggle')?.addEventListener('click', () => advToggleSection(section));
  });

  select('#adv-cfg-collapse')?.addEventListener('click', () => {
    const anyOpen = selectAll('.adv-cfg').some(s => s.classList.contains('open'));
    selectAll('.adv-cfg').forEach(s => advToggleSection(s, !anyOpen));
    updateText(select('#adv-cfg-collapse'), anyOpen ? 'Abrir todo' : 'Plegar todo');
  });
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
  const rows = advSelectedRows();
  advUpdateHeader(rows);
  try {
    _advResult = advCalculate({ ..._advParties, rows }, _advConfig, _advEdits);
  } catch (err) {
    advRenderStatus(`<div class="adv-notice error"><strong>Error al calcular.</strong><br>${advEscape(err.message)}</div>`);
    return;
  }
  advRenderStatus(_advResult.warnings.map(w =>
    `<div class="adv-notice warn"><strong>Aviso sobre los datos de origen:</strong> ${advEscape(w)}</div>`).join(''));
  advComputePristine();
  advRenderSummary();
  advRenderResults();
  advUpdateSummaries();
  advRefreshEditBar();
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

/**
 * La agrupación sigue al nivel de circunscripción elegido:
 *  - provincial: cada comunidad agrupa sus provincias.
 *  - autonómica: cada comunidad es ya una circunscripción, así que se
 *    muestra directamente, sin anidar un grupo de un solo elemento.
 *  - estatal: una única circunscripción, sin agrupar.
 */
function advDistrictsCard() {
  const r = _advResult;
  const level = _advConfig.circunscripcion;

  if (level === 'nacional') {
    return `<div class="card">
      <div class="card-header"><span class="dot"></span>Circunscripción estatal única</div>
      <div style="padding:10px 12px">${advDistrictHTML(r.districts[0], true)}</div>
    </div>`;
  }

  // A nivel autonómico cada circunscripción es su propia comunidad; a nivel
  // provincial se agrupan por nombre de comunidad (los códigos pueden tener
  // erratas en la hoja).
  const groups = new Map();
  r.districts.forEach(d => {
    const k = level === 'ccaa' ? d.name : (d.ccaaName || d.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  const body = [...groups.entries()].map(([ccaa, ds]) => {
    const seats = ds.reduce((s, d) => s + d.seats, 0);
    const votes = ds.reduce((s, d) => s + d.validVotes, 0);
    const open  = !_advCollapsed.has(ccaa);

    // Composición de escaños de la comunidad para la barra apilada.
    const comp = new Map();
    ds.forEach(d => d.results.forEach(p => {
      if (p.seats > 0) comp.set(p.key, { p, seats: (comp.get(p.key)?.seats || 0) + p.seats });
    }));
    const stack = [...comp.values()].sort((a, b) => b.seats - a.seats)
      .map(x => `<span style="width:${(x.seats / Math.max(1, seats) * 100).toFixed(2)}%;background:${advPartyColor(x.p)}" title="${advEscape(x.p.siglas || x.p.name)}: ${x.seats}"></span>`).join('');

    // Con circunscripción autonómica el grupo ya es la circunscripción: su
    // cuerpo es la tabla de resultados, no otra ficha anidada.
    const inner = level === 'ccaa'
      ? `<div style="padding:6px 10px 10px">${advDistrictHTML(ds[0], true, true)}</div>`
      : ds.map(d => advDistrictHTML(d, false)).join('');

    const nProv = ds.reduce((s2, d) => s2 + (d.members?.length || 1), 0);
    const meta = level === 'ccaa'
      ? `${nProv} provincia${nProv === 1 ? '' : 's'} agrupadas`
      : `${ds.length} circunscripci${ds.length === 1 ? 'ón' : 'ones'}`;

    return `<div class="adv-ccaa">
      <button class="adv-ccaa-header" data-ccaa="${advEscape(ccaa)}" aria-expanded="${open}">
        <span class="adv-ccaa-arrow">${open ? '▼' : '▶'}</span>
        <span class="adv-ccaa-name">${advEscape(ccaa)}</span>
        <span class="adv-ccaa-meta">${advEscape(meta)}</span>
        <span class="adv-ccaa-seats">
          <span class="adv-stack">${stack}</span>
          <span class="adv-ccaa-stat">${advNum(votes)} votos</span>
          <span class="adv-ccaa-stat"><b>${seats}</b> esc.</span>
        </span>
      </button>
      <div class="adv-ccaa-body" data-ccaa-body="${advEscape(ccaa)}" ${open ? '' : 'hidden'}>
        ${inner}
      </div>
    </div>`;
  }).join('');

  const title = level === 'ccaa'
    ? 'Resultados por comunidad autónoma'
    : 'Resultados por provincia, agrupados por comunidad';

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>${title}
      <span class="adv-toolbar">
        <button class="adv-mini-btn" id="adv-expand-all">Expandir todo</button>
        <button class="adv-mini-btn" id="adv-collapse-all">Colapsar todo</button>
      </span>
    </div>
    ${body}
  </div>`;
}

const ADV_VISIBLE_ROWS = 6;

function advDistrictHTML(d, alwaysFull, hideHead) {
  const expanded = alwaysFull || _advExpandedDistricts.has(d.id);
  const rows = d.results;
  // Se muestran siempre las candidaturas con escaño y las bloqueadas por barrera
  // que habrían tenido opciones; el resto queda tras el desplegable.
  const primary = rows.filter(p => p.seats > 0);
  const rest    = rows.filter(p => p.seats === 0);
  const shown   = (expanded || _advEditMode) ? rows : [...primary, ...rest.slice(0, Math.max(0, ADV_VISIBLE_ROWS - primary.length))];
  const hidden  = rows.length - shown.length;

  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const realTotal = [...d.realSeats.values()].reduce((a, b) => a + b, 0);
  const showReal  = _advConfig.seatsMode === 'sheet' && realTotal > 0;

  const edited = _advEdits[d.id] || {};

  const tr = p => {
    const color = advPartyColor(p);
    const cls = p.blockedReason ? 'adv-blocked' : p.seats === 0 ? 'adv-noseat' : '';
    const isEdited = edited.votes && edited.votes[p.key] !== undefined;
    const votesCell = _advEditMode
      ? `<input type="number" class="adv-edit-votes${isEdited ? ' changed' : ''}" min="0" step="1"
                value="${p.votes}" data-district="${advEscape(d.id)}" data-party="${advEscape(p.key)}"
                aria-label="Votos de ${advEscape(p.siglas || p.name)} en ${advEscape(d.name)}">`
      : advNum(p.votes);
    return `<tr class="${cls}${isEdited ? ' adv-row-edited' : ''}">
      <td><div class="adv-party-cell">
        <span class="color-swatch" style="background:${color}"></span>
        <span class="adv-party-name" title="${advEscape(p.name)}">${advEscape(p.siglas || p.name)}</span>
        ${p.blockedReason ? `<span class="adv-blocked-tag" title="No supera la barrera electoral">barrera ${advEscape(p.blockedReason)}</span>` : ''}
      </div></td>
      <td class="adv-num">${votesCell}</td>
      <td class="adv-num">${advPct(p.pct)}</td>
      <td class="adv-num">${p.seats > 0 ? `<span class="adv-seat-badge" style="background:${color}">${p.seats}</span>` : '—'}</td>
      ${showReal ? `<td class="adv-num adv-real-delta ${p.seats > p.realSeats ? 'up' : p.seats < p.realSeats ? 'down' : ''}">${p.realSeats || '—'}</td>` : ''}
    </tr>`;
  };

  // Con circunscripción autonómica la cabecera del grupo ya da nombre, votos
  // y escaños: repetirlos aquí sería ruido.
  const seatsEdited = edited.seats != null;
  const seatsCell = _advEditMode
    ? `<label class="adv-edit-seats-wrap">
         <input type="number" class="adv-edit-seats${seatsEdited ? ' changed' : ''}" min="0" step="1"
                value="${d.seats}" data-district="${advEscape(d.id)}"
                aria-label="Escaños de ${advEscape(d.name)}">
         <span>${advEscape(seatWord)}</span>
       </label>`
    : `<b>${d.seats}</b> ${advEscape(seatWord)}${showReal && realTotal !== d.seats ? ` · ${realTotal} reales` : ''}`;

  const head = hideHead ? '' : `<div class="adv-district-head">
      <span class="adv-district-name">${advEscape(d.name)}</span>
      <span class="adv-district-meta">${advNum(d.validVotes)} votos válidos${d.members.length > 1 ? ` · ${d.members.length} provincias` : ''}</span>
      <span class="adv-district-seats">${seatsCell}</span>
    </div>`;

  // Con la tabla editable conviene ver el total de lo que se está tocando.
  const sumVotes = shown.reduce((a, p) => a + p.votes, 0);
  const sumSeats = shown.reduce((a, p) => a + p.seats, 0);
  const foot = _advEditMode ? `<tfoot><tr class="adv-edit-total">
      <td>Total mostrado</td>
      <td class="adv-num">${advNum(sumVotes)}</td>
      <td class="adv-num">${advPct(d.validVotes > 0 ? sumVotes / d.validVotes * 100 : 0)}</td>
      <td class="adv-num">${sumSeats} / ${d.seats}</td>
      ${showReal ? '<td></td>' : ''}
    </tr></tfoot>` : '';

  return `<div class="adv-district">
    ${head}
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
      ${foot}
    </table>
    </div>
    ${hidden > 0 ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▼ Ver ${hidden} candidatura${hidden === 1 ? '' : 's'} más</button>` : ''}
    ${expanded && !alwaysFull && rows.length > ADV_VISIBLE_ROWS ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▲ Ocultar</button>` : ''}
  </div>`;
}

/* ── Edición de los datos de la sesión ─────────────────────── */

/** Nº de valores cambiados respecto a la hoja. */
function advCountEdits() {
  return Object.values(_advEdits).reduce((n, e) =>
    n + (e.seats != null ? 1 : 0) + Object.keys(e.votes || {}).length, 0);
}

function advEditsFor(districtId) {
  if (!_advEdits[districtId]) _advEdits[districtId] = { votes: {} };
  if (!_advEdits[districtId].votes) _advEdits[districtId].votes = {};
  return _advEdits[districtId];
}

/** Refresca la barra superior: contador de cambios y botón de restaurar. */
function advRefreshEditBar() {
  const n = advCountEdits();
  const badge = select('#adv-edit-badge');
  const reset = select('#adv-edit-reset');
  const toggle = select('#adv-edit-toggle');
  const bar = select('#adv-editbar');

  if (badge) {
    badge.hidden = n === 0;
    updateText(badge, `${n} valor${n === 1 ? '' : 'es'} modificado${n === 1 ? '' : 's'}`);
  }
  if (reset) reset.hidden = n === 0;
  if (toggle) toggle.innerHTML = _advEditMode
    ? '<span class="adv-edit-icon">✓</span> Terminar edición'
    : '<span class="adv-edit-icon">✎</span> Editar datos';
  toggleClass(toggle, 'active', _advEditMode);
  toggleClass(bar, 'editing', _advEditMode);
  updateText(select('#adv-edit-note'), _advEditMode
    ? 'Cambia los votos de cada candidatura o los escaños de cada circunscripción: el reparto se recalcula al momento.'
    : 'Modifica votos y escaños de cada circunscripción. Los cambios son sólo de esta sesión: no tocan la hoja de datos.');
}

/**
 * Aplica un valor editado y recalcula. Si coincide con el de la hoja se
 * borra la anotación, para que el contador refleje sólo cambios reales.
 */
function advSetEdit(districtId, field, partyKey, rawValue) {
  const district = _advResult?.districts.find(x => x.id === districtId);
  if (!district) return;

  const value = Math.max(0, Math.round(Number(rawValue) || 0));
  const entry = advEditsFor(districtId);

  if (field === 'seats') {
    const original = advOriginalSeats(districtId);
    if (original != null && value === original) delete entry.seats;
    else entry.seats = value;
  } else {
    const original = advOriginalVotes(districtId, partyKey);
    if (original != null && value === original) delete entry.votes[partyKey];
    else entry.votes[partyKey] = value;
  }

  if (entry.seats == null && !Object.keys(entry.votes).length) delete _advEdits[districtId];
  advRun();
}

/**
 * Valores de la hoja, sin ninguna edición aplicada. Se recalculan aparte para
 * poder comparar y para restaurar valores sueltos.
 */
let _advPristine = null;

function advComputePristine() {
  if (!_advParties) { _advPristine = null; return; }
  try {
    _advPristine = advCalculate({ ..._advParties, rows: advSelectedRows() }, _advConfig, null);
  } catch (e) {
    _advPristine = null;
  }
}

function advOriginalSeats(districtId) {
  const d = _advPristine?.districts.find(x => x.id === districtId);
  return d ? d.seats : null;
}

function advOriginalVotes(districtId, partyKey) {
  const d = _advPristine?.districts.find(x => x.id === districtId);
  if (!d) return null;
  return d.partyVotes.get(partyKey) || 0;
}

function advToggleEditMode() {
  _advEditMode = !_advEditMode;
  advRefreshEditBar();
  advRenderResults();
}

function advResetEdits() {
  if (!advCountEdits()) return;
  if (!confirm('¿Descartar todos los cambios y volver a los datos de la hoja?')) return;
  _advEdits = {};
  advRun();
}

function advInitEditBar() {
  select('#adv-edit-toggle')?.addEventListener('click', advToggleEditMode);
  select('#adv-edit-reset')?.addEventListener('click', advResetEdits);
  advRefreshEditBar();
}

/* ── Interacción ───────────────────────────────────────────── */

function advAttachResultHandlers() {
  // Los campos editables recalculan al confirmar, no en cada tecla: al
  // recalcular se vuelve a dibujar la tabla y se perdería el foco.
  selectAll('#adv-results .adv-edit-votes').forEach(inp => {
    inp.addEventListener('change', () =>
      advSetEdit(inp.dataset.district, 'votes', inp.dataset.party, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  selectAll('#adv-results .adv-edit-seats').forEach(inp => {
    inp.addEventListener('change', () =>
      advSetEdit(inp.dataset.district, 'seats', null, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

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
  advInitSections();
  advInitEditBar();

  ['#adv-year', '#adv-level', '#adv-formula', '#adv-b1-on', '#adv-b1-level', '#adv-b1-val',
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
    const yearKey = select('#adv-year')?.value || '';
    _advConfig = advDefaultConfig(_advParties.meta);
    _advConfig.yearKey = yearKey;
    advSyncConfigToForm();
    advRun();
  });
}

/** Carga perezosa: sólo se descargan los datos al abrir la pestaña. */
function advEnsureLoaded() {
  if (!_advLoaded && !_advLoading) advLoadElection(false);
}

document.addEventListener('DOMContentLoaded', advInit);
