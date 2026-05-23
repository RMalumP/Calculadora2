/**
 * ui.js
 * Controles de interfaz: tabs, parámetros, reinicio, guardado, teoría, drag & drop.
 */

/* ── SIGLAS ───────────────────────────────────────────────── */

let siglasVisible = false;
let namesHidden = false;

function toggleSiglasVisibility() {
  siglasVisible = !siglasVisible;
  const btn = document.getElementById('siglas-toggle-btn');
  if (btn) btn.textContent = siglasVisible ? 'Siglas ▲' : 'Siglas ▼';

  document.querySelectorAll('#votes-body .siglas-input').forEach(inp => {
    inp.classList.toggle('siglas-visible', siglasVisible);
  });

  document.querySelectorAll('.result-siglas-prefix').forEach(el => {
    el.style.display = siglasVisible ? '' : 'none';
    if (siglasVisible) {
      const s = el.dataset.siglas || '';
      el.textContent = s + (namesHidden ? '' : '-');
    }
  });

  // Segunda vuelta
  document.querySelectorAll('#second-round-body .sr-siglas-prefix').forEach(el => {
    const s = el.dataset.siglas || '';
    el.style.display = (siglasVisible && s) ? '' : 'none';
    if (siglasVisible && s) el.textContent = s + (namesHidden ? '' : '-');
  });
  document.querySelectorAll('#second-round-body .sr-name-input').forEach(inp => {
    inp.style.display = namesHidden ? 'none' : '';
  });

  const hideNamesBtn = document.getElementById('hide-names-btn');
  if (hideNamesBtn) hideNamesBtn.style.display = siglasVisible ? '' : 'none';

  if (!siglasVisible && namesHidden) {
    namesHidden = false;
    if (hideNamesBtn) hideNamesBtn.textContent = 'Ocultar nombre';
    document.querySelectorAll('#votes-body .name-input').forEach(inp => {
      inp.style.color = '';
    });
    document.querySelectorAll('.result-party-name').forEach(el => {
      el.style.display = '';
    });
    document.querySelectorAll('#second-round-body .sr-name-input').forEach(inp => {
      inp.style.display = '';
    });
  }
}

function toggleHideNames() {
  namesHidden = !namesHidden;
  const btn = document.getElementById('hide-names-btn');
  if (btn) btn.textContent = namesHidden ? 'Mostrar nombre' : 'Ocultar nombre';

  // Tabla de votos: solo cambiar color, el nombre sigue visible
  document.querySelectorAll('#votes-body .name-input').forEach(inp => {
    inp.style.color = namesHidden ? '#8b3131' : '';
  });

  // Tabla de escaños: ocultar/mostrar el nombre del partido
  document.querySelectorAll('.result-party-name').forEach(el => {
    el.style.display = namesHidden ? 'none' : '';
  });

  // Guión del prefijo siglas: desaparece cuando el nombre está oculto
  document.querySelectorAll('.result-siglas-prefix').forEach(el => {
    const s = el.dataset.siglas || '';
    el.textContent = s + (namesHidden ? '' : '-');
  });

  // Segunda vuelta
  document.querySelectorAll('#second-round-body .sr-name-input').forEach(inp => {
    inp.style.display = namesHidden ? 'none' : '';
  });
  document.querySelectorAll('#second-round-body .sr-siglas-prefix').forEach(el => {
    const s = el.dataset.siglas || '';
    el.textContent = s + (namesHidden ? '' : '-');
  });
}

/* ── TABS ─────────────────────────────────────────────────── */

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  const tabMap = { calculator: 'calculator-tab', advanced: 'advanced-tab', pactometer: 'pactometer-tab', theory: 'theory-tab' };
  const tabId  = tabMap[tabName];
  if (!tabId) return;
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
}

/* ── FÓRMULA ─────────────────────────────────────────────── */

let _seatsBeforeMajority = 350;
let _inMajorityMode = false;

