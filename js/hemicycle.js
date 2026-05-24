/**
 * hemicycle.js
 * Visualización del hemiciclo usando conic-gradient
 */

function toggleHemicycleVisual() {
  const container = document.getElementById('hemicycle-container');
  const button = document.getElementById('hemicycle-toggle');

  if (container.style.display === 'none') {
    container.style.display = 'block';
    button.textContent = '▲ Representación visual';
    drawHemicycle();
  } else {
    container.style.display = 'none';
    button.textContent = '▼ Representación visual';
  }
}

function drawHemicycle() {
  const results = getResults();
  if (!results || results.length === 0) return;

  const chart = document.getElementById('hemicycle-chart');
  chart.innerHTML = '';

  const totalSeats = results.reduce((sum, r) => sum + r.seats, 0);
  if (totalSeats === 0) return;

  const hemicycle = document.createElement('div');
  hemicycle.style.cssText = `
    width: 100%;
    aspect-ratio: 2 / 1;
    border-radius: 50% / 100% 100% 0 0;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
  `;

  let conicStops = [];
  let currentPercentage = 0;

  results.forEach(result => {
    const seatPercentage = (result.seats / totalSeats) * 100;
    const startPercent = currentPercentage;
    const endPercent = currentPercentage + seatPercentage;

    conicStops.push(`${result.color} ${startPercent}% ${endPercent}%`);
    currentPercentage = endPercent;
  });

  const conicGradient = `conic-gradient(from 0.75turn at 50% 100%, ${conicStops.join(', ')})`;

  const gradientLayer = document.createElement('div');
  gradientLayer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${conicGradient};
    mask: radial-gradient(at 50% 100%, white 55%, transparent 55.5%);
    mask-mode: alpha;
    -webkit-mask: radial-gradient(at 50% 100%, #0000 55%, #000 55.5%);
    -webkit-mask-mode: alpha;
  `;

  hemicycle.appendChild(gradientLayer);

  const legend = document.createElement('div');
  legend.style.cssText = `
    width: 100%;
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  `;

  results.forEach(result => {
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
    `;

    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 16px;
      height: 16px;
      background-color: ${result.color};
      border-radius: 2px;
      border: 1px solid rgba(0,0,0,0.1);
    `;

    const label = document.createElement('span');
    label.textContent = `${result.name}: ${result.seats} esc.`;
    label.style.cssText = `
      color: var(--text);
      font-weight: 500;
    `;

    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  });

  chart.appendChild(hemicycle);
  chart.appendChild(legend);
}

function getResults() {
  const tbody = document.getElementById('results-body');
  if (!tbody) return [];

  const results = [];
  tbody.querySelectorAll('tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 4) {
      const nameCell = cells[0]?.textContent?.trim() || '';
      const seatsCell = cells[3];
      const seatsBadge = seatsCell?.querySelector('.result-badge');
      const seats = seatsBadge ? parseInt(seatsBadge.textContent?.trim()) || 0 : 0;

      const colorSwatch = tr.querySelector('.color-swatch');
      let color = '#888888';
      if (colorSwatch) {
        const bgStyle = window.getComputedStyle(colorSwatch).backgroundColor;
        if (bgStyle && bgStyle !== 'rgba(0, 0, 0, 0)') {
          color = bgStyle;
        }
      }

      if (nameCell && seats > 0) {
        results.push({ name: nameCell, seats, color });
      }
    }
  });

  return results;
}

function updateHemicycleIfVisible() {
  const container = document.getElementById('hemicycle-container');
  if (container && container.style.display !== 'none') {
    drawHemicycle();
  }
}

function showHemicycleToggle() {
  document.getElementById('hemicycle-toggle-container').style.display = 'block';
}

function hideHemicycleToggle() {
  document.getElementById('hemicycle-toggle-container').style.display = 'none';
  const container = document.getElementById('hemicycle-container');
  if (container) {
    container.style.display = 'none';
    const button = document.getElementById('hemicycle-toggle');
    if (button) button.textContent = '▼ Representación visual';
  }
}
