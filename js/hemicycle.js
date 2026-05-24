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

  const container = document.getElementById('hemicycle-svg').parentElement;
  if (!container) return;

  let segmentsContainer = container.querySelector('#hemicycle-segments-container');
  if (!segmentsContainer) {
    segmentsContainer = document.createElement('div');
    segmentsContainer.id = 'hemicycle-segments-container';
    segmentsContainer.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 400px;
      aspect-ratio: 2/1;
      margin: 0 auto;
    `;
    container.insertBefore(segmentsContainer, container.firstChild);
  }
  segmentsContainer.innerHTML = '';

  const totalSeats = results.reduce((sum, r) => sum + r.seats, 0);
  if (totalSeats === 0) return;

  const radius = 150;
  const seatSize = 14;
  const radiusCenter = radius - seatSize / 2;

  let seatIndex = 0;
  results.forEach(result => {
    for (let i = 0; i < result.seats; i++) {
      const anglePercent = seatIndex / totalSeats;
      const angleDeg = anglePercent * 180;
      const angleRad = (angleDeg - 90) * Math.PI / 180;

      const x = radiusCenter * Math.cos(angleRad);
      const y = radiusCenter * Math.sin(angleRad);

      const seat = document.createElement('div');
      seat.style.cssText = `
        position: absolute;
        width: ${seatSize}px;
        height: ${seatSize}px;
        background-color: ${result.color};
        border: 1px solid white;
        border-radius: 2px;
        left: 50%;
        top: 50%;
        transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px));
        cursor: default;
        transition: opacity 0.2s;
      `;
      seat.title = `${result.name}`;

      seat.addEventListener('mouseenter', () => {
        seat.style.opacity = '0.8';
      });
      seat.addEventListener('mouseleave', () => {
        seat.style.opacity = '1';
      });

      segmentsContainer.appendChild(seat);
      seatIndex++;
    }
  });
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
        color = bgStyle || '#888888';
      }

      if (nameCell && seats > 0) {
        results.push({ name: nameCell, seats, color });
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
