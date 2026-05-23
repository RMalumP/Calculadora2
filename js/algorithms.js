/**
 * algorithms.js
 * Algoritmos de reparto de escaños: D'Hondt, Sainte-Laguë, cuotas, mayoritarios.
 */

/**
 * Punto de entrada: despacha al algoritmo correcto según la fórmula.
 */
function allocateSeats(parties, totalSeats, formula) {
  if (!parties.length || totalSeats === 0) return parties.map(p => ({ ...p, seats: 0 }));
  switch (formula) {
    case 'dhondt':          return highestAverage(parties, totalSeats, i => i + 1);
    case 'hare':            return largestRemainder(parties, totalSeats, v => v / totalSeats);
    case 'imperiali':       return largestRemainder(parties, totalSeats, v => v / (totalSeats + 2));
    case 'droop':           return largestRemainder(parties, totalSeats, v => v / (totalSeats + 1));
    case 'hb':              return largestRemainder(parties, totalSeats, v => v / (totalSeats + 1));
    case 'highest_avg':     return highestAverage(parties, totalSeats, i => i === 0 ? 1e-10 : i);
    case 'saintlague':      return highestAverage(parties, totalSeats, i => 2 * i + 1);
    case 'saintlague_m':    return highestAverageMod(parties, totalSeats);
    case 'majority':        return majority(parties, totalSeats);
    case 'majority_round2': return majorityRound2(totalSeats);
    default:                return highestAverage(parties, totalSeats, i => i + 1);
  }
}

/** Media más alta genérica (D'Hondt, Sainte-Laguë, Adams…) */
function highestAverage(parties, totalSeats, divFn) {
  const seats = parties.map(() => 0);
  const allocations = [];

  for (let s = 0; s < totalSeats; s++) {
    let best = -1, bestQ = -Infinity;
    parties.forEach((p, i) => {
      const q = p.votes / divFn(seats[i]);
      if (q > bestQ) { bestQ = q; best = i; }
    });
    if (best >= 0) {
      seats[best]++;
      allocations.push({ party: best, partyName: parties[best].name, quotient: bestQ, votes: parties[best].votes, seatNumber: seats[best] });
    }
  }

  _storeLastSeatInfo(parties, seats, allocations, divFn, totalSeats);
  return parties.map((p, i) => ({ ...p, seats: seats[i] }));
}

/** Sainte-Laguë modificada (primer divisor 1.4) */
function highestAverageMod(parties, totalSeats) {
  const divFn = s => s === 0 ? 1.4 : 2 * s + 1;
  const seats = parties.map(() => 0);
  const allocations = [];

  for (let s = 0; s < totalSeats; s++) {
    let best = -1, bestQ = -Infinity;
    parties.forEach((p, i) => {
      const q = p.votes / divFn(seats[i]);
      if (q > bestQ) { bestQ = q; best = i; }
    });
    if (best >= 0) {
      seats[best]++;
      allocations.push({ party: best, partyName: parties[best].name, quotient: bestQ, votes: parties[best].votes });
    }
  }

  _storeLastSeatInfo(parties, seats, allocations, divFn, totalSeats);
  return parties.map((p, i) => ({ ...p, seats: seats[i] }));
}

