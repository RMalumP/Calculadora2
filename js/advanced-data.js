/**
 * advanced-data.js
 * Descarga y parseo de datos electorales desde Google Sheets para la
 * Calculadora avanzada. Cada hoja del documento es una elección concreta.
 *
 * Disposición de la hoja: una única fila de cabecera y datos a partir de la
 * segunda. Los metadatos de la elección (país, tipo, circunscripción base y
 * barreras) son columnas repetidas en cada fila, y cada candidatura ocupa un
 * trío de columnas: votos, nombre y siglas.
 *
 * Esa disposición evita el problema que tenía la anterior: el endpoint JSON de
 * Google asigna un tipo a cada columna y convierte en null el texto que no
 * encaje, así que el nombre de un partido escrito en la cabecera de una
 * columna de votos (numérica) se perdía. Ahora los nombres viajan en columnas
 * de texto propias y llegan intactos.
 */

const ADV_SHEET_ID = '1pjggxoPWBxMo9HSN0kVo-HFPvMxYj1g7x8-AMlu6rCM';

// Se incrementa con cada cambio relevante del parser. Sirve para comprobar a
// simple vista, desde el panel de diagnóstico o la consola, si el navegador
// está sirviendo una versión en caché de este archivo.
const ADV_PARSER_VERSION = '2025-columnas-por-partido';
console.log('[Calculadora avanzada] advanced-data.js versión', ADV_PARSER_VERSION);

/**
 * Registro de hojas (elecciones) disponibles.
 * Para añadir una nueva hoja en el futuro: abre su pestaña en Google Sheets,
 * copia el número "gid=" de la URL y añade una entrada aquí.
 */
const ADV_ELECTIONS = [
  { key: 'default', label: 'Generales · Congreso', gid: null }
];

/** Cabecera → campo. La clave es el texto normalizado (sin tildes ni mayúsculas). */
const ADV_HEADER_MAP = {
  'ano eleccion':                  'anio',
  'mes eleccion':                  'mes',
  'dia eleccion':                  'dia',
  'pais':                          'pais',
  'tipo de eleccion':              'tipoEleccion',
  'circuscripcion base':           'circBase',
  'circunscripcion base':          'circBase',
  'barrera electoral 1':           'barrera1Nivel',
  'porcentaje barerra electoral 1':'barrera1Valor',
  'porcentaje barrera electoral 1':'barrera1Valor',
  'barrera electoral 2':           'barrera2Nivel',
  'porcentaje barerra electoral 2':'barrera2Valor',
  'porcentaje barrera electoral 2':'barrera2Valor',
  'nombre de comunidad':           'ccaaName',
  'nombre de provincia':           'provName',
  'numero diputados por provincia':'seatsBase',
  'poblacion':                     'poblacion',
  'numero de mesas':               'mesas',
  'censo electoral sin cera':      'censoSinCera',
  'censo cera':                    'censoCera',
  'total censo electoral':         'censoTotal',
  'total votantes cer':            'votantesCer',
  'total votantes cera':           'votantesCera',
  'total votantes':                'votantesTotal',
  'votos validos':                 'votosValidos',
  'votos a candidaturas':          'votosCandidaturas',
  'votos en blanco':               'votosBlanco',
  'votos nulos':                   'votosNulos',
};

/** Cabeceras que abren y componen el trío de columnas de cada candidatura. */
const ADV_PARTY_HEADERS = { votos: 'votos', nombre: 'partido', siglas: 'siglas partido' };

let _advCache = {};

/* ── Helpers de texto y celdas ─────────────────────────────── */

function _advNormalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _advParsePercent(str) {
  if (str == null || str === '') return 0;
  const txt = String(str).trim();
  const n = parseFloat(txt.replace('%', '').replace(',', '.'));
  if (isNaN(n)) return 0;
  // Google puede devolver un porcentaje ya dividido (0,05 en vez de "5%").
  return !txt.includes('%') && n > 0 && n <= 1 ? n * 100 : n;
}

