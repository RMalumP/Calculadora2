/**
 * pactometer.js
 * Pactómetro: tabla de partidos con bloques y visualización del hemiciclo.
 */

let pactRowCount      = 0;
let currentLeftLabel  = 'IZQ';
let currentRightLabel = 'DER';

/* ── FILAS DEL PACTÓMETRO ──────────────────────────────────── */

function addPactometerRow(name = '', seats = '', color = '', block = '') {
  const colorVal = color || PALETTE[pactRowCount % PALETTE.length];
  pactRowCount++;
  const tbody = document.getElementById('pactometer-body');
  const tr = document.createElement('tr');
  tr.dataset.pactRowId = pactRowCount;
  tr.dataset.block = block || '';
  tr.innerHTML = `
    <td><button class="del-btn" onclick="delPactometerRow(this)" title="Eliminar">✕</button></td>
    <td style="text-align:center;padding:4px 6px"><input type="color" value="${colorVal}" title="Color del partido" onchange="updateHemicycle()"></td>
    <td><input type="text" placeholder="Nombre del partido" value="${name}"></td>
    <td style="text-align:center"><input type="number" min="0" placeholder="0" value="${seats}" style="text-align:center;font-size:1.1rem;font-weight:600" oninput="updateHemicycle()"></td>
    <td style="text-align:center">
      <div style="display:flex;gap:4px;justify-content:center">
        <button onclick="setBlock(this,'left')"  style="padding:4px 8px;border:1px solid var(--border);background:${block==='left'?'var(--accent)':'white'};color:${block==='left'?'white':'var(--text-muted)'};border-radius:3px;cursor:pointer;font-size:0.7rem;font-weight:600;font-family:'Source Sans 3',sans-serif;min-width:40px" class="block-btn-left">${currentLeftLabel}</button>
        <button onclick="setBlock(this,'right')" style="padding:4px 8px;border:1px solid var(--border);background:${block==='right'?'var(--accent)':'white'};color:${block==='right'?'white':'var(--text-muted)'};border-radius:3px;cursor:pointer;font-size:0.7rem;font-weight:600;font-family:'Source Sans 3',sans-serif;min-width:40px" class="block-btn-right">${currentRightLabel}</button>
      </div>
    </td>`;
  tbody.appendChild(tr);

  const nameInput  = tr.querySelector('input[type=text]');
  const seatsInput = tr.querySelector('input[type=number]');

  nameInput.addEventListener('input', function () {
    const allRows = [...document.querySelectorAll('#pactometer-body tr')];
    if (tr === allRows[allRows.length - 1] && this.value.length > 0) addPactometerRow();
  });

  seatsInput.addEventListener('blur', function () {
    const n     = nameInput.value.trim();
    const s     = parseFloat(this.value) || 0;
    if (!n && s > 0) {
      const existing = new Set([...document.querySelectorAll('#pactometer-body tr')].map(r => r.querySelector('input[type=text]').value.trim()));
      let counter = 1;
      while (existing.has(toRoman(counter))) counter++;
      nameInput.value = toRoman(counter);
    }
  });
}

function delPactometerRow(btn) {
  const tbody = document.getElementById('pactometer-body');
  if (tbody.querySelectorAll('tr').length > 1) {
    btn.closest('tr').remove();
    updateHemicycle();
  }
}

function setBlock(btn, side) {
  const tr = btn.closest('tr');
  if (tr.dataset.block === side) {
    tr.dataset.block = '';
    tr.querySelectorAll('td:last-child button').forEach(b => {
      b.style.background = 'white';
      b.style.color = 'var(--text-muted)';
    });
  } else {
    tr.dataset.block = side;
    tr.querySelectorAll('td:last-child button').forEach(b => {
      const isSelected = (b.classList.contains('block-btn-left') && side === 'left') ||
                         (b.classList.contains('block-btn-right') && side === 'right');
      b.style.background = isSelected ? 'var(--accent)' : 'white';
      b.style.color      = isSelected ? 'white' : 'var(--text-muted)';
    });
  }
  updateHemicycle();
}

function copyResultsToPactometer(allocated, totalSeats) {
  const capName = currentSeatName.charAt(0).toUpperCase() + currentSeatName.slice(1);
  document.getElementById('pact-seats-header').textContent = capName;

  const tbody = document.getElementById('pactometer-body');
  tbody.innerHTML = '';
  pactRowCount = 0;

  const withSeats = allocated.filter(p => p.seats > 0);
  withSeats.forEach(party => addPactometerRow(party.name, party.seats, party.color, ''));

  if (withSeats.length > 0) {
    addPactometerRow(); addPactometerRow();
  } else {
    for (let i = 0; i < 5; i++) addPactometerRow();
  }

  updateHemicycle();
}

