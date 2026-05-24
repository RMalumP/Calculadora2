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

  const width = 500;
  const height = 300;
  const centerX = width / 2;
  const centerY = height * 0.75;
  const radius = 120;

  const totalSeats = results.reduce((sum, r) => sum + r.seats, 0);
  if (totalSeats === 0) return;

  let currentAngle = 0;
  const anglePerSeat = Math.PI / totalSeats;

  results.forEach(result => {
    for (let i = 0; i < result.seats; i++) {
      const angle = Math.PI + currentAngle;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY - radius * Math.sin(angle);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '8');
      circle.setAttribute('fill', result.color);
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '1');
      circle.setAttribute('opacity', '0.9');

      svg.appendChild(circle);
      currentAngle += anglePerSeat;
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