/** Detecta un nivel territorial (provincia/ccaa/nacional) en un texto libre. */
function _advDetectLevel(str) {
  const n = _advNormalize(str);
  if (!n || n === 'no' || n.startsWith('no ') || n.startsWith('sin ') || n.startsWith('ninguna')) return null;
  if (n.includes('provin')) return 'provincia';
  if (n.includes('ccaa') || n.includes('comunidad') || n.includes('autonom')) return 'ccaa';
  if (n.includes('nacion') || n.includes('estat') || n.includes('pais')) return 'nacional';
  return null;
}

function _advCellObj(rows, r, c) {
  return (rows[r] && rows[r].c && rows[r].c[c]) || null;
}

/** Valor de texto de una celda (prioriza el formato mostrado, ej. "5%"). */
function _advCellText(rows, r, c) {
  if (c == null) return '';
  const o = _advCellObj(rows, r, c);
  if (!o) return '';
  if (o.f != null) return String(o.f).trim();
  return o.v == null ? '' : String(o.v).trim();
}

/** Valor numérico crudo de una celda (ignora formato con separadores de miles). */
function _advCellNum(rows, r, c) {
  if (c == null) return 0;
  const o = _advCellObj(rows, r, c);
  if (!o || o.v == null) return 0;
  if (typeof o.v === 'number') return o.v;
  return parseInt(String(o.v).replace(/[^\d-]/g, ''), 10) || 0;
}

/* ── Descarga desde Google Sheets ──────────────────────────── */

let _advJsonpSeq = 0;

/** Plazo máximo de espera de la respuesta de Google Sheets, en milisegundos. */
let ADV_FETCH_TIMEOUT_MS = 20000;

/**
 * Carga la hoja mediante JSONP (etiqueta <script>).
 *
 * El endpoint gviz de Google no envía cabeceras CORS, así que fetch() falla
 * al abrir el archivo desde el disco (origen "null") o desde cualquier
 * dominio distinto. JSONP es el mecanismo para el que está diseñado —de ahí
 * que envuelva la respuesta en google.visualization.Query.setResponse()— y
 * funciona igual con file:// que servido desde un dominio.
 */
