/**
 * advanced-calc.js
 * Motor de cálculo de la Calculadora avanzada: construcción de
 * circunscripciones, reparto de escaños entre ellas, barreras y asignación.
 */

/** Configuración por defecto (se completa con los metadatos de la hoja). */
function advDefaultConfig(meta) {
  return {
    circunscripcion: meta?.circunscripcionDefault || 'provincia',
    formula: 'dhondt',
    barrera1: {
      activa: (meta?.barrera1?.valor || 0) > 0,
      nivel:  meta?.barrera1?.nivel || 'circunscripcion',
      valor:  meta?.barrera1?.valor || 0
    },
    barrera2: {
      activa: !!meta?.barrera2,
      nivel:  meta?.barrera2?.nivel || 'nacional',
      valor:  meta?.barrera2?.valor || 0
    },
    blancoEnDenominador: true,
    seatsMode: 'sheet',      // 'sheet' | 'custom'
    totalSeats: 350,
    minPorCircunscripcion: 2,
    repartoBase: 'poblacion' // 'poblacion' | 'censo'
  };
}

/* ── Construcción de circunscripciones ─────────────────────── */

function advBuildDistricts(data, config) {
  const level = config.circunscripcion;

  const makeDistrict = (id, name, ccaaName, ccaaCode) => ({
    id, name, ccaaName, ccaaCode,
    seatsBase: 0, seats: 0,
    poblacion: 0, censoTotal: 0, votantesTotal: 0,
    votosValidos: 0, votosBlanco: 0, votosNulos: 0,
    partyVotes: new Map(), realSeats: new Map(),
    members: []
  });

  const accumulate = (d, row) => {
    d.seatsBase     += row.seatsBase;
    d.poblacion     += row.poblacion;
    d.censoTotal    += row.censoTotal;
    d.votantesTotal += row.votantesTotal;
    d.votosValidos  += row.votosValidos;
    d.votosBlanco   += row.votosBlanco;
    d.votosNulos    += row.votosNulos;
    d.members.push(row.provName);
    row.parties.forEach(p => {
      if (p.votes)     d.partyVotes.set(p.key, (d.partyVotes.get(p.key) || 0) + p.votes);
      if (p.realSeats) d.realSeats.set(p.key, (d.realSeats.get(p.key) || 0) + p.realSeats);
    });
  };

  const districts = [];
  const byKey = new Map();

  data.rows.forEach(row => {
    let key, name, ccaaName, ccaaCode;
    if (level === 'nacional') {
      key = '__nacional__'; name = data.meta.pais || 'Total nacional'; ccaaName = ''; ccaaCode = '';
    } else if (level === 'ccaa') {
      // Se agrupa por NOMBRE de comunidad: los códigos pueden tener erratas.
      key = row.ccaaName; name = row.ccaaName; ccaaName = row.ccaaName; ccaaCode = row.ccaaCode;
    } else {
      key = `${row.ccaaName}|${row.provName}`; name = row.provName; ccaaName = row.ccaaName; ccaaCode = row.ccaaCode;
    }
    let d = byKey.get(key);
    if (!d) { d = makeDistrict(key, name, ccaaName, ccaaCode); byKey.set(key, d); districts.push(d); }
    accumulate(d, row);
  });

  return districts;
}

/* ── Candados por circunscripción ──────────────────────────── */

/**
 * Aspectos que puede cubrir el candado de una circunscripción. Cada uno
 * corresponde a una sección de la configuración, de modo que bloquear un
 * aspecto equivale a dejar esa circunscripción fuera de esa opción.
 *
 * Los que congelan un valor ('snap') guardan el ajuste vigente al activarse:
 * a partir de ahí, cambiar la opción global ya no les afecta.
 */
const ADV_LOCK_ASPECTS = [
  { key: 'escanos', label: 'Escaños',           section: 'escanos',  snap: false,
    hint: 'Conserva sus escaños aunque cambie el reparto' },
  { key: 'formula', label: 'Fórmula de reparto', section: 'reparto',  snap: true,
    hint: 'Mantiene la fórmula actual aunque se cambie' },
  { key: 'barrera', label: 'Barreras',           section: 'barreras', snap: true,
    hint: 'Mantiene las barreras actuales aunque se cambien' },
  { key: 'edicion', label: 'Edición de datos',   section: 'datos',    snap: false,
    hint: 'Impide cambiar sus votos y candidaturas' },
];

/** ¿Tiene esta circunscripción bloqueado este aspecto? */
function advLockHas(locks, districtId, aspect) {
  return !!(locks && locks[districtId] && locks[districtId][aspect]);
}

