/**
 * hemicycle.js
 * Visualización del hemiciclo con distribución de escaños
 */

let _hemicycleDragStart = null;
let _hemicycleOffset = { x: 0, y: 0 };

function toggleHemicycleVisual() {
  const window = document.getElementById('hemicycle-window');
  const button = document.getElementById('hemicycle-toggle');

  if (window.style.display === 'none') {
    window.style.display = 'block';
    button.textContent = '▲ Representación visual';
    drawHemicycle();
  } else {
    window.style.display = 'none';
    button.textContent = '▼ Representación visual';
  }
}

function closeHemicycleWindow() {
  const window = document.getElementById('hemicycle-window');
  const button = document.getElementById('hemicycle-toggle');
  window.style.display = 'none';
  button.textContent = '▼ Representación visual';
}

function makeHemicycleDraggable() {
  const hemicycleWindow = document.getElementById('hemicycle-window');
  const header = document.getElementById('hemicycle-header');

  header.addEventListener('mousedown', (e) => {
    _hemicycleDragStart = { x: e.clientX, y: e.clientY };
    const rect = hemicycleWindow.getBoundingClientRect();
    _hemicycleOffset = {
      x: rect.left - e.clientX,
      y: rect.top - e.clientY
    };

    document.addEventListener('mousemove', dragHemicycle);
    document.addEventListener('mouseup', stopDragHemicycle);
  });
}

function dragHemicycle(e) {
  if (!_hemicycleDragStart) return;

  const hemicycleWindow = document.getElementById('hemicycle-window');
  const newX = e.clientX + _hemicycleOffset.x;
  const newY = e.clientY + _hemicycleOffset.y;

  hemicycleWindow.style.position = 'fixed';
  hemicycleWindow.style.left = newX + 'px';
  hemicycleWindow.style.top = newY + 'px';
  hemicycleWindow.style.right = 'auto';
}

function stopDragHemicycle() {
  _hemicycleDragStart = null;
  document.removeEventListener('mousemove', dragHemicycle);
  document.removeEventListener('mouseup', stopDragHemicycle);
}

function drawHemicycle() {
  const results = getResults();
  if (!results || results.length === 0) return;

  const svg = document.getElementById('hemicycle-svg');
  svg.innerHTML = '';

  const width = 385;
  const height = 192.5;
  const centerX = width / 2;
  const centerY = height;
  const radiusOuter = 192.5;
  const radiusInner = 146.3;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const totalSeats = results.reduce((sum, r) => sum + r.seats, 0);
  if (totalSeats === 0) return;

  const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute('id', 'hemicycle-sectors');
  mainGroup.setAttribute('transform', `translate(${centerX},${centerY})`);

  let currentAngleDeg = 0;
  const anglePerSeat = 180 / totalSeats;

  results.forEach(result => {
    for (let i = 0; i < result.seats; i++) {
      const startAngleDeg = currentAngleDeg;
      const endAngleDeg = currentAngleDeg + anglePerSeat;
      const startAngleRad = (startAngleDeg - 90) * Math.PI / 180;
      const endAngleRad = (endAngleDeg - 90) * Math.PI / 180;

      const x1Outer = radiusOuter * Math.cos(startAngleRad);
      const y1Outer = radiusOuter * Math.sin(startAngleRad);
      const x2Outer = radiusOuter * Math.cos(endAngleRad);
      const y2Outer = radiusOuter * Math.sin(endAngleRad);

      const x1Inner = radiusInner * Math.cos(startAngleRad);
      const y1Inner = radiusInner * Math.sin(startAngleRad);
      const x2Inner = radiusInner * Math.cos(endAngleRad);
      const y2Inner = radiusInner * Math.sin(endAngleRad);

      const largeArc = anglePerSeat > 90 ? 1 : 0;

      const pathData = `
        M ${x1Outer},${y1Outer}
        A ${radiusOuter},${radiusOuter} 0 ${largeArc},1 ${x2Outer},${y2Outer}
        L ${x2Inner},${y2Inner}
        A ${radiusInner},${radiusInner} 0 ${largeArc},0 ${x1Inner},${y1Inner}
        Z
      `;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', result.color);
      path.setAttribute('stroke', 'white');
      path.setAttribute('stroke-width', '0.5');
      path.setAttribute('opacity', '0.95');

      mainGroup.appendChild(path);
      currentAngleDeg += anglePerSeat;
    }
  });

  svg.appendChild(mainGroup);
}

function getResults() {
  const tbody = document.getElementById('results-body');
  if (!tbody) return [];

  const results = [];
  tbody.querySelectorAll('tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 4) {
      const name = cells[0]?.textContent?.trim() || '';
      const seats = parseInt(cells[3]?.textContent?.trim()) || 0;
      const colorInput = tr.querySelector('input[type=color]');
      const color = colorInput ? colorInput.value : '#888888';

      if (name && seats > 0) {
        results.push({ name, seats, color });
      }
    }
  });

  return results;
}

function updateHemicycleIfVisible() {
  const window = document.getElementById('hemicycle-window');
  if (window && window.style.display !== 'none') {
    drawHemicycle();
  }
}

function showHemicycleToggle() {
  document.getElementById('hemicycle-container-toggle').style.display = 'block';
}

function hideHemicycleToggle() {
  document.getElementById('hemicycle-container-toggle').style.display = 'none';
  closeHemicycleWindow();
}

document.addEventListener('DOMContentLoaded', makeHemicycleDraggable);
