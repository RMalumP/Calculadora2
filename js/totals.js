/**
 * totals.js
 * Cálculo de totales de votos, censo y participación.
 */

function updateTotals() {
  const rows = getAllPartyRows();
  let sumParty = 0;

  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('input[type=number]');
    sumParty += parseFloat(input?.value) || 0;
  });

  const blank = parseFloat(document.getElementById('blank-votes').value) || 0;
  const nullv  = parseFloat(document.getElementById('null-votes').value) || 0;
  const totalValid = sumParty + blank;
  const totalAll   = totalValid + nullv;

  document.getElementById('total-valid').textContent = totalValid.toLocaleString('es-ES');
  document.getElementById('total-all').textContent   = totalAll.toLocaleString('es-ES');

  // Ajuste automático del censo cuando los votos cambian
  const censusInput = document.getElementById('census-total');
  const abstInput   = document.getElementById('abstention');
  const currentCensus = parseFloat(censusInput.value) || 0;
  const currentAbst   = parseFloat(abstInput.value) || 0;

  if (totalAll > 0) {
    const expectedCensus = totalAll + currentAbst;
    if (expectedCensus > currentCensus) {
      censusInput.value = expectedCensus;
    } else if (currentCensus > 0 && currentCensus < totalAll) {
      abstInput.value   = 0;
      censusInput.value = totalAll;
    }
  }

  updateParticipation();

  // Porcentaje por partido (sobre votos válidos)
  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('input[type=number]');
    const v = parseFloat(input?.value) || 0;
    tr.querySelector('.pct-display').innerHTML = totalValid > 0 ? pctBar(v / totalValid * 100) : '—';
  });

  document.getElementById('blank-pct').innerHTML = totalValid > 0 ? pctBar(blank / totalValid * 100) : '—';
  document.getElementById('null-pct').innerHTML  = totalAll  > 0 ? pctBar(nullv / totalAll  * 100) : '—';
}

function updateCensus(source) {
  const totalValid = _parseTotalValid();
  const nullv      = parseFloat(document.getElementById('null-votes').value) || 0;
  const totalAll   = totalValid + nullv;
  const censusInput = document.getElementById('census-total');
  const abstInput   = document.getElementById('abstention');

  if (source === 'total') {
    const census = parseFloat(censusInput.value) || 0;
    if (census >= totalAll) {
      abstInput.value = census - totalAll;
    } else if (census > 0 && census < totalAll) {
      censusInput.value = totalAll;
      abstInput.value   = 0;
    }
  } else if (source === 'abstention') {
    const abst = parseFloat(abstInput.value) || 0;
    censusInput.value = totalAll + abst;
  }

  updateParticipation();
}

function updateParticipation() {
  const totalValid = _parseTotalValid();
  const nullv      = parseFloat(document.getElementById('null-votes').value) || 0;
  const totalAll   = totalValid + nullv;
  const census     = parseFloat(document.getElementById('census-total').value) || 0;
  const abst       = parseFloat(document.getElementById('abstention').value) || 0;

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

/* Helper: lee el total de votos válidos del DOM */
function _parseTotalValid() {
  return parseFloat(document.getElementById('total-valid').textContent.replace(/\./g,'').replace(/,/g,'')) || 0;
}
