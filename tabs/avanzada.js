/**
 * tabs/avanzada.js
 * Marcado de la pestaña «Calculadora avanzada».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 */

registerTab('advanced', 'tab-content', String.raw`
    <div class="adv-workspace">

      <!-- ══ COLUMNA IZQUIERDA: resultados ══ -->
      <main class="adv-main">

        <div class="adv-head">
          <div>
            <h2 class="adv-title">Calculadora Avanzada</h2>
            <div class="adv-subtitle" id="adv-subtitle">Cargando datos electorales…</div>
          </div>
        </div>

        <div class="adv-editbar" id="adv-editbar">
          <button type="button" class="adv-edit-btn" id="adv-edit-toggle">
            <span class="adv-edit-icon">✎</span> Editar datos
          </button>
          <span class="adv-edit-note" id="adv-edit-note">
            Modifica votos y escaños de cada circunscripción. Los cambios son sólo de esta sesión: no tocan la hoja de datos.
          </span>
          <span class="adv-edit-badge" id="adv-edit-badge" hidden>0 cambios</span>
          <button type="button" class="adv-mini-btn" id="adv-edit-reset" hidden>Restaurar originales</button>
        </div>

        <div id="adv-status"></div>
        <div id="adv-summary"></div>
        <div id="adv-results"></div>

      </main>

      <!-- ══ COLUMNA DERECHA: configuración ══ -->
      <!-- Cada sección se pliega en un resumen de una línea para que el
           panel no se alargue ni se corte. -->
      <aside class="adv-config">
        <div class="param-card">
          <div class="param-card-header">
            Configuración
            <button type="button" class="adv-collapse-all" id="adv-cfg-collapse">Plegar todo</button>
          </div>
          <div class="param-body adv-cfg-body">

            <section class="adv-cfg" data-section="eleccion">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Elección</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-eleccion">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-election">Hoja de datos</label>
                  <div class="adv-select-wrap"><select id="adv-election"></select></div>
                  <small>Cada hoja del documento es una elección.</small>
                </div>
                <div class="adv-field" id="adv-year-field">
                  <label for="adv-year">Año de elección</label>
                  <div class="adv-select-wrap"><select id="adv-year"></select></div>
                  <small id="adv-year-hint">Si la hoja incluye más de una convocatoria, elige cuál calcular.</small>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="reparto">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Circunscripción y fórmula</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-reparto">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-level">Circunscripción</label>
                  <div class="adv-select-wrap">
                    <select id="adv-level">
                      <option value="provincia">Provincial</option>
                      <option value="ccaa">Autonómica (CCAA)</option>
                      <option value="nacional">Estatal (única)</option>
                    </select>
                  </div>
                  <small>Agrupa los votos de las provincias en el nivel elegido.</small>
                </div>
                <div class="adv-field">
                  <label for="adv-formula">Fórmula de reparto</label>
                  <div class="adv-select-wrap"><select id="adv-formula"></select></div>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="barreras">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Barreras electorales</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-barreras">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-fieldset" id="adv-b1-fs">
                  <label class="adv-check"><input type="checkbox" id="adv-b1-on"> Barrera electoral</label>
                  <div class="adv-row">
                    <div class="adv-select-wrap">
                      <select id="adv-b1-level">
                        <option value="circunscripcion">Circunscripción</option>
                        <option value="ccaa">Comunidad</option>
                        <option value="nacional">Nacional</option>
                      </select>
                    </div>
                    <input type="number" id="adv-b1-val" min="0" max="100" step="0.1" value="3">
                  </div>
                  <small id="adv-b1-hint" style="display:none"></small>
                </div>

                <div class="adv-fieldset" id="adv-b2-fs">
                  <label class="adv-check"><input type="checkbox" id="adv-b2-on"> Segunda barrera</label>
                  <div class="adv-row">
                    <div class="adv-select-wrap">
                      <select id="adv-b2-level">
                        <option value="circunscripcion">Circunscripción</option>
                        <option value="ccaa">Comunidad</option>
                        <option value="nacional">Nacional</option>
                      </select>
                    </div>
                    <input type="number" id="adv-b2-val" min="0" max="100" step="0.1" value="3">
                  </div>
                  <small id="adv-b2-hint" style="display:none"></small>
                </div>

                <label class="adv-check"><input type="checkbox" id="adv-blanco" checked> Contar votos en blanco en la barrera</label>
              </div>
            </section>

            <section class="adv-cfg" data-section="escanos">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Escaños</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-escanos">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-seats-mode">Origen del total</label>
                  <div class="adv-select-wrap">
                    <select id="adv-seats-mode">
                      <option value="sheet">Los de la hoja de datos</option>
                      <option value="custom">Total personalizado</option>
                    </select>
                  </div>
                </div>
                <div id="adv-custom-seats" class="adv-custom-seats" style="display:none">
                  <div class="adv-field">
                    <label for="adv-total-seats">Total de escaños</label>
                    <input type="number" id="adv-total-seats" min="1" max="2000" value="350">
                  </div>
                  <div class="adv-field">
                    <label for="adv-min-seats">Mínimo por circunscripción</label>
                    <input type="number" id="adv-min-seats" min="0" max="20" value="2">
                  </div>
                  <div class="adv-field">
                    <label for="adv-reparto-base">Repartir el resto según</label>
                    <div class="adv-select-wrap">
                      <select id="adv-reparto-base">
                        <option value="poblacion">Población</option>
                        <option value="censo">Censo electoral</option>
                      </select>
                    </div>
                    <small>Mínimo fijo por circunscripción y resto por cuota Hare, como la LOREG.</small>
                  </div>
                </div>
              </div>
            </section>

            <div class="adv-row adv-cfg-actions">
              <button class="adv-mini-btn" id="adv-reset">Valores de la hoja</button>
              <button class="adv-mini-btn" id="adv-reload">Recargar datos</button>
              <button class="adv-mini-btn" id="adv-meta-btn">Metadatos</button>
            </div>

          </div>
        </div>
      </aside>

    </div>
`);

/* Ventana de metadatos: lo que se ha leído de la hoja y cómo se ha
   interpretado. Vive fuera de la pestaña para poder mostrarse por encima. */
registerTab('advmeta', 'adv-meta-overlay', String.raw`
  <div class="adv-meta-dialog" role="dialog" aria-label="Metadatos de la hoja">
    <div class="adv-meta-head">
      <span>Metadatos de la hoja</span>
      <button type="button" class="adv-meta-close" id="adv-meta-close" title="Cerrar">✕</button>
    </div>
    <div class="adv-meta-body" id="adv-meta-body"></div>
  </div>
`);