function advFetchTable(gid, opts = {}) {
  const { headers = 1, timeoutMs = ADV_FETCH_TIMEOUT_MS } = opts;
  return new Promise((resolve, reject) => {
    const cb = `_advGvizCb${Date.now()}_${_advJsonpSeq++}`;
    const url = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/gviz/tq` +
                `?tqx=out:json;responseHandler:${cb}` +
                (gid != null ? `&gid=${encodeURIComponent(gid)}` : '') +
                `&headers=${encodeURIComponent(headers)}`;

    const script = document.createElement('script');
    let settled = false;

    const NOT_PUBLIC =
      'Google Sheets no ha devuelto datos. Lo más habitual es que la hoja no sea pública: ' +
      'ábrela, pulsa «Compartir» y en «Acceso general» elige «Cualquier usuario que tenga el enlace» con permiso de Lector.';

    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const fail = msg => { if (settled) return; settled = true; cleanup(); reject(new Error(msg)); };

    // Si la hoja no es pública, Google devuelve una página de acceso en HTML.
    // La etiqueta la descarga y dispara "load", pero nunca llega a invocar el
    // callback: eso avisa al instante sin esperar al plazo.
    script.onload = () => setTimeout(() => fail(NOT_PUBLIC), 0);
    const timer = setTimeout(() => fail(NOT_PUBLIC), timeoutMs);

    window[cb] = payload => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!payload || payload.status === 'error') {
        const err = payload?.errors?.[0];
        return reject(new Error(
          err?.detailed_message?.replace(/<[^>]*>/g, '') || err?.message || 'Error al leer la hoja de cálculo.'
        ));
      }
      if (!payload.table) return reject(new Error('La respuesta de Google Sheets no contiene ninguna tabla.'));
      resolve(payload.table);
    };

    script.onerror = () => fail(
      'No se pudo contactar con Google Sheets. Comprueba tu conexión a internet ' +
      'y que ninguna extensión del navegador esté bloqueando docs.google.com.'
    );

    script.src = url;
    document.head.appendChild(script);
  });
}

/* ── Parseo de la hoja a un modelo normalizado ─────────────── */

/**
 * Texto de cabecera de una columna. Con headers=1 Google mueve la fila de
 * cabecera a cols[].label; si la tabla llega en crudo (CSV, pruebas) la
 * cabecera sigue siendo la primera fila.
 */
function _advHeaderReader(table) {
  const cols = table?.cols || [];
  const rows = table?.rows || [];
  const labelsLookUseful = cols.some(c => String(c?.label ?? '').trim());
  return c => labelsLookUseful
    ? _advNormalize(cols[c]?.label ?? '')
    : _advNormalize(_advCellText(rows, 0, c));
}

/**
 * Nombre y siglas de una candidatura, por mayoría entre todas las filas.
 *
 * No basta con mirar una fila: la hoja puede arrastrar el texto de la
 * cabecera ("Partido", "Siglas partido") a algunas celdas, o dejarlas
 * vacías. El valor correcto es el que más se repite descartando esos casos.
 */
function _advMajorityText(rows, col, headerTexts) {
  const counts = new Map();
  rows.forEach((_, r) => {
    const v = _advCellText(rows, r, col);
    if (!v || headerTexts.includes(_advNormalize(v))) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  let best = '', bestN = 0;
  counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
  return best;
}

function advParseTable(table) {
  const allRows = table?.rows || [];
  const cols = table?.cols || [];
  const header = _advHeaderReader(table);

  let numCols = cols.length;
  allRows.forEach(r => { if (r?.c?.length > numCols) numCols = r.c.length; });

  // Con la tabla en crudo la primera fila es la cabecera y no es un dato.
  const labelsUseful = cols.some(c => String(c?.label ?? '').trim());
  const rows = labelsUseful ? allRows : allRows.slice(1);

  /* ── Columnas ── */

  const metaCols = {};
  const parties = [];
  const headerTexts = [];

  for (let c = 0; c < numCols; c++) {
    const h = header(c);
    headerTexts.push(h);

    // Cada candidatura abre con "Votos" y ocupa además "Partido" y "Siglas".
    if (h === ADV_PARTY_HEADERS.votos) {
      parties.push({ votesCol: c, nameCol: c + 1, siglasCol: c + 2 });
      continue;
    }
    if (h === ADV_PARTY_HEADERS.nombre || h === ADV_PARTY_HEADERS.siglas) continue;

    // "Código de Provincia" aparece dos veces: la de comunidad y la de
    // provincia. Se distinguen por la columna de nombre que va a su derecha.
    if (h.includes('codigo') && (h.includes('provincia') || h.includes('comunidad'))) {
      const next = header(c + 1);
      if (next.includes('comunidad') || next.includes('autonom')) metaCols.ccaaCode = c;
      else metaCols.provCode = c;
      continue;
    }
    if (ADV_HEADER_MAP[h] !== undefined && metaCols[ADV_HEADER_MAP[h]] === undefined) {
      metaCols[ADV_HEADER_MAP[h]] = c;
    }
  }

  // Se resuelven los nombres una sola vez, no por fila.
  const headerLiterals = [ADV_PARTY_HEADERS.nombre, ADV_PARTY_HEADERS.siglas, ADV_PARTY_HEADERS.votos];
  parties.forEach((p, i) => {
    p.name   = _advMajorityText(rows, p.nameCol, headerLiterals);
    p.siglas = _advMajorityText(rows, p.siglasCol, headerLiterals);
    if (!p.name && !p.siglas) p.name = `Candidatura ${i + 1}`;
    p.key = p.siglas || p.name;
  });

  /* ── Filas de datos ── */

  // Se reconocen por contenido, no por posición: así sobra saber cuántas
  // filas de cabecera haya consumido Google.
  const dataRows = [];
  for (let r = 0; r < rows.length; r++) {
    const anio = _advCellNum(rows, r, metaCols.anio);
    const provName = _advCellText(rows, r, metaCols.provName);
    if (!(anio >= 1800 && anio <= 2200) || !provName) continue;

    dataRows.push({
      anio: String(anio),
      mes:  _advCellText(rows, r, metaCols.mes),
      dia:  _advCellText(rows, r, metaCols.dia),
      ccaaCode: _advCellText(rows, r, metaCols.ccaaCode),
      ccaaName: _advCellText(rows, r, metaCols.ccaaName),
      provCode: _advCellText(rows, r, metaCols.provCode),
      provName,
      seatsBase:     _advCellNum(rows, r, metaCols.seatsBase),
      poblacion:     _advCellNum(rows, r, metaCols.poblacion),
      censoTotal:    _advCellNum(rows, r, metaCols.censoTotal),
      votantesTotal: _advCellNum(rows, r, metaCols.votantesTotal),
      votosValidos:  _advCellNum(rows, r, metaCols.votosValidos),
      votosBlanco:   _advCellNum(rows, r, metaCols.votosBlanco),
      votosNulos:    _advCellNum(rows, r, metaCols.votosNulos),
      parties: parties.map(p => ({
        key: p.key, name: p.name, siglas: p.siglas,
        votes: _advCellNum(rows, r, p.votesCol),
        realSeats: 0
      }))
    });
  }

  /* ── Metadatos de la elección (columnas repetidas en cada fila) ── */

  const firstDataRowIdx = rows.findIndex((_, r) => {
    const anio = _advCellNum(rows, r, metaCols.anio);
    return anio >= 1800 && anio <= 2200 && !!_advCellText(rows, r, metaCols.provName);
  });
  const metaAt = key => firstDataRowIdx < 0 ? '' : _advCellText(rows, firstDataRowIdx, metaCols[key]);

  const level = _advDetectLevel(metaAt('circBase')) || 'provincia';
  // El nivel de una barrera se expresa respecto a la circunscripción: si la
  // hoja indica el mismo ámbito, es una barrera de circunscripción.
  const asBarrierLevel = l => (!l || l === level) ? 'circunscripcion' : l;

  const meta = {
    tipo:    'Generales',
    subtipo: metaAt('tipoEleccion') || '',
    pais:    metaAt('pais') || 'España',
    circunscripcionDefault: level,
    barrera1: {
      nivel: asBarrierLevel(_advDetectLevel(metaAt('barrera1Nivel'))),
      valor: _advParsePercent(metaAt('barrera1Valor'))
    },
    barrera2: null
  };
  const b2 = _advDetectLevel(metaAt('barrera2Nivel'));
  if (b2) meta.barrera2 = { nivel: asBarrierLevel(b2), valor: _advParsePercent(metaAt('barrera2Valor')) };

  const debug = {
    parserVersion: ADV_PARSER_VERSION,
    totalRowsFromSheet: allRows.length,
    numCols,
    headerFromLabels: labelsUseful,
    metaCols: { ...metaCols },
    numParties: parties.length,
    partySample: parties.slice(0, 4).map(p => `${p.siglas || '—'} / ${p.name} (col ${p.votesCol})`),
    headerRowTexts: headerTexts.filter(Boolean),
    numDataRowsScanned: rows.length
  };

  return {
    meta,
    parties: parties.map(p => ({ key: p.key, name: p.name, siglas: p.siglas })),
    rows: dataRows,
    debug
  };
}

/* ── API pública con caché en memoria ──────────────────────── */

async function advGetElectionData(electionKey) {
  if (_advCache[electionKey]) return _advCache[electionKey];
  const cfg = ADV_ELECTIONS.find(e => e.key === electionKey) || ADV_ELECTIONS[0];
  const data = advParseTable(await advFetchTable(cfg.gid));
  _advCache[electionKey] = data;
  return data;
}

function advClearCache() {
  _advCache = {};
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { advParseTable, advFetchTable, advGetElectionData, advClearCache, ADV_ELECTIONS };
}