/** Ajustes vigentes para una circunscripción: los congelados si los hay. */
function advEffectiveConfig(config, locks, districtId) {
  const snap = locks?.[districtId]?.snap;
  return {
    formula: advLockHas(locks, districtId, 'formula') && snap ? snap.formula : config.formula,
    barreras: advLockHas(locks, districtId, 'barrera') && snap
      ? [snap.barrera1, snap.barrera2]
      : [config.barrera1, config.barrera2]
  };
}

/* ── Ediciones de la sesión ────────────────────────────────── */

/**
 * Aplica sobre las circunscripciones ya agregadas los cambios que haya hecho
 * la persona usuaria en esta sesión. No tocan la hoja de origen: son una capa
 * por encima, identificada por el id de circunscripción, que se descarta al
 * restaurar.
 *
 * Los votos se sustituyen antes de repartir, así que el resto del cálculo
 * —porcentajes, barreras y totales, que se derivan de la suma de votos— se
 * ajusta solo.
 */
function advApplyVoteEdits(districts, edits) {
  if (!edits) return;
  districts.forEach(d => {
    const e = edits[d.id];
    if (!e) return;
    Object.entries(e.votes || {}).forEach(([key, v]) => {
      // Se conserva la clave aunque queden 0 votos: si se borrara, la fila
      // desaparecería de la tabla y no habría manera de devolverle votos.
      d.partyVotes.set(key, Math.max(0, Math.round(Number(v) || 0)));
    });
    // Las candidaturas retiradas de esta circunscripción se van del todo,
    // a diferencia de las que se dejan a cero.
    (e.removed || []).forEach(key => d.partyVotes.delete(key));
  });
}

/** Sustituye el número de escaños de una circunscripción tras el reparto. */
function advApplySeatEdits(districts, edits) {
  if (!edits) return;
  districts.forEach(d => {
    const e = edits[d.id];
    if (!e || e.seats == null) return;
    d.seats = Math.max(0, Math.round(Number(e.seats) || 0));
  });
}

/* ── Reparto de escaños entre circunscripciones ────────────── */

/**
 * Asigna el número de escaños de cada circunscripción.
 * - 'sheet':  usa los valores de la hoja (suma de las provincias que la componen).
 * - 'custom': reparte un total dado con un mínimo por circunscripción y el
 *             resto en proporción a población o censo (como el sistema español).
 *
 * Las circunscripciones bloqueadas quedan fuera del reparto: conservan sus
 * escaños, que se descuentan del total antes de repartir el resto. Así, con un
 * mínimo de 2 por circunscripción y Melilla bloqueada en 1, Melilla mantiene
 * su escaño, las demás reciben su mínimo, y el total sigue cuadrando.
 */
function advApportionSeats(districts, config, lockedSeats) {
  const lockedOf = d => lockedSeats?.get(d.id);
  const isLocked = d => lockedOf(d) != null;

  if (config.seatsMode !== 'custom') {
    districts.forEach(d => { d.seats = isLocked(d) ? lockedOf(d) : d.seatsBase; });
    return { total: districts.reduce((s, d) => s + d.seats, 0), warning: null };
  }

  const total = Math.max(0, parseInt(config.totalSeats) || 0);
  const min   = Math.max(0, parseInt(config.minPorCircunscripcion) || 0);

  // Los bloqueados se sirven primero y salen del reparto.
  const locked = districts.filter(isLocked);
  const free   = districts.filter(d => !isLocked(d));
  locked.forEach(d => { d.seats = Math.max(0, lockedOf(d)); });
  const lockedTotal = locked.reduce((s, d) => s + d.seats, 0);

  const n = free.length;
  const toShare = total - lockedTotal;

  if (toShare <= 0) {
    free.forEach(d => { d.seats = 0; });
    return {
      total: lockedTotal,
      warning: locked.length
        ? `Las circunscripciones bloqueadas ya suman ${lockedTotal} escaños, igual o más que el total de ${total}. El resto se queda sin escaños.`
        : null
    };
  }
  if (!n) return { total: lockedTotal, warning: null };

  if (min * n > toShare) {
    const base = Math.floor(toShare / n);
    free.forEach(d => { d.seats = base; });
    let rest = toShare - base * n;
    for (let i = 0; i < rest; i++) free[i].seats++;
    return {
      total,
      warning: `El mínimo de ${min} por circunscripción exige ${min * n} escaños` +
               `${lockedTotal ? ` para las no bloqueadas` : ''}, más que los ${toShare} disponibles. Se ha repartido a partes iguales.`
    };
  }

  const remaining = toShare - min * n;
  const basis = free.map(d => (config.repartoBase === 'censo' ? d.censoTotal : d.poblacion) || 0);
  const basisSum = basis.reduce((a, b) => a + b, 0);

  free.forEach(d => { d.seats = min; });

  if (remaining > 0 && basisSum > 0) {
    // Resto mayor (cuota Hare) sobre población/censo, como la LOREG.
    const quota = basisSum / remaining;
    const exact = basis.map(b => b / quota);
    const floors = exact.map(Math.floor);
    let assigned = floors.reduce((a, b) => a + b, 0);
    const order = exact
      .map((e, i) => ({ i, rem: e - floors[i] }))
      .sort((a, b) => b.rem - a.rem || basis[b.i] - basis[a.i]);
    let k = 0;
    while (assigned < remaining && order.length) { floors[order[k % order.length].i]++; assigned++; k++; }
    free.forEach((d, i) => { d.seats += floors[i]; });
  } else if (remaining > 0) {
    for (let i = 0; i < remaining; i++) free[i % n].seats++;
  }

  return { total, warning: null };
}

