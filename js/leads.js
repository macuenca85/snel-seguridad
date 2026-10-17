/* ============================================================
   leads.js — Captura de leads desde la landing.
   Provee dos modales públicos (sin login):
     · Cotizar mi proyecto    → SnelLeads.abrirCotizar()
     · Agendar visita técnica → SnelLeads.abrirVisita()

   Tras enviar, persiste en el backend via Api.leads.crear (que en
   modo demo cae en demo-mode.js → localStorage 'snel_leads'),
   muestra confirmación y ofrece envío redundante por WhatsApp con
   los datos pre-cargados.
   ============================================================ */
(function () {
  'use strict';

  // ----------------------------------------------------------
  // Utilidades locales (no dependen de app.js para que estos
  // modales funcionen incluso si app.js aún no terminó de cargar)
  // ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function hoyISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function wa(numero, texto) {
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }

  const ETIQ = {
    servicios: { camaras: 'Cámaras de seguridad', alarmas: 'Alarmas', cercos: 'Cerco eléctrico', acceso: 'Control de acceso',
      biometricos: 'Cerraduras inteligentes', porteros: 'Videoporteros', incendio: 'Alarmas contra incendio',
      garage: 'Controles para garage', redes: 'Redes y WiFi', equiposred: 'Equipos de redes', cables: 'Cables', otro: 'Otro / no estoy seguro' },
    inmueble: { residencial: 'Residencial (casa / departamento)', comercial: 'Comercial (local, oficina, restaurante)',
      industrial: 'Industrial / bodega', otro: 'Otro' },
    motivo: { cotizacion: 'Visita para cotización', instalacion: 'Instalación de equipos comprados',
      mantenimiento: 'Mantenimiento preventivo', reparacion: 'Reparación / falla del sistema', otro: 'Otro' },
    franja: { 'mañana': 'Mañana (9:00 – 13:00)', tarde: 'Tarde (14:00 – 18:30)', sabado: 'Sábado mañana (9:00 – 13:00)' },
  };
  const etiq = (grupo, v) => (ETIQ[grupo] && ETIQ[grupo][v]) || v || '-';

  const WHATSAPP = (window.SNEL_CONFIG && window.SNEL_CONFIG.whatsapp) || '593991212657';

  // ----------------------------------------------------------
  // Render base del modal (overlay + tarjeta + cierre)
  // ----------------------------------------------------------
  function abrirModal({ id, titulo, subtitulo, formHtml, tipo, construirMensajeWA, validar, recolectar }) {
    cerrarModal(id); // por si ya estuviera abierto

    const html = `
      <div class="lead-modal-overlay" id="${id}">
        <div class="lead-modal" role="dialog" aria-modal="true" aria-labelledby="${id}-titulo">
          <button type="button" class="lead-modal-close" aria-label="Cerrar">×</button>
          <header class="lead-modal-header">
            <h2 id="${id}-titulo">${esc(titulo)}</h2>
            ${subtitulo ? `<p class="lead-modal-sub">${esc(subtitulo)}</p>` : ''}
          </header>
          <form class="lead-form" novalidate>
            ${formHtml}
            <div class="lead-form-actions">
              <button type="button" class="btn btn-ghost lead-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary lead-submit">Enviar solicitud</button>
            </div>
          </form>
          <div class="lead-modal-ok" hidden>
            <div class="ok-icono">✓</div>
            <h3>¡Recibido!</h3>
            <p class="ok-msg">Hemos guardado tu solicitud. Para agilizarla, envíala por WhatsApp con el botón de abajo y un asesor de Snel Seguridad te atenderá.</p>
            <div class="ok-acciones">
              <a class="btn btn-primary" id="${id}-wa" target="_blank" rel="noopener">💬 Abrir WhatsApp con mi solicitud</a>
              <button type="button" class="btn btn-ghost lead-cerrar-ok">Cerrar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.classList.add('lead-modal-abierto');

    const overlay = document.getElementById(id);
    const form    = overlay.querySelector('form.lead-form');
    const okBox   = overlay.querySelector('.lead-modal-ok');
    const submit  = overlay.querySelector('.lead-submit');

    // Cierres: tecla Esc, overlay click, botones
    const cerrar = () => cerrarModal(id);
    overlay.querySelector('.lead-modal-close').addEventListener('click', cerrar);
    overlay.querySelector('.lead-cancel').addEventListener('click', cerrar);
    overlay.querySelector('.lead-cerrar-ok').addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
    document.addEventListener('keydown', escHandler);
    function escHandler(e) {
      if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', escHandler); }
    }

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Limpiar mensajes de error
      overlay.querySelectorAll('.campo.invalido').forEach(n => n.classList.remove('invalido'));
      const datos = recolectar(form);
      const errores = validar(datos);
      if (errores.length) {
        errores.forEach(({ campo, mensaje }) => {
          const label = form.querySelector(`[name="${campo}"]`)?.closest('.campo');
          if (label) label.classList.add('invalido');
        });
        // Mostrar el primer error como toast/mensaje
        toastLocal(errores[0].mensaje, 'error', overlay);
        return;
      }

      // WhatsApp se abre en el mismo gesto del clic (evita el bloqueo de ventanas emergentes)
      const wsLink = wa(WHATSAPP, construirMensajeWA(datos));
      const ventanaWA = window.open(wsLink, '_blank', 'noopener');

      submit.disabled = true;
      const txtOrig = submit.textContent;
      submit.textContent = 'Enviando...';
      try {
        // Llamar al backend (en demo cae en demo-mode.js)
        if (window.Api && window.Api.leads && typeof window.Api.leads.crear === 'function') {
          await window.Api.leads.crear({ tipo, ...datos });
        } else {
          // Fallback ultra-defensivo si Api no estuviera disponible
          const store = JSON.parse(localStorage.getItem('snel_leads_fallback') || '[]');
          store.push({ id: 'lead-' + Date.now(), tipo, ...datos, creado_en: new Date().toISOString() });
          localStorage.setItem('snel_leads_fallback', JSON.stringify(store));
        }

        // Mostrar confirmación
        form.hidden = true;
        okBox.hidden = false;

        // Enlace de respaldo por si el navegador bloqueó la apertura automática
        document.getElementById(`${id}-wa`).href = wsLink;
        if (ventanaWA) okBox.querySelector('.ok-msg').textContent = 'Abrimos WhatsApp con tu solicitud ya redactada: solo presiona enviar. Si no se abrió, usa el botón de abajo.';
      } catch (err) {
        toastLocal('No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.', 'error', overlay);
        console.error('[leads]', err);
      } finally {
        submit.disabled = false;
        submit.textContent = txtOrig;
      }
    });

    // Focus al primer input
    setTimeout(() => {
      const first = form.querySelector('input, select, textarea');
      if (first) first.focus();
    }, 50);
  }

  function cerrarModal(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    if (!document.querySelector('.lead-modal-overlay')) {
      document.body.classList.remove('lead-modal-abierto');
    }
  }

  // Toast minimalista dentro del modal (esquina inferior)
  function toastLocal(msg, tipo, contenedor) {
    const previo = contenedor.querySelector('.lead-toast');
    if (previo) previo.remove();
    const t = document.createElement('div');
    t.className = `lead-toast ${tipo === 'error' ? 'err' : 'ok'}`;
    t.textContent = msg;
    contenedor.querySelector('.lead-modal').appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ----------------------------------------------------------
  // Validadores comunes
  // ----------------------------------------------------------
  const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const REGEX_TEL_EC = /^(\+593|0)\s*[0-9](?:[\s-]?[0-9]){8}$/;

  function validarComun(datos, requeridos) {
    const errores = [];
    for (const campo of requeridos) {
      const v = (datos[campo] || '').toString().trim();
      if (!v) errores.push({ campo, mensaje: `Falta completar: ${campo.replace('_', ' ')}` });
    }
    if (datos.email && !REGEX_EMAIL.test(datos.email)) {
      errores.push({ campo: 'email', mensaje: 'Correo electrónico no válido.' });
    }
    if (datos.telefono && !REGEX_TEL_EC.test(String(datos.telefono).replace(/\s/g, ''))) {
      errores.push({ campo: 'telefono', mensaje: 'Teléfono no válido. Usa formato 09XXXXXXXX o +5939XXXXXXXX.' });
    }
    if (!datos.acepta_privacidad) {
      errores.push({ campo: 'acepta_privacidad', mensaje: 'Debes aceptar la política de privacidad.' });
    }
    return errores;
  }

  // ----------------------------------------------------------
  // MODAL 1 — Cotizar mi proyecto
  // ----------------------------------------------------------
  function abrirCotizar() {
    const provincias = [
      'Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro','Esmeraldas',
      'Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago',
      'Napo','Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo','Sucumbíos',
      'Tungurahua','Zamora Chinchipe'
    ];
    const formHtml = `
      <div class="lead-grid">
        <label class="campo">
          <span>Nombre completo *</span>
          <input type="text" name="nombre" required autocomplete="name" placeholder="Ej. Juan Pérez">
        </label>
        <label class="campo">
          <span>Teléfono / WhatsApp *</span>
          <input type="tel" name="telefono" required autocomplete="tel" placeholder="0998989595">
        </label>
        <label class="campo">
          <span>Correo electrónico</span>
          <input type="email" name="email" autocomplete="email" placeholder="tucorreo@ejemplo.com">
        </label>
        <label class="campo">
          <span>Tipo de inmueble *</span>
          <select name="inmueble" required>
            <option value="">Selecciona…</option>
            <option value="residencial">🏠 Residencial (casa / departamento)</option>
            <option value="comercial">🏢 Comercial (local, oficina, restaurante)</option>
            <option value="industrial">🏭 Industrial / bodega</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label class="campo">
          <span>Provincia *</span>
          <select name="provincia" required>
            <option value="">Selecciona provincia…</option>
            ${provincias.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
          </select>
        </label>
        <label class="campo">
          <span>Ciudad / Sector</span>
          <input type="text" name="ciudad" placeholder="Ej. Loja, sector La Tebaida">
        </label>
      </div>
      <fieldset class="campo campo-checks">
        <legend>¿Qué te interesa? *</legend>
        <div class="checks-grid">
          <label><input type="checkbox" name="servicios" value="camaras"> 📹 Cámaras de seguridad</label>
          <label><input type="checkbox" name="servicios" value="alarmas"> 🚨 Alarmas</label>
          <label><input type="checkbox" name="servicios" value="cercos"> ⚡ Cerco eléctrico</label>
          <label><input type="checkbox" name="servicios" value="acceso"> 🔐 Control de acceso</label>
          <label><input type="checkbox" name="servicios" value="biometricos"> 👆 Cerraduras inteligentes</label>
          <label><input type="checkbox" name="servicios" value="porteros"> 🔔 Videoporteros</label>
          <label><input type="checkbox" name="servicios" value="incendio"> 🧯 Alarmas contra incendio</label>
          <label><input type="checkbox" name="servicios" value="garage"> 🚪 Controles para garage</label>
          <label><input type="checkbox" name="servicios" value="redes"> 🌐 Redes y WiFi</label>
          <label><input type="checkbox" name="servicios" value="equiposred"> 🗄️ Equipos de redes</label>
          <label><input type="checkbox" name="servicios" value="cables"> 🔌 Cables</label>
          <label><input type="checkbox" name="servicios" value="otro"> Otro / no estoy seguro</label>
        </div>
      </fieldset>
      <label class="campo">
        <span>Cuéntanos sobre tu proyecto</span>
        <textarea name="mensaje" rows="3" maxlength="1000" placeholder="Ej. Casa de 2 pisos, quiero 4 cámaras en exterior y alarma con sensores en puertas y ventanas."></textarea>
      </label>
      <label class="campo campo-check">
        <input type="checkbox" name="acepta_privacidad" required>
        <span>He leído y acepto la <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>. *</span>
      </label>
    `;
    abrirModal({
      id: 'modal-cotizar',
      tipo: 'cotizacion',
      titulo: '💬 Cotizar mi proyecto',
      subtitulo: 'Cuéntanos lo que necesitas y te enviamos una propuesta personalizada sin compromiso.',
      formHtml,
      recolectar: (form) => {
        const fd = new FormData(form);
        return {
          nombre: fd.get('nombre')?.trim() || '',
          telefono: fd.get('telefono')?.trim() || '',
          email: fd.get('email')?.trim() || '',
          inmueble: fd.get('inmueble') || '',
          provincia: fd.get('provincia') || '',
          ciudad: fd.get('ciudad')?.trim() || '',
          servicios: fd.getAll('servicios'),
          mensaje: fd.get('mensaje')?.trim() || '',
          acepta_privacidad: !!fd.get('acepta_privacidad'),
        };
      },
      validar: (d) => {
        const errs = validarComun(d, ['nombre', 'telefono', 'inmueble', 'provincia']);
        if (!d.servicios || d.servicios.length === 0) {
          errs.push({ campo: 'servicios', mensaje: 'Selecciona al menos un servicio de interés.' });
        }
        return errs;
      },
      construirMensajeWA: (d) => {
        const servs = (d.servicios || []).map(s => etiq('servicios', s)).join(', ') || '-';
        return [
          '*Solicitud de cotización · SNEL Seguridad*',
          '',
          `*Nombre:* ${d.nombre}`,
          `*Teléfono:* ${d.telefono}`,
          `*Correo:* ${d.email || '-'}`,
          `*Tipo de inmueble:* ${etiq('inmueble', d.inmueble)}`,
          `*Ubicación:* ${d.provincia}${d.ciudad ? ' · ' + d.ciudad : ''}`,
          `*Me interesa:* ${servs}`,
          ...(d.mensaje ? ['', `*Detalles del proyecto:* ${d.mensaje}`] : []),
        ].join('\n');
      },
    });
  }

  // ----------------------------------------------------------
  // MODAL 2 — Agendar visita técnica
  // ----------------------------------------------------------
  function abrirVisita() {
    const formHtml = `
      <div class="lead-grid">
        <label class="campo">
          <span>Nombre completo *</span>
          <input type="text" name="nombre" required autocomplete="name" placeholder="Ej. María López">
        </label>
        <label class="campo">
          <span>Teléfono / WhatsApp *</span>
          <input type="tel" name="telefono" required autocomplete="tel" placeholder="0998989595">
        </label>
        <label class="campo">
          <span>Correo electrónico</span>
          <input type="email" name="email" autocomplete="email" placeholder="tucorreo@ejemplo.com">
        </label>
        <label class="campo">
          <span>Motivo *</span>
          <select name="motivo" required>
            <option value="">Selecciona…</option>
            <option value="cotizacion">📐 Visita para cotización</option>
            <option value="instalacion">🔧 Instalación de equipos comprados</option>
            <option value="mantenimiento">🛠️ Mantenimiento preventivo</option>
            <option value="reparacion">⚠️ Reparación / falla del sistema</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>
      <label class="campo">
        <span>Dirección o referencia del lugar *</span>
        <input type="text" name="direccion" required autocomplete="street-address" placeholder="Ej. Av. Pío Jaramillo y Manuel Agustín Aguirre, Loja">
      </label>
      <div class="lead-grid">
        <label class="campo">
          <span>Fecha preferida *</span>
          <input type="date" name="fecha" required min="${hoyISO()}">
        </label>
        <label class="campo">
          <span>Franja horaria *</span>
          <select name="franja" required>
            <option value="">Selecciona…</option>
            <option value="mañana">Mañana (9:00 – 13:00)</option>
            <option value="tarde">Tarde (14:00 – 18:30)</option>
            <option value="sabado">Sábado mañana (9:00 – 13:00)</option>
          </select>
        </label>
      </div>
      <label class="campo">
        <span>Observaciones</span>
        <textarea name="mensaje" rows="3" maxlength="1000" placeholder="Ej. Casa de 2 plantas, hay un perro pequeño, llamar al portero 28B."></textarea>
      </label>
      <label class="campo campo-check">
        <input type="checkbox" name="acepta_privacidad" required>
        <span>He leído y acepto la <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>. *</span>
      </label>
    `;
    abrirModal({
      id: 'modal-visita',
      tipo: 'visita',
      titulo: '🛠️ Agendar visita técnica',
      subtitulo: 'Coordinamos una visita de un ingeniero de Snel para evaluar, instalar o reparar tu sistema.',
      formHtml,
      recolectar: (form) => {
        const fd = new FormData(form);
        return {
          nombre: fd.get('nombre')?.trim() || '',
          telefono: fd.get('telefono')?.trim() || '',
          email: fd.get('email')?.trim() || '',
          motivo: fd.get('motivo') || '',
          direccion: fd.get('direccion')?.trim() || '',
          fecha: fd.get('fecha') || '',
          franja: fd.get('franja') || '',
          mensaje: fd.get('mensaje')?.trim() || '',
          acepta_privacidad: !!fd.get('acepta_privacidad'),
        };
      },
      validar: (d) => validarComun(d, ['nombre', 'telefono', 'motivo', 'direccion', 'fecha', 'franja']),
      construirMensajeWA: (d) => {
        return [
          '*Solicitud de visita técnica · SNEL Seguridad*',
          '',
          `*Nombre:* ${d.nombre}`,
          `*Teléfono:* ${d.telefono}`,
          `*Correo:* ${d.email || '-'}`,
          `*Motivo:* ${etiq('motivo', d.motivo)}`,
          `*Dirección:* ${d.direccion}`,
          `*Fecha preferida:* ${d.fecha}`,
          `*Franja horaria:* ${etiq('franja', d.franja)}`,
          ...(d.mensaje ? ['', `*Observaciones:* ${d.mensaje}`] : []),
        ].join('\n');
      },
    });
  }

  // Exportar API pública
  window.SnelLeads = { abrirCotizar, abrirVisita };
})();
