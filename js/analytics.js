/* ============================================================
   Analítica de embudo PROPIA y anónima (sin PII).
   - Solo registra si hay consentimiento de "analiticas" (cookies.js).
   - Identificador de sesión aleatorio (snel_sid), sin nombre ni email.
   - Eventos: page_view, ver_categoria, ver_producto, buscar,
     add_carrito, inicia_checkout, compra.
   Expone window.SnelTrack(evento, datos).
   ============================================================ */
(function () {
  'use strict';
  var EVENTOS_OK = {
    page_view: 1, ver_categoria: 1, ver_producto: 1, buscar: 1,
    add_carrito: 1, inicia_checkout: 1, compra: 1
  };
  var arrancado = false;

  function consiente() { return !!(window.Consent && window.Consent.permite && window.Consent.permite('analiticas')); }

  function sid() {
    var k = 'snel_sid', v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }

  function track(evento, datos) {
    if (!consiente() || !EVENTOS_OK[evento]) return;
    var payload = { sid: sid(), evento: evento, url: location.pathname };
    if (datos) for (var k in datos) if (datos[k] != null) payload[k] = datos[k];
    try { if (window.Api && Api.analytics && Api.analytics.track) Api.analytics.track(payload); } catch (e) {}
  }
  window.SnelTrack = track;

  function qp(n) {
    if (window.qsParam) return window.qsParam(n);
    try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; }
  }

  function contexto() {
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    track('page_view', { pagina: path });
    if (path === 'producto.html') {
      var id = qp('id');
      var p = (window.PRODUCTOS || []).find(function (x) { return x.id === id; });
      track('ver_producto', { producto_id: id, categoria_id: p && (p.categoria || p.categoria_id), valor: p && p.precio });
    } else if (path === 'catalogo.html') {
      var cat = qp('cat');
      if (cat) track('ver_categoria', { categoria_id: cat });
      // 'buscar' lo dispara catalogo.html con el conteo real de resultados
    } else if (path === 'checkout.html') {
      track('inicia_checkout', {});
    }
  }

  function arrancar() { if (arrancado) return; arrancado = true; contexto(); }

  if (consiente()) arrancar();
  // Si el usuario acepta más tarde, arrancamos al recibir el consentimiento
  window.addEventListener('snel:consentchange', function () { if (consiente()) arrancar(); });
})();