function buildFormulaSelect() {
  const sel = document.getElementById('formula-select');
  [{ key: 'maj', label: 'Sistemas mayoritarios' }, { key: 'pr', label: 'Sistemas proporcionales' }].forEach(g => {
    const grp = document.createElement('optgroup');
    grp.label = g.label;
    FORMULAS.filter(f => f.group === g.key).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
  sel.value = 'dhondt';
  updateFormulaDesc();
}

function updateFormulaDesc() {
  const val = document.getElementById('formula-select').value;
  const f = FORMULAS.find(x => x.id === val);
  document.getElementById('formula-desc').textContent = f ? f.desc : '';

  const srContainer = document.getElementById('second-round-container');
  if (val === 'majority_round2') {
    srContainer.style.display = 'block';
    prepareSecondRound();
  } else {
    srContainer.style.display = 'none';
  }

  const nowMajority = val === 'majority' || val === 'majority_round2';
  const seatsInput  = document.getElementById('seats');
  if (nowMajority && !_inMajorityMode) {
    _seatsBeforeMajority = parseInt(seatsInput.value) || 350;
    seatsInput.value = 1;
  } else if (!nowMajority && _inMajorityMode) {
    seatsInput.value = _seatsBeforeMajority;
  }
  _inMajorityMode = nowMajority;

  const bonus = document.getElementById('bonus-field');
  bonus.style.display = nowMajority ? 'none' : 'block';
}

/* ── PARÁMETROS ──────────────────────────────────────────── */

function toggleParamField(fieldName) {
  const wrap  = document.getElementById(`${fieldName}-input-wrap`);
  const label = document.getElementById(`${fieldName}-label-toggle`);
  const collapsed = wrap.style.display === 'none';
  wrap.style.display = collapsed ? 'block' : 'none';
  label.textContent = label.textContent.replace(collapsed ? '▼' : '▲', collapsed ? '▲' : '▼');
}

function getBonusMode() {
  return document.getElementById('bonus-mode-value')?.value || 'included';
}

function setBonusMode(mode) {
  document.getElementById('bonus-mode-value').value = mode;
  document.getElementById('bonus-btn-included').classList.toggle('bonus-active', mode === 'included');
  document.getElementById('bonus-btn-extra').classList.toggle('bonus-active',    mode !== 'included');
  document.getElementById('bonus-desc-included').style.display = mode === 'included' ? 'block' : 'none';
  document.getElementById('bonus-desc-extra').style.display    = mode === 'included' ? 'none' : 'block';
  calculate();
}

/* ── NOMBRES DE ESCAÑOS ──────────────────────────────────── */

function updateSeatNames() {
  const val = document.getElementById('seat-rename').value;
  currentSeatName = val;
  const cap = val.charAt(0).toUpperCase() + val.slice(1);
  const singularMap = { 'escaños':'escaño', 'parlamentarios':'parlamentario', 'diputados':'diputado', 'concejales':'concejal', 'congresistas':'congresista' };
  const singular = singularMap[val] ?? val.slice(0, -1);

  const seatsLabel = document.getElementById('seats-label-toggle');
  seatsLabel.textContent = `${seatsLabel.textContent.startsWith('▲') ? '▲ ' : '▼ '}Número de ${val}`;

  document.getElementById('results-title').textContent      = `Distribución de ${val}`;
  document.getElementById('seats-col-header').textContent   = singular.charAt(0).toUpperCase() + singular.slice(1);
  document.getElementById('seats-pct-header').textContent   = `% ${val.slice(0, 3)}.`;

  const lastSeatWord = document.getElementById('last-seat-word-toggle');
  if (lastSeatWord) lastSeatWord.textContent = singular;

  document.querySelectorAll('.seat-name-ref').forEach(el => { el.textContent = val; });
  document.getElementById('pact-seats-header').textContent = cap;

  if (typeof updateHemicycle === 'function') updateHemicycle();
}

/* ── DESGLOSE DE COCIENTES ───────────────────────────────── */

function toggleBreakdown() {
  const content = document.getElementById('breakdown-content');
  const button  = document.getElementById('breakdown-toggle');
  const open    = content.style.display === 'none';

  content.style.display = open ? 'block' : 'none';
  button.innerHTML = open ? '▲ Ocultar desglose de cocientes' : '▼ Mostrar desglose de cocientes';
  document.body.classList.toggle('breakdown-visible', open);

  if (open) {
    setTimeout(() => {
      const col = document.querySelector('.col-breakdown');
      if (col) document.documentElement.style.setProperty('--breakdown-width', `${col.offsetWidth}px`);
    }, 10);
  }
}

/* ── ÚLTIMO ESCAÑO ───────────────────────────────────────── */

function toggleLastSeat() {
  const inner = document.getElementById('last-seat-info');
  const btn   = document.getElementById('last-seat-toggle');
  const open  = inner.style.display === 'block';
  const singularMap = { 'escaños':'escaño', 'parlamentarios':'parlamentario', 'diputados':'diputado', 'concejales':'concejal', 'congresistas':'congresista' };
  const singular = singularMap[currentSeatName] ?? currentSeatName.slice(0, -1);
  inner.style.display = open ? 'none' : 'block';
  btn.innerHTML = open
    ? `▼ Mostrar análisis del último <span id="last-seat-word-toggle">${singular}</span>`
    : `▲ Ocultar análisis del último <span id="last-seat-word-toggle">${singular}</span>`;
}

/* ── REINICIO ────────────────────────────────────────────── */

function resetCalculator() {
  if (!confirm('¿Reiniciar la calculadora? Se perderán todos los datos introducidos.')) return;

  document.getElementById('votes-body').innerHTML = '';
  rowCount = 0;
  for (let i = 0; i < 5; i++) addRow();
  addRow('Otros partidos', '', '#474747', true);

  otrosAbsorbedParties = [];
  _sinNombreCounter = 0;
  updateOtrosDropdown();

  ['blank-votes','null-votes','census-total','abstention'].forEach(id => {
    document.getElementById(id).value = '';
  });

  updateTotals();

  ['results-card','last-seat-container','breakdown-section','second-round-container'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  getPartyRows().forEach(tr => tr.classList.remove('no-seats', 'barrier-blocked'));
}

function resetPactometer() {
  if (!confirm('¿Reiniciar el pactómetro? Se perderán todos los datos.')) return;
  document.getElementById('pactometer-body').innerHTML = '';
  pactRowCount = 0;
  for (let i = 0; i < 5; i++) addPactometerRow();
  updateHemicycle();
}

function clearPactometerSeats() {
  document.querySelectorAll('#pactometer-body input[type=number]').forEach(inp => { inp.value = ''; });
  updateHemicycle();
}

function clearPactometerBlocks() {
  document.querySelectorAll('#pactometer-body tr').forEach(tr => {
    tr.dataset.block = '';
    tr.querySelectorAll('td:last-child button').forEach(b => {
      b.style.background = '';
      b.style.color = '';
    });
  });
  updateHemicycle();
}

/* ── TEORÍA ──────────────────────────────────────────────── */

function showTheorySystem(systemId) {
  document.querySelectorAll('.theory-content-section').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  document.querySelectorAll('.theory-system-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'white';
    b.style.color = 'var(--text)';
    b.style.border = '1px solid var(--border)';
  });

  const contentEl = document.getElementById(`theory-${systemId}`);
  if (contentEl) { contentEl.classList.add('active'); contentEl.style.display = 'block'; }

  document.querySelectorAll('.theory-system-btn').forEach(b => {
    if (b.dataset.system === systemId) {
      b.classList.add('active');
      b.style.background = 'var(--accent)';
      b.style.color = 'white';
      b.style.border = 'none';
    }
  });
}

/* ── GUARDAR HTML ────────────────────────────────────────── */

function saveHTML() {
  document.querySelectorAll('input, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked ? el.setAttribute('checked', '') : el.removeAttribute('checked');
    } else if (el.tagName === 'SELECT') {
      [...el.options].forEach(opt => opt.selected ? opt.setAttribute('selected', '') : opt.removeAttribute('selected'));
    } else {
      el.setAttribute('value', el.value);
    }
  });

  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  a.download = 'calculadora_electoral_' + ts + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── DRAG & DROP ─────────────────────────────────────────── */

(function initDragDrop() {
  let dragSrc = null;

  function getRows() {
    return [...document.querySelectorAll('#votes-body tr')].filter(
      tr => !tr.dataset.isOtros && tr.style.display !== 'none'
    );
  }

  function clearDragStyles() {
    document.querySelectorAll('#votes-body tr').forEach(tr =>
      tr.classList.remove('dragging', 'drag-over-above', 'drag-over-below')
    );
  }

  function attachHandle(handle, tr) {
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragSrc = tr;
      tr.classList.add('dragging');

      function onMouseMove(ev) {
        clearDragStyles();
        tr.classList.add('dragging');
        for (const row of getRows()) {
          if (row === dragSrc) continue;
          const rect = row.getBoundingClientRect();
          if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
            row.classList.add(ev.clientY < rect.top + rect.height / 2 ? 'drag-over-above' : 'drag-over-below');
            break;
          }
        }
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (!dragSrc) { clearDragStyles(); return; }

        const tbody = document.getElementById('votes-body');
        const above = tbody.querySelector('.drag-over-above');
        const below = tbody.querySelector('.drag-over-below');

        if (above && above !== dragSrc) {
          tbody.insertBefore(dragSrc, above);
        } else if (below && below !== dragSrc) {
          const next = below.nextElementSibling;
          if (next) tbody.insertBefore(dragSrc, next);
        }

        clearDragStyles();
        dragSrc = null;
        enforceOtrosLast();
        updateTotals();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1 || node.tagName !== 'TR') return;
      if (node.dataset.isOtros) return;
      const handle = node.querySelector('.drag-handle');
      if (handle) attachHandle(handle, node);
    }));
  });

  document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('votes-body');
    if (tbody) {
      observer.observe(tbody, { childList: true });
      tbody.querySelectorAll('tr:not([data-is-otros]) .drag-handle').forEach(h => attachHandle(h, h.closest('tr')));
    }
  });
})();

/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  buildFormulaSelect();
  for (let i = 0; i < 5; i++) addRow();
  addRow('Otros partidos', '', '#474747', true);
  for (let i = 0; i < 5; i++) addPactometerRow();
  updateHemicycle();
});
