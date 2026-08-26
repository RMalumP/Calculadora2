/**
 * advanced-data.js
 * Descarga y parseo de datos electorales desde Google Sheets para la
 * Calculadora avanzada. Cada hoja del documento es una elección concreta.
 */

const ADV_SHEET_ID = '1pjggxoPWBxMo9HSN0kVo-HFPvMxYj1g7x8-AMlu6rCM';

// Se incrementa con cada cambio relevante del parser. Sirve para comprobar a
// simple vista, desde el panel de diagnóstico o la consola, si el navegador
// está sirviendo una versión en caché de este archivo.
const ADV_PARSER_VERSION = '2025-reconstruccion-de-cabecera';
console.log('[Calculadora avanzada] advanced-data.js versión', ADV_PARSER_VERSION);

/**
 * Disposición de la hoja: 6 filas de cabecera y datos a partir de la 7.
 *
 * El endpoint JSON de Google Sheets no devuelve la hoja tal cual: consume
 * las primeras filas como cabecera (su texto acaba en cols[].label, no en
 * las filas) y asigna un tipo a cada columna, convirtiendo en null el texto
 * que no encaje con ese tipo. En una columna de votos, que es numérica, eso
 * borra "PARTIDO POPULAR", "PP" y "Votos". Por eso la cabecera se
 * reconstruye pidiendo la hoja con distintos valores de headers=N y
 * restando cada etiqueta de la siguiente: la diferencia es el contenido de
 * la fila N.
 */
const ADV_SHEET_ROWS = { barrera1: 1, tipo: 2, circunscripcion: 3, subtipo: 4, siglas: 5, cabecera: 6 };

/**
 * Orden fijo de las columnas de metadatos (A..T) según la hoja. Se usa como
 * base y se corrige con el texto de cabecera cuando este se puede leer.
 */
const ADV_FIXED_COLS = {
  anio: 0, mes: 1, dia: 2, ccaaCode: 3, ccaaName: 4, provCode: 5, provName: 6,
  seatsBase: 7, poblacion: 8, mesas: 9, censoSinCera: 10, censoCera: 11,
  censoTotal: 12, votantesCer: 13, votantesCera: 14, votantesTotal: 15,
  votosValidos: 16, votosCandidaturas: 17, votosBlanco: 18, votosNulos: 19
};

