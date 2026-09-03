/* =========================================================================
   GORDON GESTIÓN · UTILIDADES GLOBALES
   Modal de confirmación flotante, reutilizable en todo el proyecto.

   Uso:
     const ok = await GordonConfirm('¿Eliminar este registro?');
     if (!ok) return;

     const ok = await GordonConfirm({
       titulo: 'Eliminar jornada',
       mensaje: 'Esta acción no se puede deshacer.',
       tipo: 'peligro',          // 'peligro' | 'advertencia' | 'info' | 'exito'
       textoOk: 'Eliminar',
       textoCancelar: 'Cancelar'
     });
   ========================================================================= */

(function () {
  if (window.GordonConfirm) return;

  const ESTILOS = `
    .gc-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(4px);
      display: none; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.18s ease;
      padding: 16px;
    }
    .gc-overlay.gc-show { opacity: 1; }
    .gc-box {
      width: 100%; max-width: 380px;
      background: var(--card-color, #FFFFFF);
      border-radius: var(--radius-lg, 18px);
      border-top: 4px solid var(--gc-accent, #0055A5);
      box-shadow: 0 20px 45px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.03);
      padding: 26px 24px 20px;
      text-align: center;
      font-family: var(--font-family, 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif);
      transform: scale(0.92) translateY(10px);
      opacity: 0;
      transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), opacity 0.18s ease;
    }
    .gc-overlay.gc-show .gc-box { transform: scale(1) translateY(0); opacity: 1; }
    .gc-icon-wrap {
      width: 54px; height: 54px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; margin: 0 auto 14px;
      background: var(--gc-accent-bg, rgba(0,85,165,0.1));
    }
    .gc-title {
      font-family: 'Montserrat', var(--font-family, 'Roboto', sans-serif);
      font-size: 16.5px; font-weight: 800;
      color: var(--text-primary, #0F172A);
      margin: 0 0 8px;
    }
    .gc-msg {
      font-size: 13.5px; line-height: 1.5;
      color: var(--text-secondary, #64748B);
      margin: 0 0 22px;
      white-space: pre-line;
    }
    .gc-actions { display: flex; gap: 10px; }
    .gc-btn {
      flex: 1; padding: 11px 14px;
      border-radius: var(--radius-md, 12px);
      font-size: 13px; font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      border: 1.5px solid transparent;
      transition: all 0.15s ease;
    }
    .gc-btn-cancel {
      background: var(--input-fill, #F1F5F9);
      color: var(--text-secondary, #64748B);
      border-color: var(--color-border, #E2E8F0);
    }
    .gc-btn-cancel:hover { background: var(--color-border, #E2E8F0); }
    .gc-btn-ok {
      background: var(--gc-accent, #0055A5);
      color: #FFFFFF;
      box-shadow: 0 4px 10px rgba(0,0,0,0.14);
    }
    .gc-btn-ok:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .gc-btn-ok:active { transform: translateY(0) scale(0.98); }
    .gc-btn:focus-visible { outline: 2px solid var(--gc-accent, #0055A5); outline-offset: 2px; }
  `;

  const TIPOS = {
    peligro:     { icono: '🗑️', accent: '#DC2626', accentVar: 'var(--rojo-descarte, #DC2626)',  bg: 'rgba(220,38,38,0.10)' },
    advertencia: { icono: '⚠️', accent: '#F97316', accentVar: 'var(--naranja-led, #F97316)',    bg: 'rgba(249,115,22,0.10)' },
    info:        { icono: 'ℹ️', accent: '#0055A5', accentVar: 'var(--azul-francia, #0055A5)',   bg: 'rgba(0,85,165,0.10)' },
    exito:       { icono: '✅', accent: '#107C41', accentVar: 'var(--verde-ok, #107C41)',       bg: 'rgba(16,124,65,0.10)' },
  };

  let overlay, box, iconWrap, iconEl, titleEl, msgEl, btnOk, btnCancel;
  let resolverActual = null;
  let elementoConFoco = null;

  function inyectarEstilos() {
    if (document.getElementById('gc-estilos')) return;
    const style = document.createElement('style');
    style.id = 'gc-estilos';
    style.textContent = ESTILOS;
    document.head.appendChild(style);
  }

  function construirDom() {
    if (overlay) return;
    inyectarEstilos();

    overlay = document.createElement('div');
    overlay.className = 'gc-overlay';
    overlay.innerHTML = `
      <div class="gc-box" role="alertdialog" aria-modal="true" aria-labelledby="gcTitulo" aria-describedby="gcMensaje">
        <div class="gc-icon-wrap"><span class="gc-icon"></span></div>
        <h3 class="gc-title" id="gcTitulo"></h3>
        <p class="gc-msg" id="gcMensaje"></p>
        <div class="gc-actions">
          <button type="button" class="gc-btn gc-btn-cancel"></button>
          <button type="button" class="gc-btn gc-btn-ok"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    box        = overlay.querySelector('.gc-box');
    iconWrap   = overlay.querySelector('.gc-icon-wrap');
    iconEl     = overlay.querySelector('.gc-icon');
    titleEl    = overlay.querySelector('.gc-title');
    msgEl      = overlay.querySelector('.gc-msg');
    btnCancel  = overlay.querySelector('.gc-btn-cancel');
    btnOk      = overlay.querySelector('.gc-btn-ok');

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cerrar(false); });
    btnCancel.addEventListener('click', () => cerrar(false));
    btnOk.addEventListener('click', () => cerrar(true));
    document.addEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (!overlay || !overlay.classList.contains('gc-show')) return;
    if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
    else if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const focables = [btnCancel, btnOk];
      const idx = focables.indexOf(document.activeElement);
      const siguiente = e.shiftKey
        ? (idx <= 0 ? focables.length - 1 : idx - 1)
        : (idx === focables.length - 1 ? 0 : idx + 1);
      focables[siguiente].focus();
    }
  }

  function cerrar(resultado) {
    if (!overlay) return;
    overlay.classList.remove('gc-show');
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 180);
    if (elementoConFoco && typeof elementoConFoco.focus === 'function') elementoConFoco.focus();
    const resolver = resolverActual;
    resolverActual = null;
    if (resolver) resolver(resultado);
  }

  window.GordonConfirm = function (opciones) {
    if (typeof opciones === 'string') opciones = { mensaje: opciones };

    const {
      titulo = '¿Confirmás esta acción?',
      mensaje = '',
      tipo = 'advertencia',
      textoOk = 'Confirmar',
      textoCancelar = 'Cancelar',
      icono,
    } = opciones || {};

    construirDom();

    // Si ya había un modal abierto, se descarta con resultado negativo.
    if (resolverActual) cerrar(false);

    const cfg = TIPOS[tipo] || TIPOS.advertencia;

    titleEl.textContent = titulo;
    msgEl.textContent = mensaje;
    iconEl.textContent = icono || cfg.icono;
    iconWrap.style.background = cfg.bg;
    box.style.setProperty('--gc-accent', cfg.accentVar);
    box.style.setProperty('--gc-accent-bg', cfg.bg);
    btnOk.textContent = textoOk;
    btnCancel.textContent = textoCancelar;

    elementoConFoco = document.activeElement;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('gc-show'));
    setTimeout(() => btnCancel.focus(), 60);

    return new Promise((resolve) => { resolverActual = resolve; });
  };

  // Alias en español, mismo comportamiento.
  window.confirmarAccion = window.GordonConfirm;
})();
