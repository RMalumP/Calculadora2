/**
 * totals.js
 * Cálculo de totales de votos, censo y participación.
 */

let _realTotalValid = 0;
let _realTotalAll   = 0;

// Se desactiva cuando el usuario escribe un valor manual en el campo de censo.
// Se reactiva al borrarlo o al reiniciar la calculadora.
let _censusAutoTracking = true;

function updateTotals() {
  const rows = getAllPartyRows();
  let sumParty = 0;

  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('.votes-input');
    sumParty += parseVoteValue(input?.value);
  });

  const blank = parseVoteValue(document.getElementById('blank-votes').value);
  const nullv  = parseVoteValue(document.getElementById('null-votes').value);
  const totalValid = sumParty + blank;
  const totalAll   = totalValid + nullv;

  _realTotalValid = totalValid;
  _realTotalAll   = totalAll;

  document.getElementById('total-valid').textContent = totalValid.toLocaleString('es-ES');
  document.getElementById('total-all').textContent   = totalAll.toLocaleString('es-ES');

  const censusInput = document.getElementById('census-total');
  const abstInput   = document.getElementById('abstention');
  const currentCensus = parseVoteValue(censusInput.value);
  const currentAbst   = parseVoteValue(abstInput.value);

  if (totalAll > 0) {
    const expectedCensus = totalAll + currentAbst;
    if (expectedCensus > currentCensus) {
      censusInput.value = addThousandDots(expectedCensus);
    } else if (currentCensus > 0 && currentCensus < totalAll) {
      abstInput.value   = '';
      censusInput.value = addThousandDots(totalAll);
    }
  }

  updateParticipation();

  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('.votes-input');
    const v = parseVoteValue(input?.value);
    tr.querySelector('.pct-display').innerHTML = totalValid > 0 ? pctBar(v / totalValid * 100) : '—';
  });

  document.getElementById('blank-pct').innerHTML = totalValid > 0 ? pctBar(blank / totalValid * 100) : '—';
  document.getElementById('null-pct').innerHTML  = totalAll  > 0 ? pctBar(nullv / totalAll  * 100) : '—';

  const census = parseVoteValue(censusInput.value);
  const maxTotal = census > 0 ? census : Infinity;
  document.getElementById('total-valid').textContent = Math.min(totalValid, maxTotal).toLocaleString('es-ES');
  document.getElementById('total-all').textContent   = Math.min(totalAll,   maxTotal).toLocaleString('es-ES');
}

function updateCensus(source) {
  const nullv      = parseVoteValue(document.getElementById('null-votes').value);
  const totalAll   = _realTotalValid + nullv;
  const censusInput = document.getElementById('census-total');
  const abstInput   = document.getElementById('abstention');

  if (source === 'total') {
    const census = parseVoteValue(censusInput.value);
    _censusAutoTracking = (census === 0);
    if (census >= totalAll) {
      abstInput.value = addThousandDots(census - totalAll);
    } else if (census > 0 && census < totalAll) {
      censusInput.value = addThousandDots(totalAll);
      abstInput.value   = '';
    }
  } else if (source === 'abstention') {
    const abst = parseVoteValue(abstInput.value);
    censusInput.value = addThousandDots(totalAll + abst);
  }

  updateParticipation();
}

function updateParticipation() {
  const nullv   = parseVoteValue(document.getElementById('null-votes').value);
  const totalAll = _realTotalValid + nullv;
  const census   = parseVoteValue(document.getElementById('census-total').value);
  const abst     = parseVoteValue(document.getElementById('abstention').value);

  if (census > 0 && totalAll > 0) {
    document.getElementById('total-participation').textContent = (totalAll / census * 100).toFixed(2) + '%';
    document.getElementById('abstention-pct').innerHTML = pctBar(abst / census * 100);
  } else if (totalAll > 0) {
    document.getElementById('total-participation').textContent = '100%';
    document.getElementById('abstention-pct').innerHTML = '0%';
  } else {
    document.getElementById('total-participation').textContent = '—';
    document.getElementById('abstention-pct').innerHTML = '—';
  }
}

function pctBar(pct) {
  return `${pct.toFixed(2)}%`;
}

function syncCensusAfterVotes() {
  if (!_censusAutoTracking || _realTotalAll === 0) return;
  const censusInput = document.getElementById('census-total');
  const abstInput   = document.getElementById('abstention');
  const abst = parseVoteValue(abstInput.value);
  censusInput.value = addThousandDots(_realTotalAll + abst);
  updateParticipation();
}