/* ── Barreras electorales ──────────────────────────────────── */

/** Votos válidos de referencia para el denominador de la barrera. */
function _advValidVotes(d, config) {
  const cand = [...d.partyVotes.values()].reduce((a, b) => a + b, 0);
  return config.blancoEnDenominador ? cand + d.votosBlanco : cand;
}

/**
 * Devuelve, para cada circunscripción, el conjunto de claves de partido que
 * superan todas las barreras activas.
 */
function advComputeEligibility(districts, config, locks) {

  // Agregados por ámbito para las barreras supra-circunscripcionales.
  const ccaaTotals = new Map();
  const nacTotals  = { valid: 0, parties: new Map() };
  districts.forEach(d => {
    const valid = _advValidVotes(d, config);
    nacTotals.valid += valid;
    d.partyVotes.forEach((v, k) => nacTotals.parties.set(k, (nacTotals.parties.get(k) || 0) + v));

    const ck = d.ccaaName || d.name;
    let c = ccaaTotals.get(ck);
    if (!c) { c = { valid: 0, parties: new Map() }; ccaaTotals.set(ck, c); }
    c.valid += valid;
    d.partyVotes.forEach((v, k) => c.parties.set(k, (c.parties.get(k) || 0) + v));
  });

  const eligibility = new Map();
  const blockedBy   = new Map();

  districts.forEach(d => {
    // Cada circunscripción usa sus propias barreras si las tiene congeladas
    // por el candado; si no, las de la configuración general. Los totales de
    // ámbito (comunidad y nacional) se calculan siempre con el criterio
    // general, porque son de toda la elección y no de una circunscripción.
    const barreras = advEffectiveConfig(config, locks, d.id).barreras
      .filter(b => b && b.activa && b.valor > 0);

    const ok = new Set();
    const blocked = new Map();
    d.partyVotes.forEach((votes, key) => {
      if (votes <= 0) return;
      let passes = true, reason = null;
      for (const b of barreras) {
        let scopeVotes, scopeValid, label;
        if (b.nivel === 'nacional') {
          scopeVotes = nacTotals.parties.get(key) || 0; scopeValid = nacTotals.valid; label = 'nacional';
        } else if (b.nivel === 'ccaa') {
          const c = ccaaTotals.get(d.ccaaName || d.name);
          scopeVotes = c?.parties.get(key) || 0; scopeValid = c?.valid || 0; label = 'de comunidad';
        } else {
          scopeVotes = votes; scopeValid = _advValidVotes(d, config); label = 'de circunscripción';
        }
        if (scopeValid > 0 && scopeVotes < scopeValid * b.valor / 100) {
          passes = false; reason = `${b.valor}% ${label}`; break;
        }
      }
      if (passes) ok.add(key); else blocked.set(key, reason);
    });
    eligibility.set(d.id, ok);
    blockedBy.set(d.id, blocked);
  });

  return { eligibility, blockedBy };
}

/* ── Asignación de escaños ─────────────────────────────────── */

/**
 * Calcula el reparto completo. Devuelve las circunscripciones con resultados,
 * el recuento nacional por partido y los avisos detectados.
 */
