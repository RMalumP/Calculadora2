/**
 * advanced-data.js
 * Descarga y parseo de datos electorales desde Google Sheets para la
 * Calculadora avanzada. Cada hoja del documento es una elección concreta.
 */

const ADV_SHEET_ID = '1pjggxoPWBxMo9HSN0kVo-HFPvMxYj1g7x8-AMlu6rCM';

/**
 * Registro de hojas (elecciones) disponibles.
 * Para añadir una nueva hoja en el futuro: abre su pestaña en Google Sheets,
 * copia el número "gid=" de la URL y añade una entrada aquí.
 */
const ADV_ELECTIONS = [
  { key: 'default', label: 'Generales · Congreso', gid: null }
];

const ADV_HEADER_MAP = {
  'ano eleccion':               'anio',
  'mes eleccion':                'mes',
  'dia eleccion':                 'dia',
  'nombre de comunidad':          'ccaaName',
  'nombre de provincia':          'provName',
  'poblacion':                    'poblacion',
  'numero de mesas':              'mesas',
  'censo electoral sin cera':     'censoSinCera',
  'censo cera':                   'censoCera',
  'total censo electoral':        'censoTotal',
  'total votantes cer':           'votantesCer',
  'total votantes cera':          'votantesCera',
  'total votantes':               'votantesTotal',
  'votos validos':                'votosValidos',
  'votos a candidaturas':         'votosCandidaturas',
  'votos en blanco':              'votosBlanco',
  'votos nulos':                  'votosNulos',
};

let _advCache = {};

/* ── Helpers de texto y celdas ─────────────────────────────── */

function _advNormalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

function _advParsePercent(str) {
  if (str == null || str === '') return 0;
  const n = parseFloat(String(str).replace('%', '').replace(',', '.').trim());
  return isNaN(n) ? 0 : n;
}