/** Primera columna de partidos: a partir de aquí van en pares votos/diputados. */
const ADV_FIRST_PARTY_COL = 20;

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
function advFetchTable(gid, opts = {}) {
  const { headers, limit, timeoutMs = ADV_FETCH_TIMEOUT_MS } = opts;
  return new Promise((resolve, reject) => {
    const cb = `_advGvizCb${Date.now()}_${_advJsonpSeq++}`;
    const url = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/gviz/tq` +
                `?tqx=out:json;responseHandler:${cb}` +
                (gid != null ? `&gid=${encodeURIComponent(gid)}` : '') +
                (headers != null ? `&headers=${encodeURIComponent(headers)}` : '') +
                (limit != null ? `&tq=${encodeURIComponent('select * limit ' + limit)}` : '');

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

/**
 * Descarga la hoja las veces necesarias para poder reconstruir su cabecera.
 *
 * Se pide una vez con headers=5 (trae los datos) y otras cuatro con
 * headers=1..4 limitadas a una fila, que son muy ligeras y sólo se usan por
 * sus cols[].label. Restando cada etiqueta de la siguiente se recupera el
 * contenido exacto de cada fila de cabecera, que de otro modo Google no
 * devuelve.
 */
async function advFetchElection(gid) {
  const dataHeaders = ADV_SHEET_ROWS.siglas; // 5
  const [dataTable, ...labelTables] = await Promise.all([
    advFetchTable(gid, { headers: dataHeaders }),
    ...[1, 2, 3, 4].map(n =>
      advFetchTable(gid, { headers: n, limit: 1 }).catch(() => null))
  ]);
  const labelsByHeaderCount = { 5: dataTable };
  [1, 2, 3, 4].forEach((n, i) => { labelsByHeaderCount[n] = labelTables[i]; });
  return { dataTable, labelsByHeaderCount };
}

/* ── Parseo de la hoja a un modelo normalizado ─────────────── */

/** Colapsa espacios y saltos de línea; las etiquetas de gviz los mezclan. */
function _advSquash(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Devuelve una función (filaDeLaHoja, columna) → texto, reconstruyendo cada
 * fila de cabecera a partir de las etiquetas: la etiqueta con headers=N
 * contiene las filas 1..N unidas, así que restarle la de headers=N-1 deja
 * justo el contenido de la fila N.
 */
function _advHeaderRowReader(labelsByHeaderCount) {
  const labelAt = (n, c) =>
    _advSquash(labelsByHeaderCount?.[n]?.cols?.[c]?.label ?? '');

  return (sheetRow, col) => {
    if (!labelsByHeaderCount?.[sheetRow]) return '';
    const cur = labelAt(sheetRow, col);
    if (sheetRow <= 1) return cur;
    // Sin la etiqueta de la fila anterior no se puede aislar esta: devolver la
    // unida mezclaría el contenido de varias filas en una sola.
    if (!labelsByHeaderCount[sheetRow - 1]) return '';
    const prev = labelAt(sheetRow - 1, col);
    if (!prev) return cur;                       // nada por encima: la etiqueta es esta fila
    if (cur.startsWith(prev)) return cur.slice(prev.length).trim();
    return '';                                    // unión inesperada: mejor vacío que texto mezclado
  };
}

/**
 * Localiza la fila de cabecera ("Votos"/"Diputados" repetidos por partido)
 * en vez de asumirla en una posición fija. La hoja puede tener filas de
 * más o de menos por encima de la tabla de datos que las asumidas
 * originalmente (p. ej. si se añade o se borra una fila de metadatos), así
 * que se localiza buscando la fila con más celdas de texto "Votos" —marca
 * inequívoca de esa fila— en vez de fiarse de un número de fila fijo.
 */
function _advFindHeaderRow(rows) {
  let best = -1, bestCount = 0;
  const scanLimit = Math.min(rows.length, 40);
  const scan = [];
  for (let r = 0; r < scanLimit; r++) {
    const width = rows[r]?.c?.length || 0;
    let count = 0;
    for (let c = 0; c < width; c++) {
      if (_advNormalize(_advCellText(rows, r, c)) === 'votos') count++;
    }
    scan.push({ row: r, votosCount: count, preview: Array.from({ length: Math.min(width, 6) }, (_, c) => _advCellText(rows, r, c)) });
    if (count > bestCount) { bestCount = count; best = r; }
  }
  return { headerRow: bestCount > 0 ? best : 5, scan, found: bestCount > 0 };
}

function advParseTable(table, labelsByHeaderCount) {
  const rows = table?.rows || [];
  const cols = table?.cols || [];
  const headerText = _advHeaderRowReader(labelsByHeaderCount);

  // Dos escenarios posibles:
  //  - gviz: el texto de cabecera viaja en cols[].label y se reconstruye.
  //  - crudo (CSV, pruebas): el texto sigue en las propias filas.
  // Se prefiere el reconstruido y se recurre al de las filas si está vacío.
  const headerScan  = _advFindHeaderRow(rows);
  const rawHeaderRow = headerScan.found ? headerScan.headerRow : -1;
  const rawAt = (sheetRow, col) => rawHeaderRow < 0 ? ''
    : _advCellText(rows, rawHeaderRow - (ADV_SHEET_ROWS.cabecera - sheetRow), col);
  const cell = (sheetRow, col) => headerText(sheetRow, col) || rawAt(sheetRow, col);

  let numCols = cols.length;
  rows.forEach(r => { if (r?.c?.length > numCols) numCols = r.c.length; });

  /* ── Metadatos de la elección ── */

  const level = _advDetectLevel(cell(ADV_SHEET_ROWS.circunscripcion, 2)) || 'provincia';
  const asBarrierLevel = l => (!l || l === level || l === 'provincia') ? 'circunscripcion' : l;

  const meta = {
    tipo:    cell(ADV_SHEET_ROWS.tipo, 0) || 'Generales',
    subtipo: cell(ADV_SHEET_ROWS.subtipo, 0) || '',
    pais:    cell(ADV_SHEET_ROWS.siglas, 1) || 'España',
    circunscripcionDefault: level,
    barrera1: {
      nivel: asBarrierLevel(_advDetectLevel(cell(ADV_SHEET_ROWS.barrera1, 2))),
      valor: _advParsePercent(cell(ADV_SHEET_ROWS.barrera1, 3))
    },
    barrera2: null
  };
  const b2nivel = _advDetectLevel(cell(ADV_SHEET_ROWS.tipo, 2));
  if (b2nivel) {
    meta.barrera2 = { nivel: asBarrierLevel(b2nivel), valor: _advParsePercent(cell(ADV_SHEET_ROWS.tipo, 3)) };
  }

  /* ── Columnas de metadatos ── */

  // Se parte del orden fijo documentado de la hoja y se corrige con el texto
  // de la fila de cabecera cuando este se puede leer (en gviz sólo sobrevive
  // el de las columnas de texto, como los nombres de provincia y comunidad).
  const metaCols = { ...ADV_FIXED_COLS };
  const headerRowTexts = [];
  for (let c = 0; c < numCols; c++) {
    const raw = cell(ADV_SHEET_ROWS.cabecera, c);
    headerRowTexts.push(raw);
    const h = _advNormalize(raw);
    if (!h || h === 'votos' || h === 'diputados') continue;

    if (h.includes('codigo') && (h.includes('provincia') || h.includes('comunidad'))) continue;
    if (h.includes('diputado') && (h.includes('provincia') || h.includes('circunscripcion'))) {
      metaCols.seatsBase = c;
      continue;
    }
    if (h.includes('provincia')) { metaCols.provName = c; metaCols.provCode = c - 1; continue; }
    if (h.includes('comunidad') || h.includes('autonom')) { metaCols.ccaaName = c; metaCols.ccaaCode = c - 1; continue; }
    if (ADV_HEADER_MAP[h] !== undefined) metaCols[ADV_HEADER_MAP[h]] = c;
  }

  /* ── Partidos: pares votos/diputados desde la primera columna de partido ── */

  // El final del bloque de metadatos marca dónde empiezan los partidos.
  const lastMetaCol = Math.max(...Object.values(metaCols).filter(n => Number.isFinite(n)));
  const firstPartyCol = Math.max(lastMetaCol + 1, ADV_FIRST_PARTY_COL);

  const parties = [];
  for (let c = firstPartyCol; c + 1 <= numCols; c += 2) {
    let name     = cell(ADV_SHEET_ROWS.subtipo, c);
    const siglas = cell(ADV_SHEET_ROWS.siglas, c);
    // Si no se pudo separar nombre de siglas, se usa la etiqueta unida como
    // nombre: menos preciso, pero legible y sin duplicar el texto.
    if (!name && !siglas) name = _advSquash(cols[c]?.label ?? '');
    const hasVotes = rows.some(r => {
      const o = (r?.c && r.c[c]) || null;
      return o && typeof o.v === 'number' && o.v > 0;
    });
    if (!name && !siglas && !hasVotes) continue;
    parties.push({
      name:   name || siglas || `Partido ${parties.length + 1}`,
      siglas: siglas || '',
      votesCol: c, seatsCol: c + 1,
      key: siglas || name || `col${c}`
    });
  }

  /* ── Filas de datos ── */

  // Se reconocen por contenido en vez de por posición: gviz puede haber
  // consumido un número variable de filas de cabecera, así que las que
  // queden por delante se descartan solas al no tener año ni provincia.
  const isDataRow = r => {
    const year = _advCellNum(rows, r, metaCols.anio);
    return year >= 1800 && year <= 2200 && !!_advCellText(rows, r, metaCols.provName);
  };

  const dataRows = [];
  for (let r = 0; r < rows.length; r++) {
    if (!isDataRow(r)) continue;
    dataRows.push({
      anio: _advCellText(rows, r, metaCols.anio),
      mes:  _advCellText(rows, r, metaCols.mes),
      dia:  _advCellText(rows, r, metaCols.dia),
      ccaaCode: _advCellText(rows, r, metaCols.ccaaCode),
      ccaaName: _advCellText(rows, r, metaCols.ccaaName),
      provCode: _advCellText(rows, r, metaCols.provCode),
      provName: _advCellText(rows, r, metaCols.provName),
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

  const debug = {
    parserVersion: ADV_PARSER_VERSION,
    totalRowsFromSheet: rows.length,
    numCols,
    headerFromLabels: !!labelsByHeaderCount,
    rawHeaderRowIndex: rawHeaderRow,
    reconstructedHeader: {
      barrera1: [cell(1, 2), cell(1, 3)],
      tipo:     cell(2, 0),
      circ:     cell(3, 2),
      subtipo:  cell(4, 0),
      pais:     cell(5, 1)
    },
    firstPartyCol,
    partySample: parties.slice(0, 4).map(p => `${p.siglas || '—'} / ${p.name} (col ${p.votesCol})`),
    numParties: parties.length,
    headerRowTexts: headerRowTexts.filter(Boolean),
    metaCols: { ...metaCols },
    numDataRowsScanned: rows.length,
    rowScan: headerScan.scan
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
  const { dataTable, labelsByHeaderCount } = await advFetchElection(cfg.gid);
  const data = advParseTable(dataTable, labelsByHeaderCount);
  _advCache[electionKey] = data;
  return data;
}

function advClearCache() {
  _advCache = {};
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { advParseTable, advFetchTable, advGetElectionData, advClearCache, ADV_ELECTIONS };
}
