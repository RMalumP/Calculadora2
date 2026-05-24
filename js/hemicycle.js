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

  const ul = document.createElement('ul');
  ul.className = 'hemicycle-chart';
  ul.style.cssText = `
    position: relative;
    width: 350px;
    height: 175px;
    margin: 0 auto;
    padding: 0;
    list-style: none;
  `;

  results.forEach(result => {
    const percentWidth = (result.seats / totalSeats) * 100;
    const li = document.createElement('li');
    li.style.cssText = `
      position: absolute;
      bottom: 0;
      height: 100%;
      width: ${percentWidth}%;
      background-color: ${result.color};
      border-right: 1px solid white;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 8px;
      box-sizing: border-box;
      cursor: default;
      transition: opacity 0.2s;
    `;
    li.title = `${result.name}: ${result.seats} escaños`;

    const span = document.createElement('span');
    span.textContent = `${result.name}`;
    span.style.cssText = `
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 0 4px;
    `;

    li.appendChild(span);

    li.addEventListener('mouseenter', () => {
      li.style.opacity = '0.8';
    });
    li.addEventListener('mouseleave', () => {
      li.style.opacity = '1';
    });

    ul.appendChild(li);

    let currentWidth = percentWidth;
    for (let i = 0; i < results.indexOf(result); i++) {
      currentWidth += (results[i].seats / totalSeats) * 100;
    }
    li.style.left = `${currentWidth - percentWidth}%`;
  });

  const before = document.createElement('div');
  before.style.cssText = `
    position: absolute;
    width: 350px;
    height: 175px;
    top: 0;
    border: 45px solid rgba(211, 211, 211, 0.2);
    border-bottom: none;
    border-top-left-radius: 175px;
    border-top-right-radius: 175px;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 1;
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: relative;
    display: inline-block;
    width: 100%;
  `;

  wrapper.appendChild(before);
  wrapper.appendChild(ul);

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