/** Detecta un nivel territorial (provincia/ccaa/nacional) en un texto libre. */
function _advDetectLevel(str) {
  const n = _advNormalize(str);
  if (!n || n === 'no' || n.startsWith('no ') || n.startsWith('sin ') || n.startsWith('ninguna')) return null;
  if (n.includes('provin')) return 'provincia';
  if (n.includes('ccaa') || n.includes('comunidad') || n.includes('autonom')) return 'ccaa';
  if (n.includes('nacion') || n.includes('estat')) return 'nacional';
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
  return typeof o.v === 'number' ? o.v : (parseFloat(o.v) || 0);
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
function advFetchTable(gid, timeoutMs = ADV_FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const cb = `_advGvizCb${Date.now()}_${_advJsonpSeq++}`;
    const url = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/gviz/tq` +
                `?tqx=out:json;responseHandler:${cb}` +
                (gid != null ? `&gid=${encodeURIComponent(gid)}` : '');

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
    // La etiqueta la descarga igualmente y dispara "load", pero nunca llega a
    // invocar el callback: eso avisa al instante sin esperar al plazo.
    script.onload = () => setTimeout(() => fail(NOT_PUBLIC), 0);

    // Red de seguridad por si "load" no llega a dispararse.
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

function advParseTable(table) {
  const rows = table.rows || [];

  // El nivel de una barrera se expresa respecto a la circunscripción: si la hoja
  // indica el mismo ámbito que la circunscripción, es una barrera de circunscripción.
  const level = _advDetectLevel(_advCellText(rows, 2, 2)) || 'provincia';
  const asBarrierLevel = l => (!l || l === level || l === 'provincia') ? 'circunscripcion' : l;

  const meta = {
    tipo:    _advCellText(rows, 1, 0) || 'Generales',
    subtipo: _advCellText(rows, 3, 0) || '',
    pais:    _advCellText(rows, 4, 1) || 'España',
    circunscripcionDefault: level,
    barrera1: {
      nivel: asBarrierLevel(_advDetectLevel(_advCellText(rows, 0, 2))),
      valor: _advParsePercent(_advCellText(rows, 0, 3))
    },
    barrera2: null
  };
  const b2nivel = _advDetectLevel(_advCellText(rows, 1, 2));
  if (b2nivel) meta.barrera2 = { nivel: asBarrierLevel(b2nivel), valor: _advParsePercent(_advCellText(rows, 1, 3)) };

  const nameRow = 3, siglasRow = 4, headerRow = 5;
  let numCols = (rows[headerRow]?.c?.length) || 0;
  rows.slice(0, 6).forEach(r => { if (r?.c?.length > numCols) numCols = r.c.length; });

  const metaCols = {};
  const parties = [];

  for (let c = 0; c < numCols; c++) {
    const h = _advNormalize(_advCellText(rows, headerRow, c));
    if (!h) continue;

    if (h === 'votos') {
      const name = _advCellText(rows, nameRow, c) || _advCellText(rows, siglasRow, c) || `Partido ${parties.length + 1}`;
      const siglas = _advCellText(rows, siglasRow, c) || '';
      parties.push({ name, siglas, votesCol: c, seatsCol: c + 1, key: siglas || name });
      continue;
    }
    if (h === 'diputados') continue; // se procesa junto al "Votos" de su misma columna par

    if (h.includes('codigo') && (h.includes('provincia') || h.includes('comunidad'))) {
      // La hoja repite una etiqueta de "código" para la CCAA y para la provincia.
      // En vez de depender del texto exacto de la columna de nombre que la
      // acompaña (frágil ante variaciones de redacción), se asume que el
      // nombre va siempre en la columna inmediatamente a la derecha del
      // código, y sólo se usa el texto de esa columna para decidir si el
      // par código+nombre es de comunidad o de provincia.
      const nextH = _advNormalize(_advCellText(rows, headerRow, c + 1));
      const isCcaa = nextH.includes('comunidad') || nextH.includes('autonom') ||
        (!nextH.includes('provincia') && metaCols.ccaaCode === undefined);
      if (isCcaa) { metaCols.ccaaCode = c; if (metaCols.ccaaName === undefined) metaCols.ccaaName = c + 1; }
      else        { metaCols.provCode = c; if (metaCols.provName === undefined) metaCols.provName = c + 1; }
      continue;
    }
    if (h.includes('diputado') && (h.includes('provincia') || h.includes('circunscripcion'))) {
      metaCols.seatsBase = c;
      continue;
    }
    if (ADV_HEADER_MAP[h] && metaCols[ADV_HEADER_MAP[h]] === undefined) {
      metaCols[ADV_HEADER_MAP[h]] = c;
    }
  }

  // Red de seguridad: si por alguna razón no se detectó el nombre de
  // provincia/comunidad por adyacencia, se busca por texto de cabecera.
  if (metaCols.provName === undefined) {
    for (let c = 0; c < numCols; c++) {
      const h = _advNormalize(_advCellText(rows, headerRow, c));
      if (h.includes('provincia') && !h.includes('codigo') && !h.includes('diputado')) { metaCols.provName = c; break; }
    }
  }
  if (metaCols.ccaaName === undefined) {
    for (let c = 0; c < numCols; c++) {
      const h = _advNormalize(_advCellText(rows, headerRow, c));
      if ((h.includes('comunidad') || h.includes('autonom')) && !h.includes('codigo')) { metaCols.ccaaName = c; break; }
    }
  }

  const debug = {
    headerRowIndex: headerRow,
    headerRowTexts: Array.from({ length: numCols }, (_, c) => _advCellText(rows, headerRow, c)).filter(Boolean),
    metaCols: { ...metaCols },
    numDataRowsScanned: Math.max(0, rows.length - 6)
  };

  const dataRows = [];
  for (let r = 6; r < rows.length; r++) {
    const provName = _advCellText(rows, r, metaCols.provName);
    if (!provName) continue;
    dataRows.push({
      anio: _advCellText(rows, r, metaCols.anio),
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
        votes:     _advCellNum(rows, r, p.votesCol),
        realSeats: _advCellNum(rows, r, p.seatsCol)
      }))
    });
  }

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
  const table = await advFetchTable(cfg.gid);
  const data = advParseTable(table);
  _advCache[electionKey] = data;
  return data;
}

function advClearCache() {
  _advCache = {};
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { advParseTable, advFetchTable, advGetElectionData, advClearCache, ADV_ELECTIONS };
}