function advCalculate(data, config, edits, locks) {
  const districts = advBuildDistricts(data, config);
  // Los votos se sustituyen antes de calcular nada, para que barreras y
  // porcentajes partan ya de los valores editados.
  advApplyVoteEdits(districts, edits);

  // Con el aspecto «escaños» bloqueado, la circunscripción conserva los que
  // tuviera: los puestos a mano si los hay, y si no los de la hoja.
  const lockedSeats = new Map();
  districts.forEach(d => {
    if (!advLockHas(locks, d.id, 'escanos')) return;
    const manual = edits?.[d.id]?.seats;
    lockedSeats.set(d.id, Math.max(0, manual != null ? manual : d.seatsBase));
  });

  const apport    = advApportionSeats(districts, config, lockedSeats);
  // Los escaños se sustituyen después del reparto: un valor puesto a mano
  // manda sobre los de la hoja y sobre el reparto automático.
  advApplySeatEdits(districts, edits);
  const { eligibility, blockedBy } = advComputeEligibility(districts, config, locks);

  const partyMeta = new Map(data.parties.map(p => [p.key, p]));

  districts.forEach(d => {
    const removedKeys = new Set(edits?.[d.id]?.removed || []);
    const editedKeys = new Set(
      Object.keys(edits?.[d.id]?.votes || {}).filter(k => !removedKeys.has(k)));
    const ok = eligibility.get(d.id);
    const contenders = [...d.partyVotes.entries()]
      .filter(([k, v]) => v > 0 && ok.has(k))
      .map(([k, v]) => ({ key: k, name: partyMeta.get(k)?.name || k, siglas: partyMeta.get(k)?.siglas || '', votes: v }));

    const formula = advEffectiveConfig(config, locks, d.id).formula;
    const allocated = d.seats > 0 && contenders.length
      ? allocateSeats(contenders, d.seats, formula)
      : contenders.map(p => ({ ...p, seats: 0 }));
    d.formulaUsada = formula;

    const seatsByKey = new Map(allocated.map(p => [p.key, p.seats]));
    const validVotes = _advValidVotes(d, config);
    const blocked    = blockedBy.get(d.id);

    d.validVotes = validVotes;
    d.results = [...d.partyVotes.entries()]
      .filter(([k, v]) => v > 0 || editedKeys.has(k))
      .map(([k, v]) => ({
        key: k,
        name:   partyMeta.get(k)?.name || k,
        siglas: partyMeta.get(k)?.siglas || '',
        votes:  v,
        pct:    validVotes > 0 ? v / validVotes * 100 : 0,
        seats:  seatsByKey.get(k) || 0,
        realSeats: d.realSeats.get(k) || 0,
        blockedReason: blocked.get(k) || null
      }))
      .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
    d.assignedSeats = d.results.reduce((s, p) => s + p.seats, 0);
  });

  // ── Recuento nacional ──
  const totals = new Map();
  let totalValid = 0, totalBlanco = 0, totalNulos = 0, totalCenso = 0, totalVotantes = 0, totalSeats = 0;

  districts.forEach(d => {
    totalValid    += d.validVotes;
    totalBlanco   += d.votosBlanco;
    totalNulos    += d.votosNulos;
    totalCenso    += d.censoTotal;
    totalVotantes += d.votantesTotal;
    totalSeats    += d.seats;
    d.results.forEach(p => {
      let t = totals.get(p.key);
      if (!t) {
        t = { key: p.key, name: p.name, siglas: p.siglas, votes: 0, seats: 0, realSeats: 0, districts: 0 };
        totals.set(p.key, t);
      }
      t.votes += p.votes;
      t.seats += p.seats;
      t.realSeats += p.realSeats;
      if (p.seats > 0) t.districts++;
    });
  });

  const national = [...totals.values()].map(t => {
    const votePct = totalValid  > 0 ? t.votes / totalValid  * 100 : 0;
    const seatPct = totalSeats  > 0 ? t.seats / totalSeats  * 100 : 0;
    return { ...t, votePct, seatPct, diff: seatPct - votePct };
  }).sort((a, b) => b.seats - a.seats || b.votes - a.votes);

  // ── Avisos sobre la calidad de los datos de origen ──
  const warnings = [];
  if (apport.warning) warnings.push(apport.warning);
  if (config.seatsMode === 'sheet') {
    const realTotal = data.rows.reduce((s, r) => s + r.parties.reduce((a, p) => a + p.realSeats, 0), 0);
    const baseTotal = data.rows.reduce((s, r) => s + r.seatsBase, 0);
    if (realTotal > 0 && realTotal !== baseTotal) {
      const bad = data.rows
        .filter(r => r.parties.reduce((a, p) => a + p.realSeats, 0) !== r.seatsBase)
        .map(r => `${r.provName} (hoja: ${r.seatsBase}, reales: ${r.parties.reduce((a, p) => a + p.realSeats, 0)})`);
      warnings.push(
        `La columna «Numero diputados por provincia» suma ${baseTotal}, pero los diputados registrados en la hoja suman ${realTotal}. ` +
        `Revisa: ${bad.join('; ')}.`
      );
    }
  }
  const disproportion = advGallagherIndex(national);

  return {
    districts, national, warnings, config,
    summary: {
      totalSeats, totalValid, totalBlanco, totalNulos, totalCenso, totalVotantes,
      participacion: totalCenso > 0 ? totalVotantes / totalCenso * 100 : 0,
      numDistricts: districts.length,
      gallagher: disproportion
    }
  };
}

/** Índice de desproporcionalidad de Gallagher (mínimos cuadrados). */
function advGallagherIndex(national) {
  const sum = national.reduce((s, p) => s + Math.pow(p.seatPct - p.votePct, 2), 0);
  return Math.sqrt(sum / 2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { advDefaultConfig, advBuildDistricts, advApportionSeats, advComputeEligibility, advCalculate, advGallagherIndex };
}