/* ── HEMICICLO ─────────────────────────────────────────────── */

function updateHemicycle() {
  const rows = [...document.querySelectorAll('#pactometer-body tr')];
  let calculatedTotal = 0, leftSeats = 0, rightSeats = 0, abstentionSeats = 0;
  const leftColors = [], rightColors = [], abstentionParties = [];

  rows.forEach(tr => {
    const seats = parseFloat(tr.querySelector('input[type=number]')?.value) || 0;
    const color = tr.querySelector('input[type=color]')?.value || '#888888';
    const name  = tr.querySelector('input[type=text]')?.value.trim() || '';
    const block = tr.dataset.block || '';

    if (seats > 0) {
      calculatedTotal += seats;
      if (block === 'left')  { leftSeats  += seats; leftColors.push({ seats, color }); }
      else if (block === 'right') { rightSeats += seats; rightColors.push({ seats, color }); }
      else { abstentionSeats += seats; abstentionParties.push({ name, color, seats }); }
    }
  });

  const pactTotalInput = document.getElementById('pact-total-seats');
  pactTotalInput.placeholder = `Automático: ${calculatedTotal}`;
  const fixedTotal = parseFloat(pactTotalInput.value) || 0;
  const totalSeats = fixedTotal > 0 ? Math.max(fixedTotal, calculatedTotal) : calculatedTotal;

  // Abstenciones
  const effectiveAbstentions = fixedTotal > calculatedTotal ? (fixedTotal - calculatedTotal + abstentionSeats) : abstentionSeats;
  document.getElementById('abstentions-count').textContent   = effectiveAbstentions || 0;
  document.getElementById('abstentions-percent').textContent = totalSeats > 0 ? `(${(effectiveAbstentions / totalSeats * 100).toFixed(1)}%)` : '';
  const abstColorsEl = document.getElementById('abstentions-colors');
  abstColorsEl.innerHTML = '';
  abstentionParties.forEach(p => {
    const box = document.createElement('div');
    box.title = `${p.name}: ${p.seats}`;
    box.style.cssText = `width:20px;height:20px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;cursor:help`;
    abstColorsEl.appendChild(box);
  });

  if (totalSeats === 0) {
    ['left-block','right-block'].forEach(id => { document.getElementById(id).style.width = '0%'; });
    ['left-label','right-label','majority-label'].forEach(id => { document.getElementById(id).textContent = ''; });
    const ls = document.getElementById('hemicycle-left-swatches');
    const rs = document.getElementById('hemicycle-right-swatches');
    if (ls) ls.innerHTML = '';
    if (rs) rs.innerHTML = '';
    const sep = document.getElementById('block-separator');
    if (sep) sep.style.display = 'none';
    return;
  }

  // Línea y etiqueta de mayoría
  const majority = Math.floor(totalSeats / 2) + 1;
  document.getElementById('majority-line').style.left  = '50%';
  const majorityLabel = document.getElementById('majority-label');
  majorityLabel.textContent = `${majority}`;
  majorityLabel.style.left = '50%';
  majorityLabel.style.transform = 'translate(-50%, -50%)';

  // Bloques
  const leftPercent  = (leftSeats  / totalSeats) * 100;
  const rightPercent = (rightSeats / totalSeats) * 100;
  document.getElementById('left-block').style.width      = `${leftPercent}%`;
  document.getElementById('left-block').style.background = createHorizontalGradient(leftColors, leftSeats);
  document.getElementById('right-block').style.width      = `${rightPercent}%`;
  document.getElementById('right-block').style.background = createHorizontalGradient(rightColors, rightSeats, true);
  document.getElementById('left-label').textContent  = leftSeats  || '';
  document.getElementById('right-label').textContent = rightSeats || '';

  // Swatches encima del hemiciclo
  const leftSwatches = document.getElementById('hemicycle-left-swatches');
  const rightSwatches = document.getElementById('hemicycle-right-swatches');
  if (leftSwatches) {
    leftSwatches.innerHTML = '';
    leftColors.forEach(p => {
      const box = document.createElement('div');
      box.style.cssText = `width:16px;height:16px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;flex-shrink:0`;
      leftSwatches.appendChild(box);
    });
  }
  if (rightSwatches) {
    rightSwatches.innerHTML = '';
    rightColors.forEach(p => {
      const box = document.createElement('div');
      box.style.cssText = `width:16px;height:16px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;flex-shrink:0`;
      rightSwatches.appendChild(box);
    });
  }

  // Doble línea separadora cuando los bloques se tocan
  const separator = document.getElementById('block-separator');
  if (separator) {
    const touching = leftSeats > 0 && rightSeats > 0 && (leftPercent + rightPercent) >= 99.5;
    if (touching) {
      separator.style.display = 'block';
      separator.style.left = `calc(${leftPercent}% - 3px)`;
    } else {
      separator.style.display = 'none';
    }
  }

  // Estado de mayoría
  _updateMajorityStatus(leftSeats, rightSeats, totalSeats, majority);

  // Panel de ajustes según modo
  _updateHemicycleSettings(leftSeats, rightSeats, totalSeats, majority);
}

