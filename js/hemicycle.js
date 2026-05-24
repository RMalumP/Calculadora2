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

  const container = document.getElementById('hemicycle-svg');
  if (!container) return;

  const totalSeats = results.reduce((sum, r) => sum + r.seats, 0);
  if (totalSeats === 0) return;

  container.innerHTML = '';

  const width = 350;
  const height = 175;
  const centerX = width / 2;
  const centerY = height;
  const radius = height;

  const ul = document.createElement('ul');
  ul.className = 'hemicycle-chart';
  ul.style.cssText = `
    position: relative;
    width: ${width}px;
    height: ${height}px;
    margin: 0 auto;
    padding: 0;
    list-style: none;
  `;

  let startAngle = 180;
  results.forEach((result, idx) => {
    const percentWidth = (result.seats / totalSeats) * 100;
    const angleSpan = (result.seats / totalSeats) * 180;
    const endAngle = startAngle - angleSpan;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const clipPath = `polygon(50% 100%, ${(x1/width)*100}% ${(y1/height)*100}%, ${(x2/width)*100}% ${(y2/height)*100}%)`;

    const li = document.createElement('li');
    li.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: ${result.color};
      cursor: default;
      transition: opacity 0.2s;
      clip-path: ${clipPath};
    `;
    li.title = `${result.name}: ${result.seats} escaños`;

    const span = document.createElement('span');
    span.textContent = `${result.name}`;
    span.style.cssText = `
      position: absolute;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      text-align: center;
      white-space: nowrap;
      transform: translate(-50%, -50%);
    `;

    const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
    const labelRadius = radius * 0.6;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);
    span.style.left = labelX + 'px';
    span.style.top = labelY + 'px';

    li.appendChild(span);

    li.addEventListener('mouseenter', () => {
      li.style.opacity = '0.8';
    });
    li.addEventListener('mouseleave', () => {
      li.style.opacity = '1';
    });

    ul.appendChild(li);
    startAngle = endAngle;
  });

  const before = document.createElement('div');
  before.style.cssText = `
    position: absolute;
    width: ${width}px;
    height: ${height}px;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    border: 45px solid rgba(211, 211, 211, 0.2);
    border-bottom: none;
    border-top-left-radius: ${height}px;
    border-top-right-radius: ${height}px;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 10;
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: relative;
    display: inline-block;
    width: 100%;
  `;

  wrapper.appendChild(ul);
  wrapper.appendChild(before);

  container.appendChild(wrapper);
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
