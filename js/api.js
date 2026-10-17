/* ============================================================
   SNEL — Cliente HTTP para la API PHP
   ============================================================
   Uso:
     const productos = await Api.productos.listar();
     await Api.auth.loginAdmin('admin', 'snel2026');
     await Api.productos.guardar({ id, nombre, ... });

   Auto-detecta la URL base:
     - Si está sirviendo desde http(s)://, usa /api/endpoints/
     - Si es file://, requiere override manual (Snel.apiBase)
   ============================================================ */

(function (global) {
  'use strict';

  // Permite override: window.SNEL_API_BASE = "https://midominio.com/api/endpoints/"
  const BASE = (global.SNEL_API_BASE || (location.origin + '/api/endpoints/'));

  const TOKEN_KEY_ADMIN   = 'snel_token_admin';
  const TOKEN_KEY_CLIENTE = 'snel_token_cliente';

  function token(rol) {
    return localStorage.getItem(rol === 'admin' ? TOKEN_KEY_ADMIN : TOKEN_KEY_CLIENTE);
  }
  function setToken(rol, v) {
    const k = rol === 'admin' ? TOKEN_KEY_ADMIN : TOKEN_KEY_CLIENTE;
    if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
  }

  async function fetchJSON(path, opts = {}, rolAuth = null) {
    const url = BASE + path.replace(/^\/+/, '');
    const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    if (rolAuth) {
      const t = token(rolAuth);
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    let resp;
    try {
      resp = await fetch(url, { ...opts, headers });
    } catch (e) {
      throw new Error('No se pudo conectar al servidor (revisa tu internet).');
    }
    let data = null;
    try { data = await resp.json(); } catch (_) {}
    if (!resp.ok || (data && data.ok === false)) {
      const msg = (data && data.error) || `HTTP ${resp.status}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.detalle = data && data.detalle;
      throw err;
    }
    return data ? data.data : null;
  }

  const Api = {
    base: BASE,

    /* ---------- Auth ---------- */
    auth: {
      async loginAdmin(usuario, password) {
        const r = await fetchJSON('auth/login-admin.php', { method: 'POST', body: { usuario, password } });
        setToken('admin', r.token);
        try { localStorage.setItem('snel_admin_actual', JSON.stringify(r.admin)); } catch (_) {}
        return r.admin;
      },
      logoutAdmin() {
        setToken('admin', null);
        try { localStorage.removeItem('snel_admin_actual'); } catch (_) {}
      },
      adminLogueado() { return !!token('admin'); },
      adminActual() {
        try { return JSON.parse(localStorage.getItem('snel_admin_actual') || 'null'); }
        catch (_) { return null; }
      },

      async cambiarPassword(passwordActual, passwordNueva, rol = 'admin') {
        return fetchJSON('auth/cambiar-password.php',
          { method: 'POST', body: { password_actual: passwordActual, password_nueva: passwordNueva } },
          rol);
      },
      async actualizarAdmin(datos) {
        return fetchJSON('auth/actualizar-admin.php', { method: 'POST', body: datos }, 'admin');
      },

      /* ----- Verificación de email ----- */
      enviarVerificacion() {
        return fetchJSON('auth/enviar-verificacion.php', { method: 'POST', body: {} }, 'cliente');
      },
      verificarEmail(token) {
        return fetchJSON('auth/verificar-email.php', { method: 'POST', body: { token } });
      },
    },

    /* ---------- Clientes ---------- */
    clientes: {
      async registro(datos) {
        const r = await fetchJSON('clientes/registro.php', { method: 'POST', body: datos });
        setToken('cliente', r.token);
        try { localStorage.setItem('snel_cliente_perfil', JSON.stringify(r.cliente)); } catch (_) {}
        return r.cliente;
      },
      async login(email, password) {
        const r = await fetchJSON('clientes/login.php', { method: 'POST', body: { email, password } });
        setToken('cliente', r.token);
        try { localStorage.setItem('snel_cliente_perfil', JSON.stringify(r.cliente)); } catch (_) {}
        return r.cliente;
      },
      logout() {
        setToken('cliente', null);
        try { localStorage.removeItem('snel_cliente_perfil'); } catch (_) {}
      },
      logueado() { return !!token('cliente'); },
      perfilCache() {
        try { return JSON.parse(localStorage.getItem('snel_cliente_perfil') || 'null'); }
        catch (_) { return null; }
      },
      me()        { return fetchJSON('clientes/me.php', { method: 'GET' }, 'cliente'); },
      actualizar(datos) { return fetchJSON('clientes/me.php', { method: 'PUT', body: datos }, 'cliente'); },

      /* ----- Direcciones múltiples ----- */
      direcciones: {
        listar()       { return fetchJSON('clientes/direcciones/listar.php',     {},                                    'cliente'); },
        guardar(d)     { return fetchJSON('clientes/direcciones/guardar.php',    { method: 'POST', body: d },          'cliente'); },
        eliminar(id)   { return fetchJSON('clientes/direcciones/eliminar.php',   { method: 'POST', body: { id } },     'cliente'); },
        setDefault(id) { return fetchJSON('clientes/direcciones/set-default.php',{ method: 'POST', body: { id } },     'cliente'); },
      },

      /* ----- Favoritos / Lista de deseos ----- */
      favoritos: {
        listar()             { return fetchJSON('clientes/favoritos/listar.php', {},                                       'cliente'); },
        ids()                { return fetchJSON('clientes/favoritos/ids.php',    {},                                       'cliente'); },
        toggle(productoId)   { return fetchJSON('clientes/favoritos/toggle.php', { method: 'POST', body: { productoId } }, 'cliente'); },
      },

      /* ----- Admin: base de datos de clientes + historial de compras ----- */
      listarAdmin(params = {}) {
        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
        return fetchJSON('clientes/admin-listar.php' + qs, {}, 'admin');
      },
      detalleAdmin(id) { return fetchJSON('clientes/admin-detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
    },

    /* ---------- Productos ---------- */
    productos: {
      listar(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return fetchJSON('productos/listar.php' + (qs ? '?' + qs : ''));
      },
      guardar(producto)   { return fetchJSON('productos/guardar.php',  { method: 'POST',   body: producto }, 'admin'); },
      eliminar(id)        { return fetchJSON('productos/eliminar.php', { method: 'POST',   body: { id }    }, 'admin'); },
      importar(payload)   { return fetchJSON('productos/importar.php', { method: 'POST',   body: payload  }, 'admin'); },
    },

    /* ---------- Categorías ---------- */
    categorias: {
      listar()            { return fetchJSON('categorias/listar.php'); },
      guardar(cat)        { return fetchJSON('categorias/guardar.php',  { method: 'POST', body: cat },     'admin'); },
      eliminar(id)        { return fetchJSON('categorias/eliminar.php', { method: 'POST', body: { id } }, 'admin'); },
    },

    /* ---------- Config ---------- */
    config: {
      get()               { return fetchJSON('config/get.php'); },
      set(obj)            { return fetchJSON('config/set.php', { method: 'POST', body: obj }, 'admin'); },
    },

    /* ---------- Imágenes ---------- */
    imagenes: {
      async subir(file, productoId) {
        const fd = new FormData();
        fd.append('foto', file);
        fd.append('producto_id', productoId);
        return fetchJSON('imagenes/subir.php', { method: 'POST', body: fd }, 'admin');
      },
    },

    /* ---------- Leads (cotizaciones y visitas técnicas) ---------- */
    leads: {
      // Endpoint público: no requiere autenticación, se llama desde la landing.
      crear(lead)        { return fetchJSON('leads/crear.php',  { method: 'POST', body: lead }); },
      // Endpoints admin para gestionar la bandeja de leads
      listar(params = {}){ return fetchJSON('leads/listar.php' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''), {}, 'admin'); },
      actualizar(id, datos) { return fetchJSON('leads/actualizar.php', { method: 'POST', body: { id, ...datos } }, 'admin'); },
    },

    /* ---------- Facturas electrónicas (SRI) ---------- */
    facturas: {
      crear(payload)       { return fetchJSON('facturas/crear.php',          { method: 'POST', body: payload }, 'admin'); },
      listar(params = {})  { return fetchJSON('facturas/listar.php' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''), {}, 'admin'); },
      misFacturas()        { return fetchJSON('facturas/listar.php', {}, 'cliente'); },
      detalle(id)          { return fetchJSON('facturas/detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
      miDetalle(id)        { return fetchJSON('facturas/detalle.php?id=' + encodeURIComponent(id), {}, 'cliente'); },
      anular(id, motivo)   { return fetchJSON('facturas/anular.php',         { method: 'POST', body: { id, motivo } }, 'admin'); },
      // URLs directas para abrir XML o RIDE en una nueva pestaña.
      urlXml(id)           { return BASE + 'facturas/descargar-xml.php?id=' + encodeURIComponent(id); },
      urlRide(id)          { return BASE + 'facturas/ride.php?id='          + encodeURIComponent(id); },
      // Helpers conscientes del modo demo: en demo generan el contenido en JS
      // y lo abren como blob; en producción navegan al endpoint PHP real.
      abrirRide(id) {
        if (window.SnelDemoFacturas) return window.SnelDemoFacturas.verRide(id);
        window.open(this.urlRide(id), '_blank');
      },
      descargarXml(id) {
        if (window.SnelDemoFacturas) return window.SnelDemoFacturas.descargarXml(id);
        window.location.href = this.urlXml(id);
      },
    },
    sri: {
      getConfig()       { return fetchJSON('sri/configuracion.php', {}, 'admin'); },
      setConfig(cfg)    { return fetchJSON('sri/configuracion.php', { method: 'POST', body: cfg }, 'admin'); },
    },

    /* ---------- Contabilidad avanzada ---------- */
    contabilidad: {
      dashboard(params = {}) {
        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
        return fetchJSON('contabilidad/dashboard.php' + qs, {}, 'admin');
      },
      ventas(params = {}) {
        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
        return fetchJSON('contabilidad/ventas.php' + qs, {}, 'admin');
      },
      compras: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/compras/listar.php' + qs, {}, 'admin');
        },
        guardar(c)  { return fetchJSON('contabilidad/compras/guardar.php', { method: 'POST', body: c }, 'admin'); },
        detalle(id) { return fetchJSON('contabilidad/compras/detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
        anular(id, motivo) { return fetchJSON('contabilidad/compras/anular.php', { method: 'POST', body: { id, motivo } }, 'admin'); },
      },
      retenciones: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/retenciones/listar.php' + qs, {}, 'admin');
        },
        guardar(r)  { return fetchJSON('contabilidad/retenciones/guardar.php', { method: 'POST', body: r }, 'admin'); },
        detalle(id) { return fetchJSON('contabilidad/retenciones/detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
      },
      cxc: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/cxc.php' + qs, {}, 'admin');
        },
      },
      cxp: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/cxp.php' + qs, {}, 'admin');
        },
      },
      pagos: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/pagos/listar.php' + qs, {}, 'admin');
        },
        guardar(p) { return fetchJSON('contabilidad/pagos/guardar.php', { method: 'POST', body: p }, 'admin'); },
      },
      bancos: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/bancos/listar.php' + qs, {}, 'admin');
        },
        guardar(m) { return fetchJSON('contabilidad/bancos/guardar.php', { method: 'POST', body: m }, 'admin'); },
        conciliar(id, conciliado) { return fetchJSON('contabilidad/bancos/conciliar.php', { method: 'POST', body: { id, conciliado } }, 'admin'); },
      },
      cuentas: {
        listar()   { return fetchJSON('contabilidad/cuentas/listar.php', {}, 'admin'); },
        guardar(c) { return fetchJSON('contabilidad/cuentas/guardar.php', { method: 'POST', body: c }, 'admin'); },
      },
      asientos: {
        listar(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/asientos/listar.php' + qs, {}, 'admin');
        },
        detalle(id) { return fetchJSON('contabilidad/asientos/detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
        reversar(id) { return fetchJSON('contabilidad/asientos/reversar.php', { method: 'POST', body: { id } }, 'admin'); },
        generar(params) { return fetchJSON('contabilidad/asientos/generar.php', { method: 'POST', body: params }, 'admin'); },
      },
      reportes: {
        iva(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/reportes/iva.php' + qs, {}, 'admin');
        },
        retenciones(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/reportes/retenciones.php' + qs, {}, 'admin');
        },
        tributarioMensual(params = {}) {
          const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
          return fetchJSON('contabilidad/reportes/tributario-mensual.php' + qs, {}, 'admin');
        },
      },
      tarifas: {
        listar()   { return fetchJSON('contabilidad/tarifas/listar.php', {}, 'admin'); },
        guardar(t) { return fetchJSON('contabilidad/tarifas/guardar.php', { method: 'POST', body: t }, 'admin'); },
      },
      config: {
        get()    { return fetchJSON('contabilidad/config/get.php', {}, 'admin'); },
        set(obj) { return fetchJSON('contabilidad/config/set.php', { method: 'POST', body: obj }, 'admin'); },
      },
    },

    /* ---------- Pedidos ---------- */
    pedidos: {
      // Pasamos 'cliente' como rolAuth: si hay token de cliente, lo enviamos
      // para que el pedido quede asociado a su cuenta. Si no hay token (invitado),
      // fetchJSON simplemente no manda Authorization y el backend acepta igual.
      crear(pedido)              { return fetchJSON('pedidos/crear.php',          { method: 'POST', body: pedido }, 'cliente'); },
      listar(params = {})        { return fetchJSON('pedidos/listar.php' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''), {}, 'admin'); },
      misPedidos()               { return fetchJSON('pedidos/listar.php', {}, 'cliente'); },
      detalle(id)                { return fetchJSON('pedidos/detalle.php?id=' + encodeURIComponent(id), {}, 'admin'); },
      detallePorCodigo(codigo)   { return fetchJSON('pedidos/detalle.php?codigo=' + encodeURIComponent(codigo), {}, 'admin'); },
      cambiarEstado(id, estado)  { return fetchJSON('pedidos/cambiar-estado.php', { method: 'POST', body: { id, estado } }, 'admin'); },
      // Actualización general: estado + tracking + notas internas
      actualizar(id, datos)      { return fetchJSON('pedidos/actualizar.php',     { method: 'POST', body: { id, ...datos } }, 'admin'); },
      // El cliente cancela su propio pedido (solo si está pendiente)
      cancelar(id)               { return fetchJSON('pedidos/cancelar.php',       { method: 'POST', body: { id }       }, 'cliente'); },
      // El cliente solicita la factura electrónica de un pedido suyo (con sus datos fiscales)
      solicitarFactura(id, comprador) { return fetchJSON('pedidos/solicitar-factura.php', { method: 'POST', body: { id, comprador } }, 'cliente'); },
      // Detalle accesible por cliente (verifica que el pedido sea suyo en backend) o admin
      miDetalle(id)              { return fetchJSON('pedidos/detalle.php?id=' + encodeURIComponent(id), {}, 'cliente'); },
    },

    /* ---------- Admins (solo superadmin) ---------- */
    admins: {
      listar()             { return fetchJSON('admins/listar.php',   {},                                      'admin'); },
      guardar(admin)       { return fetchJSON('admins/guardar.php',  { method: 'POST', body: admin },         'admin'); },
      eliminar(id)         { return fetchJSON('admins/eliminar.php', { method: 'POST', body: { id } },        'admin'); },
    },

    /* ---------- Pagos ---------- */
    pagos: {
      payphoneIniciar(pedidoId)  { return fetchJSON('pagos/payphone-iniciar.php', { method: 'POST', body: { pedido_id: pedidoId } }); },
    },

    /* ---------- Analítica (embudo propio, anónimo) ---------- */
    analytics: {
      track(payload)        { return fetchJSON('analytics/track.php', { method: 'POST', body: payload }); },
      resumen(params = {})  { const qs = new URLSearchParams(params).toString(); return fetchJSON('analytics/resumen.php' + (qs ? '?' + qs : ''), {}, 'admin'); },
    },
  };

  global.Api = Api;
})(window);