function createHorizontalGradient(colors, total, reverse = false) {
  if (!colors.length) return 'transparent';
  if (colors.length === 1) return colors[0].color;
  let gradient = reverse ? 'linear-gradient(to left, ' : 'linear-gradient(to right, ';
  let cumulative = 0;
  colors.forEach((item, i) => {
    const pct = (item.seats / total) * 100;
    if (i > 0) gradient += ', ';
    gradient += `${item.color} ${cumulative}%, ${item.color} ${cumulative + pct}%`;
    cumulative += pct;
  });
  return gradient + ')';
}

function _updateMajorityStatus(leftSeats, rightSeats, totalSeats, absoluteMajority) {
  const majorityStatus = document.getElementById('majority-status');
  let winningSeats = 0, winningSide = '';
  if (leftSeats > rightSeats)       { winningSeats = leftSeats;  winningSide = 'left'; }
  else if (rightSeats > leftSeats)  { winningSeats = rightSeats; winningSide = 'right'; }

  if (winningSeats === 0 || leftSeats === rightSeats) { majorityStatus.style.display = 'none'; return; }

  const threesFifths = Math.floor(totalSeats * 3 / 5) + 1;
  const twoThirds    = Math.floor(totalSeats * 2 / 3) + 1;
  const sideLabel    = winningSide === 'left' ? currentLeftLabel : currentRightLabel;

  let statusText = '', bg = '';
  if      (winningSeats >= twoThirds)      { statusText = `${sideLabel} - Mayoría cualificada 2/3`;  bg = 'rgba(139,32,32,0.95)'; }
  else if (winningSeats >= threesFifths)   { statusText = `${sideLabel} - Mayoría cualificada 3/5`;  bg = 'rgba(139,32,32,0.90)'; }
  else if (winningSeats >= absoluteMajority){ statusText = `${sideLabel} - Mayoría absoluta`;         bg = 'rgba(139,32,32,0.85)'; }
  else                                     { statusText = `${sideLabel} - Mayoría simple`;            bg = 'rgba(100,100,100,0.85)'; }

  majorityStatus.textContent = statusText;
  majorityStatus.style.background = bg;
  majorityStatus.style.display = 'block';
}

function _updateHemicycleSettings(leftSeats, rightSeats, totalSeats, absoluteMajority) {
  const blockLabels     = document.getElementById('block-labels')?.value || 'izq-der';
  const votingSettings  = document.getElementById('voting-settings');
  const congressSettings = document.getElementById('congress-settings');
  const votingResult    = document.getElementById('voting-result');
  const isCongressMode  = currentSeatName === 'congresistas' || currentSeatName === 'escaños';
  const isConcejalesMode = currentSeatName === 'concejales';

  if (blockLabels === 'no-si') {
    votingSettings.style.display   = 'block';
    congressSettings.style.display = 'none';
  } else if (blockLabels === 'izq-der' && (isCongressMode || isConcejalesMode)) {
    votingSettings.style.display   = 'none';
    congressSettings.style.display = 'block';
    const congressLabel = document.getElementById('congress-label');
    if (congressLabel) congressLabel.textContent = isConcejalesMode ? 'Investidura alcaldía:' : 'Investidura en España:';
    const congressRoundSelect = document.getElementById('congress-round');
    if (congressRoundSelect) {
      if (isConcejalesMode) {
        if (congressRoundSelect.options.length !== 1 || congressRoundSelect.options[0].value !== 'first') {
          congressRoundSelect.innerHTML = '<option value="first">Mayoría absoluta</option>';
        }
        congressRoundSelect.disabled = true;
      } else {
        if (congressRoundSelect.options.length !== 2) {
          const savedVal = congressRoundSelect.value;
          congressRoundSelect.innerHTML = `
            <option value="first">Primera vuelta - Mayoría absoluta</option>
            <option value="second">Segunda vuelta - Mayoría simple</option>`;
          if (savedVal) congressRoundSelect.value = savedVal;
        }
        congressRoundSelect.disabled = false;
      }
    }
  } else {
    votingSettings.style.display   = 'none';
    congressSettings.style.display = 'none';
  }

  if (leftSeats === 0 && rightSeats === 0) { votingResult.style.display = 'none'; return; }

  const threesFifths    = Math.floor(totalSeats * 3 / 5) + 1;
  const twoThirds       = Math.floor(totalSeats * 2 / 3) + 1;

  if (blockLabels === 'no-si') {
    const requiredMajority = document.getElementById('required-majority')?.value || 'simple';
    _applyVotingResult(votingResult, leftSeats, rightSeats, requiredMajority, absoluteMajority, threesFifths, twoThirds, null, null, true);
  } else if (blockLabels === 'izq-der' && (isCongressMode || isConcejalesMode)) {
    const congressRound = document.getElementById('congress-round')?.value || 'first';
    _applyVotingResult(votingResult, leftSeats, rightSeats, congressRound === 'first' ? 'absolute' : 'simple', absoluteMajority, threesFifths, twoThirds, currentLeftLabel, currentRightLabel, false);
  } else {
    votingResult.style.display = 'none';
  }
}