/** Resto mayor genérico (Hare, Droop, Hagenbach-Bischoff, Imperiali) */
function largestRemainder(parties, totalSeats, quotaFn) {
  const totalVotes = parties.reduce((a, p) => a + p.votes, 0);
  const quota = quotaFn(totalVotes);
  const s = parties.map(p => Math.floor(p.votes / quota));
  const rem = parties.map((p, i) => ({ idx: i, r: p.votes / quota - s[i], name: p.name, votes: p.votes }));
  let assigned = s.reduce((a, b) => a + b, 0);
  rem.sort((a, b) => b.r - a.r);

  let lastWinnerIdx = -1, lastWinnerRem = 0;
  let firstLoserIdx = -1, firstLoserRem = 0;
  let ri = 0;

  while (assigned < totalSeats) {
    const winner = rem[ri % rem.length];
    s[winner.idx]++;
    if (assigned === totalSeats - 1) {
      lastWinnerIdx = winner.idx;
      lastWinnerRem = winner.r;
      if (ri + 1 < rem.length) {
        const loser = rem[(ri + 1) % rem.length];
        firstLoserIdx = loser.idx;
        firstLoserRem = loser.r;
      }
    }
    assigned++;
    ri++;
    if (ri > rem.length * totalSeats) break;
  }

  if (lastWinnerIdx >= 0 && firstLoserIdx >= 0) {
    window.lastSeatInfo = {
      winner: parties[lastWinnerIdx].name,
      winnerQuotient: lastWinnerRem,
      winnerVotes: parties[lastWinnerIdx].votes,
      quota,
      loser: { name: parties[firstLoserIdx].name, votes: parties[firstLoserIdx].votes, quotient: firstLoserRem }
    };
  }

  return parties.map((p, i) => ({ ...p, seats: s[i] }));
}

/** Mayoritario de primera vuelta */
function majority(parties, totalSeats) {
  if (!parties.length) return [];
  const winner = parties.reduce((max, p) => p.votes > max.votes ? p : max);
  return parties.map(p => ({ ...p, seats: p === winner ? totalSeats : 0 }));
}

/** Mayoritario de segunda vuelta (lee del DOM de segunda vuelta) */
function majorityRound2(totalSeats) {
  const rows = [...document.querySelectorAll('#second-round-body tr')];
  const candidates = [];
  const existingNames = new Set();

  rows.forEach(tr => {
    const nameInput = tr.querySelector('input[type=text]');
    if (nameInput && nameInput.value.trim()) existingNames.add(nameInput.value.trim());
  });

  let unnamedCounter = 1;
  while (existingNames.has(toRoman(unnamedCounter))) unnamedCounter++;

  rows.forEach(tr => {
    const nameInput  = tr.querySelector('input[type=text]');
    const votesInput = tr.querySelector('input[type=number]');
    const colorInput = tr.querySelector('input[type=color]');
    if (!nameInput || !votesInput) return;

    let name = nameInput.value.trim();
    const votes = parseFloat(votesInput.value) || 0;
    const color = colorInput?.value || '#888888';

    if (!name && votes > 0) {
      name = toRoman(unnamedCounter);
      nameInput.value = name;
      existingNames.add(name);
      unnamedCounter++;
      while (existingNames.has(toRoman(unnamedCounter))) unnamedCounter++;
    }

    if (name && votes >= 0) candidates.push({ name, votes, color });
  });

  if (!candidates.length) return [];
  const winner = candidates.reduce((max, p) => p.votes > max.votes ? p : max);
  return candidates.map(p => ({ ...p, seats: p === winner ? totalSeats : 0 }));
}

/** Aplica el bono de mayoría al partido más votado */
function applyBonus(allocated, bonus, totalSeats, mode) {
  if (bonus <= 0 || !allocated.length) return;
  const winner = allocated.reduce((max, p) =>
    p.votes > max.votes || (p.votes === max.votes && p.seats > max.seats) ? p : max
  );
  winner.seats += bonus;
}

/* ── Helpers internos ── */

function _storeLastSeatInfo(parties, seats, allocations, divFn, totalSeats) {
  if (!allocations.length || totalSeats === 0) return;
  const lastWinner = allocations[allocations.length - 1];
  let firstLoser = null, firstLoserQ = -Infinity;

  parties.forEach((p, i) => {
    const nextQ = p.votes / divFn(seats[i]);
    if (nextQ > firstLoserQ) {
      firstLoserQ = nextQ;
      firstLoser = { name: p.name, votes: p.votes, quotient: nextQ };
    }
  });

  if (firstLoser) {
    const loserIdx = parties.findIndex(p => p.name === firstLoser.name);
    window.lastSeatInfo = {
      winner: lastWinner.partyName,
      winnerQuotient: lastWinner.quotient,
      winnerVotes: lastWinner.votes,
      loser: { ...firstLoser, currentSeats: loserIdx >= 0 ? seats[loserIdx] : 0 }
    };
  }
}