function _applyVotingResult(el, leftSeats, rightSeats, mode, absMaj, threeFifths, twoThirds, leftLabel, rightLabel, isVote) {
  const useComparison = mode === 'simple';
  const threshold = mode === 'absolute' ? absMaj : mode === '3/5' ? threeFifths : mode === '2/3' ? twoThirds : null;

  if (isVote) {
    // SÍ = right, NO = left
    if (useComparison) {
      if (rightSeats > leftSeats)      _showResult(el, '✓ APROBADO',  'rgba(0,128,0,0.9)');
      else if (leftSeats > rightSeats) _showResult(el, '✗ RECHAZADO', 'rgba(139,32,32,0.9)');
      else el.style.display = 'none';
    } else {
      if (rightSeats >= threshold)      _showResult(el, '✓ APROBADO',  'rgba(0,128,0,0.9)');
      else if (leftSeats >= threshold)  _showResult(el, '✗ RECHAZADO', 'rgba(139,32,32,0.9)');
      else el.style.display = 'none';
    }
  } else {
    // Investidura
    if (useComparison) {
      if (leftSeats > rightSeats)       _showResult(el, `✓ ${leftLabel} INVESTIDO`,   'rgba(0,128,0,0.9)');
      else if (rightSeats > leftSeats)  _showResult(el, `✓ ${rightLabel} INVESTIDO`,  'rgba(0,128,0,0.9)');
      else                              _showResult(el, '✗ NO HAY INVESTIDURA', 'rgba(139,32,32,0.9)');
    } else {
      if (leftSeats >= threshold)       _showResult(el, `✓ ${leftLabel} INVESTIDO`,   'rgba(0,128,0,0.9)');
      else if (rightSeats >= threshold) _showResult(el, `✓ ${rightLabel} INVESTIDO`,  'rgba(0,128,0,0.9)');
      else                              _showResult(el, '✗ NO HAY INVESTIDURA', 'rgba(139,32,32,0.9)');
    }
  }
}

function _showResult(el, text, bg) {
  el.textContent = text;
  el.style.background = bg;
  el.style.display = 'block';
}

/* ── ETIQUETAS DE BLOQUES ───────────────────────────────────── */

function updateBlockLabels() {
  const selector   = document.getElementById('block-labels');
  const customLeft = document.getElementById('custom-left-label');
  const customRight = document.getElementById('custom-right-label');

  if (selector.value === 'izq-der') {
    currentLeftLabel = 'IZQ'; currentRightLabel = 'DER';
    customLeft.style.display = customRight.style.display = 'none';
  } else if (selector.value === 'no-si') {
    currentLeftLabel = 'NO'; currentRightLabel = 'SÍ';
    customLeft.style.display = customRight.style.display = 'none';
  } else {
    customLeft.style.display = customRight.style.display = 'inline-block';
    currentLeftLabel  = customLeft.value  || 'IZQ';
    currentRightLabel = customRight.value || 'DER';
  }

  document.querySelectorAll('.block-btn-left').forEach(b => b.textContent  = currentLeftLabel);
  document.querySelectorAll('.block-btn-right').forEach(b => b.textContent = currentRightLabel);
  updateHemicycleLabels();
  updateHemicycle();
}

function updateCustomBlockLabels() {
  currentLeftLabel  = document.getElementById('custom-left-label').value  || 'IZQ';
  currentRightLabel = document.getElementById('custom-right-label').value || 'DER';
  document.querySelectorAll('.block-btn-left').forEach(b => b.textContent  = currentLeftLabel);
  document.querySelectorAll('.block-btn-right').forEach(b => b.textContent = currentRightLabel);
  updateHemicycleLabels();
}

function updateHemicycleLabels() {
  const l = document.getElementById('hemicycle-left-label');
  const r = document.getElementById('hemicycle-right-label');
  if (l) l.textContent = currentLeftLabel;
  if (r) r.textContent = currentRightLabel;
}
