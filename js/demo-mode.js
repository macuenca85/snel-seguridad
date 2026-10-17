/* ============================================================
   SNEL — MODO DEMO (sin backend PHP)
   ------------------------------------------------------------
   Intercepta window.fetch para todas las URLs /api/endpoints/...
   y devuelve respuestas simuladas, persistiendo en localStorage.

   Se ACTIVA si:
     • location.protocol === 'file:'  (HTML abierto directo)
     • URL contiene ?demo=1
     • localStorage.snel_demo_force === '1'

   Para FORZAR desactivación (e.g. cuando ya estés en Hostinger):
     localStorage.setItem('snel_demo_disabled', '1')

   Cuentas pre-cargadas:
     • Admin:  usuario = admin           · password = snel2026
     • Cliente: email = cliente@demo.com · password = cliente123

   Datos persisten en localStorage. Botón "Reiniciar datos demo"
   en el banner flotante limpia y vuelve a seedear.
   ============================================================ */
(function () {
  'use strict';

  // -------- Detección de modo demo --------
  function debeActivar() {
    try {
      if (localStorage.getItem('snel_demo_disabled') === '1') return false;
      if (localStorage.getItem('snel_demo_force')    === '1') return true;
    } catch (_) {}
    if (location.protocol === 'file:') return true;
    if (/[?&]demo=1\b/.test(location.search)) return true;
    return false;
  }
  if (!debeActivar()) return;

  // Marcar forzado para que persista entre páginas durante la sesión
  try { localStorage.setItem('snel_demo_force', '1'); } catch (_) {}

  // -------- Helpers de storage --------
  const NS = 'snel_demo_';
  const Store = {
    get(k, def = null) {
      try {
        const v = localStorage.getItem(NS + k);
        return v ? JSON.parse(v) : def;
      } catch (_) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (_) {}
    },
    del(k) { try { localStorage.removeItem(NS + k); } catch (_) {} },
    clear() {
      try {
        Object.keys(localStorage).filter(k => k.startsWith(NS)).forEach(k => localStorage.removeItem(k));
      } catch (_) {}
    },
  };

  // -------- "Hash" de password (NO seguro, solo demo) --------
  // En backend real es bcrypt; aquí es un hash simple por puro juego.
  function hashDemo(pwd) {
    let h = 0;
    for (let i = 0; i < pwd.length; i++) {
      h = ((h << 5) - h + pwd.charCodeAt(i)) | 0;
    }
    return 'demo$' + (h >>> 0).toString(16) + '$' + pwd.length;
  }
  function verifyDemo(pwd, hash) {
    return hashDemo(pwd) === hash;
  }

  // -------- JWT fake (base64, sin firmar) --------
  function b64u(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  }
  function b64uDecode(s) {
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    try { return decodeURIComponent(escape(atob(s))); } catch (_) { return ''; }
  }
  function tokenFor(payload) {
    const exp = Math.floor(Date.now()/1000) + 60*60*24*30;
    const body = { ...payload, iat: Math.floor(Date.now()/1000), exp };
    return b64u(JSON.stringify({alg:'demo'})) + '.' + b64u(JSON.stringify(body)) + '.demo';
  }
  function decodeToken(tok) {
    if (!tok) return null;
    const parts = tok.split('.');
    if (parts.length !== 3) return null;
    try { return JSON.parse(b64uDecode(parts[1])); } catch (_) { return null; }
  }
  function authFromReq(headers) {
    const h = headers && (headers.get ? headers.get('Authorization') : headers['Authorization']);
    if (!h || !h.startsWith('Bearer ')) return null;
    return decodeToken(h.slice(7));
  }

  // -------- Validaciones (espejo del backend) --------
  function vEmail(e)    { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e||'').trim()); }
  function vCedulaEC(c) {
    const x = String(c||'').replace(/\D/g,'');
    if (x.length !== 10) return false;
    const p = parseInt(x.substr(0,2),10);
    if (p<1||p>24) return false;
    if (parseInt(x[2],10)>=6) return false;
    const co=[2,1,2,1,2,1,2,1,2]; let s=0;
    for(let i=0;i<9;i++){ let v=parseInt(x[i],10)*co[i]; if(v>9)v-=9; s+=v; }
    return ((10-(s%10))%10) === parseInt(x[9],10);
  }
  function vRucEC(r) {
    const x = String(r||'').replace(/\D/g,'');
    return x.length===13 && x.endsWith('001') && vCedulaEC(x.substr(0,10));
  }
  function vTelefonoEC(t) {
    const x = String(t||'').replace(/\D/g,'');
    return /^(09\d{8}|5939\d{8})$/.test(x);
  }

  /* ============================================================
     SEED INICIAL
     ============================================================ */
  function seed() {
    // Re-sembrar el CATÁLOGO (categorías + productos) cuando cambia la versión
    // del catálogo en data.js. Así el demo no se queda con datos viejos en
    // localStorage al actualizar el inventario (no toca pedidos/clientes/etc.).
    const catVer = (typeof window !== 'undefined' && window.CATALOGO_VERSION) || 1;
    const reseedCatalogo = Store.get('catalogo_version') !== catVer;

    // Categorías (usar las de data.js si están disponibles)
    if (reseedCatalogo || !Store.get('categorias')) {
      let cats = [];
      if (window.CATEGORIAS && Array.isArray(window.CATEGORIAS)) {
        cats = window.CATEGORIAS.map((c, i) => ({
          ...c,
          icono: c.icono || '📦',
          iconoUrl: c.iconoUrl || null,
          descripcion: c.descripcion || '',
          orden: i, activa: 1,
        }));
      }
      Store.set('categorias', cats);
    }

    // Productos (usar los de data.js si están disponibles)
    if (reseedCatalogo || !Store.get('productos')) {
      let prods = [];
      if (window.PRODUCTOS && Array.isArray(window.PRODUCTOS)) {
        prods = window.PRODUCTOS.map(p => ({
          id: p.id, nombre: p.nombre, categoria_id: p.categoria,
          marca: p.marca, precio: +p.precio || 0,
          precio_anterior: p.precioAnterior || null,
          stock: +p.stock || 0,
          rating: +p.rating || 4.5, reviews: +p.reviews || 0,
          imagen: p.imagen || 'img/placeholder.svg',
          imagen_url: p.imagenUrl || null,
          imagenes: Array.isArray(p.imagenes) ? p.imagenes : (p.imagenUrl ? [p.imagenUrl] : []),
          descripcion: p.descripcion || '',
          caracteristicas: p.caracteristicas || [],
          specs: p.specs || {},
          destacado: p.destacado ? 1 : 0,
          mas_vendido: p.masVendido ? 1 : 0,
          activo: 1,
          creado_en: new Date().toISOString(),
        }));
      }
      Store.set('productos', prods);
    }
    if (reseedCatalogo) Store.set('catalogo_version', catVer);

    // Admins (uno superadmin por defecto)
    if (!Store.get('admins')) {
      Store.set('admins', [{
        id: 1, usuario: 'admin',
        password_hash: hashDemo('snel2026'),
        nombre: 'Administrador Demo', cargo: 'Superadministrador',
        iniciales: 'AD', email: 'admin@snelseguridad.com',
        rol: 'superadmin', activo: 1,
        creado_en: new Date().toISOString(),
      }]);
      Store.set('admins_seq', 2);
    }

    // Cliente demo con algunos pedidos
    if (!Store.get('clientes')) {
      const ahora = new Date();
      const hace5d = new Date(ahora.getTime() - 5*86400e3).toISOString();
      const hace20d = new Date(ahora.getTime() - 20*86400e3).toISOString();
      const hace60d = new Date(ahora.getTime() - 60*86400e3).toISOString();
      Store.set('clientes', [{
        id: 1, email: 'cliente@demo.com',
        password_hash: hashDemo('cliente123'),
        nombre: 'Cliente Demo', telefono: '0991234567', cedula: '',
        direccion: 'Av. Universitaria S/N', ciudad: 'Loja', provincia: 'Loja',
        email_verificado: 0, email_verif_token: null, email_verif_enviado_en: null,
        notif_email: 1, notif_promos: 1, notif_pedidos: 1,
        creado_en: hace60d,
      }]);
      Store.set('clientes_seq', 2);

      // Pedidos de ejemplo
      const productos = Store.get('productos') || [];
      const tomar = (n) => productos.slice(0, n).map(p => ({
        producto_id: p.id, nombre: p.nombre, precio_unitario: p.precio,
        cantidad: 1, subtotal: p.precio, imagen: p.imagen_url || p.imagen,
      }));
      const items1 = tomar(2);
      const items2 = tomar(3);
      const items3 = tomar(1);
      const sub1 = items1.reduce((s,i)=>s+i.subtotal,0);
      const sub2 = items2.reduce((s,i)=>s+i.subtotal,0);
      const sub3 = items3.reduce((s,i)=>s+i.subtotal,0);
      const mk = (id,codigo,estado,fecha,items,sub) => {
        const iva = +(sub*0.15).toFixed(2);
        const env = sub >= 200 ? 0 : 8;
        return {
          id, codigo, cliente_id: 1,
          nombre: 'Cliente Demo', email: 'cliente@demo.com',
          telefono: '0991234567', cedula: '1103755679',
          direccion: 'Av. Universitaria S/N', ciudad: 'Loja', provincia: 'Loja',
          referencia: '',
          subtotal: sub, iva, costo_envio: env, total: +(sub+iva+env).toFixed(2),
          tipo_envio: 'estandar', metodo_pago: 'transferencia',
          estado, pago_referencia: null,
          notas: '', notas_internas: '',
          tracking_numero: null, tracking_courier: null, tracking_url: null,
          creado_en: fecha, actualizado_en: fecha,
          items,
        };
      };
      Store.set('pedidos', [
        mk(1, 'SNEL-DEMO-001', 'pendiente',  hace5d,  items1, sub1),
        mk(2, 'SNEL-DEMO-002', 'enviado',    hace20d, items2, sub2),
        mk(3, 'SNEL-DEMO-003', 'entregado',  hace60d, items3, sub3),
      ]);
      Store.set('pedidos_seq', 4);
    }

    // Direcciones, favoritos
    if (!Store.get('direcciones')) {
      Store.set('direcciones', [{
        id: 1, cliente_id: 1, alias: 'Casa',
        recibe_nombre: 'Cliente Demo', recibe_telefono: '0991234567',
        recibe_cedula: '', direccion: 'Av. Universitaria S/N',
        ciudad: 'Loja', provincia: 'Loja', codigo_postal: '110150',
        referencia: 'Frente al parque central',
        es_predeterminada: 1, creado_en: new Date().toISOString(),
      }]);
      Store.set('direcciones_seq', 2);
    }
    if (!Store.get('favoritos')) Store.set('favoritos', []);

    // Config (se re-siembra también al cambiar la versión del catálogo,
    // p.ej. para propagar un cambio de número de contacto)
    if (reseedCatalogo || !Store.get('config')) {
      Store.set('config', {
        empresa: 'Snel Seguridad',
        slogan: 'Tecnología inteligente para tu hogar y empresa',
        telefono: '+593 99 121 2657',
        whatsapp: '593991212657',
        email: 'ventas@snelseguridad.com',
        direccion: 'Loja, Ecuador',
        ciudad: 'Loja',
        horario: 'Lun–Vie 9:00–18:30 · Sáb 9:00–13:00',
        iva: '0.15',
        envio_gratis_desde: '200',
        costo_envio: '8',
        costo_envio_express: '18',
        facebook: 'https://facebook.com/snel.loja',
        instagram: 'https://instagram.com/snel.loja',
        tiktok: 'https://tiktok.com/@snel.loja',
        ga4_id: '',
        meta_pixel_id: '',
      });
    }
  }
  // El seed real corre cuando data.js ya está cargado y estemos en DOM ready
  function seedTardio() {
    seed();
  }

  /* ============================================================
     RESPUESTAS HELPER
     ============================================================ */
  function mkResp(body, status) {
    const str = JSON.stringify(body);
    if (typeof Response !== 'undefined') {
      return new Response(str, { status, headers: { 'Content-Type': 'application/json' } });
    }
    // Fallback para entornos sin Fetch API (tests con JSDOM, etc.)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      text: async () => str,
      json: async () => body,
    };
  }
  function ok(data, status = 200) { return mkResp({ ok: true, data }, status); }
  function err(msg, status = 400, extra = null) {
    const body = { ok: false, error: msg };
    if (extra) body.detalle = extra;
    return mkResp(body, status);
  }
  function requireFields(body, fields) {
    const missing = fields.filter(f => body[f] === undefined || body[f] === '' || body[f] === null);
    if (missing.length) return err('Faltan campos: ' + missing.join(', '), 400);
    return null;
  }
  function nextId(seqKey) {
    const id = Store.get(seqKey, 1);
    Store.set(seqKey, id + 1);
    return id;
  }

  /* ============================================================
     HANDLERS de endpoints
     ============================================================ */
  const Handlers = {};

  /* ---------- AUTH admin ---------- */
  Handlers['auth/login-admin.php'] = (req, body) => {
    const e = requireFields(body, ['usuario', 'password']);
    if (e) return e;
    const admins = Store.get('admins', []);
    const u = admins.find(a => a.usuario === body.usuario && a.activo);
    if (!u || !verifyDemo(body.password, u.password_hash)) {
      return err('Credenciales inválidas', 401);
    }
    const token = tokenFor({ sub: u.id, rol: u.rol, usuario: u.usuario, nombre: u.nombre });
    return ok({
      token,
      admin: {
        id: u.id, usuario: u.usuario, nombre: u.nombre,
        cargo: u.cargo, iniciales: u.iniciales, email: u.email, rol: u.rol,
      },
    });
  };

  Handlers['auth/cambiar-password.php'] = (req, body, payload) => {
    if (!payload) return err('Token requerido', 401);
    const e = requireFields(body, ['password_actual', 'password_nueva']);
    if (e) return e;
    if (body.password_nueva.length < 8) return err('Mínimo 8 caracteres', 400);

    const esAdmin = ['superadmin','admin','vendedor'].includes(payload.rol);
    const key = esAdmin ? 'admins' : 'clientes';
    const lista = Store.get(key, []);
    const u = lista.find(x => x.id === payload.sub);
    if (!u) return err('No encontrado', 404);
    if (!verifyDemo(body.password_actual, u.password_hash)) return err('Contraseña actual incorrecta', 401);
    u.password_hash = hashDemo(body.password_nueva);
    Store.set(key, lista);
    return ok({ cambiada: true });
  };

  Handlers['auth/actualizar-admin.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('No autorizado', 403);
    const admins = Store.get('admins', []);
    const u = admins.find(x => x.id === payload.sub);
    if (!u) return err('Admin no encontrado', 404);
    ['nombre','cargo','iniciales','email'].forEach(k => {
      if (body[k] !== undefined) u[k] = body[k];
    });
    Store.set('admins', admins);
    return ok({ actualizado: true });
  };

  Handlers['auth/enviar-verificacion.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const cls = Store.get('clientes', []);
    const c = cls.find(x => x.id === payload.sub);
    if (!c) return err('Cliente no encontrado', 404);
    if (c.email_verificado) return ok({ mensaje: 'Tu email ya está verificado.', verificado: true });
    c.email_verif_token = 'demo-' + Math.random().toString(36).slice(2, 10);
    c.email_verif_enviado_en = new Date().toISOString();
    Store.set('clientes', cls);
    return ok({
      mensaje: '✉ (Demo) Correo "enviado". Token: ' + c.email_verif_token + '. Para verificar, abre: cuenta.html#verificado&token=' + c.email_verif_token,
    });
  };

  Handlers['auth/verificar-email.php'] = (req, body) => {
    const token = body.token || new URL(req.url).searchParams.get('token');
    if (!token) return err('Token requerido.', 400);
    const cls = Store.get('clientes', []);
    const c = cls.find(x => x.email_verif_token === token);
    if (!c) return err('Token inválido o ya usado.', 404);
    c.email_verificado = 1;
    c.email_verif_token = null;
    c.email_verif_enviado_en = null;
    Store.set('clientes', cls);
    return ok({ mensaje: '¡Email verificado correctamente!', verificado: true });
  };

  /* ---------- ADMINS (gestión de usuarios) ---------- */
  Handlers['admins/listar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'superadmin') return err('Solo superadmin', 403);
    const admins = Store.get('admins', []).slice().sort((a,b) => {
      const r = { superadmin: 0, admin: 1, vendedor: 2 };
      return (r[a.rol]||9) - (r[b.rol]||9) || a.id - b.id;
    });
    return ok(admins.map(a => ({
      id: a.id, usuario: a.usuario, nombre: a.nombre, cargo: a.cargo,
      iniciales: a.iniciales, email: a.email, rol: a.rol,
      activo: !!a.activo, creadoEn: a.creado_en,
    })));
  };

  Handlers['admins/guardar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'superadmin') return err('Solo superadmin', 403);
    const id = body.id ? +body.id : null;
    const esCreacion = !id;
    if (esCreacion) {
      const e = requireFields(body, ['usuario','password','nombre','rol']);
      if (e) return e;
    } else {
      const e = requireFields(body, ['usuario','nombre','rol']);
      if (e) return e;
    }
    if (!['superadmin','admin','vendedor'].includes(body.rol)) return err('Rol inválido', 400);
    const admins = Store.get('admins', []);
    if (admins.find(a => a.usuario === body.usuario && a.id !== id)) return err('Usuario ya existe', 409);

    if (esCreacion) {
      if ((body.password||'').length < 8) return err('Contraseña min 8', 400);
      const nuevo = {
        id: nextId('admins_seq'),
        usuario: body.usuario.trim(),
        password_hash: hashDemo(body.password),
        nombre: body.nombre.trim(),
        cargo: body.cargo || (body.rol === 'superadmin' ? 'Superadministrador' : body.rol === 'admin' ? 'Administrador' : 'Vendedor'),
        iniciales: (body.iniciales || body.nombre.substring(0,2)).toUpperCase().slice(0,3),
        email: body.email || null,
        rol: body.rol,
        activo: body.activo != null ? +!!body.activo : 1,
        creado_en: new Date().toISOString(),
      };
      admins.push(nuevo);
      Store.set('admins', admins);
      return ok({ id: nuevo.id, mensaje: 'Usuario creado' });
    }

    const u = admins.find(a => a.id === id);
    if (!u) return err('Usuario no encontrado', 404);
    if (payload.sub === u.id && body.rol !== u.rol) return err('No puedes cambiar tu propio rol', 403);
    if (payload.sub === u.id && !+body.activo) return err('No puedes desactivarte', 403);
    if (u.rol === 'superadmin' && (body.rol !== 'superadmin' || !+body.activo)) {
      const otros = admins.filter(a => a.id !== id && a.rol === 'superadmin' && a.activo).length;
      if (otros === 0) return err('Debe quedar al menos un superadmin activo', 409);
    }
    u.usuario = body.usuario; u.nombre = body.nombre; u.rol = body.rol;
    u.cargo = body.cargo || u.cargo; u.iniciales = body.iniciales || u.iniciales;
    u.email = body.email; u.activo = +!!body.activo;
    if (body.password) {
      if (body.password.length < 8) return err('Contraseña min 8', 400);
      u.password_hash = hashDemo(body.password);
    }
    Store.set('admins', admins);
    return ok({ id: u.id, mensaje: 'Usuario actualizado' });
  };

  Handlers['admins/eliminar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'superadmin') return err('Solo superadmin', 403);
    const id = +body.id;
    if (id === payload.sub) return err('No puedes eliminarte', 403);
    const admins = Store.get('admins', []);
    const u = admins.find(a => a.id === id);
    if (!u) return err('No encontrado', 404);
    if (u.rol === 'superadmin' && u.activo) {
      const otros = admins.filter(a => a.id !== id && a.rol === 'superadmin' && a.activo).length;
      if (otros === 0) return err('Es el último superadmin activo', 409);
    }
    u.activo = 0;
    Store.set('admins', admins);
    return ok({ id, mensaje: 'Desactivado' });
  };

  /* ---------- CLIENTES ---------- */
  Handlers['clientes/registro.php'] = (req, body) => {
    const e = requireFields(body, ['email','password','nombre']);
    if (e) return e;
    if (!vEmail(body.email)) return err('Email inválido', 400);
    if (body.password.length < 8) return err('Contraseña min 8', 400);
    const cls = Store.get('clientes', []);
    if (cls.find(c => c.email === body.email.toLowerCase())) return err('Ese email ya está registrado', 409);
    const nuevo = {
      id: nextId('clientes_seq'),
      email: body.email.toLowerCase(),
      password_hash: hashDemo(body.password),
      nombre: body.nombre.trim(),
      telefono: body.telefono || null,
      cedula: body.cedula || null,
      direccion: body.direccion || null,
      ciudad: body.ciudad || null,
      provincia: body.provincia || null,
      email_verificado: 0, email_verif_token: null, email_verif_enviado_en: null,
      notif_email: 1, notif_promos: 1, notif_pedidos: 1,
      creado_en: new Date().toISOString(),
    };
    cls.push(nuevo);
    Store.set('clientes', cls);
    const token = tokenFor({ sub: nuevo.id, rol: 'cliente', email: nuevo.email, nombre: nuevo.nombre });
    return ok({ token, cliente: { id: nuevo.id, email: nuevo.email, nombre: nuevo.nombre } }, 201);
  };

  Handlers['clientes/login.php'] = (req, body) => {
    const e = requireFields(body, ['email','password']);
    if (e) return e;
    const cls = Store.get('clientes', []);
    const u = cls.find(c => c.email === body.email.toLowerCase());
    if (!u || !verifyDemo(body.password, u.password_hash)) {
      return err('Credenciales inválidas', 401);
    }
    const token = tokenFor({ sub: u.id, rol: 'cliente', email: u.email, nombre: u.nombre });
    return ok({ token, cliente: { id: u.id, email: u.email, nombre: u.nombre } });
  };

  Handlers['clientes/me.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const cls = Store.get('clientes', []);
    const u = cls.find(c => c.id === payload.sub);
    if (!u) return err('Cliente no encontrado', 404);
    if (req.method === 'PUT' || req.method === 'POST') {
      ['nombre','telefono','cedula','direccion','ciudad','provincia'].forEach(k => {
        if (body[k] !== undefined) u[k] = body[k];
      });
      ['notif_email','notif_promos','notif_pedidos'].forEach(k => {
        if (body[k] !== undefined) u[k] = body[k] ? 1 : 0;
      });
      Store.set('clientes', cls);
      return ok({ actualizado: true });
    }
    return ok({
      id: u.id, email: u.email, nombre: u.nombre, telefono: u.telefono,
      cedula: u.cedula, direccion: u.direccion, ciudad: u.ciudad, provincia: u.provincia,
      email_verificado: !!u.email_verificado,
      notif_email: !!u.notif_email, notif_promos: !!u.notif_promos, notif_pedidos: !!u.notif_pedidos,
      creado_en: u.creado_en,
    });
  };

  /* ---------- DIRECCIONES ---------- */
  Handlers['clientes/direcciones/listar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const dirs = Store.get('direcciones', []).filter(d => d.cliente_id === payload.sub);
    dirs.sort((a,b) => (b.es_predeterminada - a.es_predeterminada) || (new Date(b.creado_en) - new Date(a.creado_en)));
    return ok(dirs.map(d => ({
      id: d.id, alias: d.alias, recibeNombre: d.recibe_nombre,
      recibeTelefono: d.recibe_telefono, recibeCedula: d.recibe_cedula,
      direccion: d.direccion, ciudad: d.ciudad, provincia: d.provincia,
      codigoPostal: d.codigo_postal, referencia: d.referencia,
      esPredeterminada: !!d.es_predeterminada, creadoEn: d.creado_en,
    })));
  };
  Handlers['clientes/direcciones/guardar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const e = requireFields(body, ['recibeNombre','direccion','ciudad','provincia']);
    if (e) return e;
    if (body.recibeTelefono && !vTelefonoEC(body.recibeTelefono)) return err('Teléfono inválido', 400);
    if (body.recibeCedula && !vCedulaEC(body.recibeCedula)) return err('Cédula inválida', 400);
    const dirs = Store.get('direcciones', []);
    const cliente_id = payload.sub;
    let d;
    if (body.id) {
      d = dirs.find(x => x.id === +body.id && x.cliente_id === cliente_id);
      if (!d) return err('Dirección no encontrada', 404);
    } else {
      d = { id: nextId('direcciones_seq'), cliente_id, creado_en: new Date().toISOString() };
      dirs.push(d);
    }
    d.alias = body.alias || 'Mi dirección';
    d.recibe_nombre = body.recibeNombre;
    d.recibe_telefono = body.recibeTelefono || null;
    d.recibe_cedula = body.recibeCedula || null;
    d.direccion = body.direccion;
    d.ciudad = body.ciudad;
    d.provincia = body.provincia;
    d.codigo_postal = body.codigoPostal || null;
    d.referencia = body.referencia || null;
    d.es_predeterminada = body.esPredeterminada ? 1 : 0;

    if (d.es_predeterminada) {
      dirs.filter(x => x.cliente_id === cliente_id && x.id !== d.id).forEach(x => x.es_predeterminada = 0);
    }
    // Si no hay ninguna predeterminada, marcar esta
    const tienePred = dirs.some(x => x.cliente_id === cliente_id && x.es_predeterminada);
    if (!tienePred) d.es_predeterminada = 1;

    Store.set('direcciones', dirs);
    return ok({ id: d.id, mensaje: 'Dirección guardada' });
  };
  Handlers['clientes/direcciones/eliminar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const dirs = Store.get('direcciones', []);
    const d = dirs.find(x => x.id === +body.id && x.cliente_id === payload.sub);
    if (!d) return err('No encontrada', 404);
    const eraPred = !!d.es_predeterminada;
    const nuevas = dirs.filter(x => x.id !== d.id);
    if (eraPred) {
      const otras = nuevas.filter(x => x.cliente_id === payload.sub).sort((a,b) => new Date(b.creado_en)-new Date(a.creado_en));
      if (otras[0]) otras[0].es_predeterminada = 1;
    }
    Store.set('direcciones', nuevas);
    return ok({ id: d.id, mensaje: 'Eliminada' });
  };
  Handlers['clientes/direcciones/set-default.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const dirs = Store.get('direcciones', []);
    const d = dirs.find(x => x.id === +body.id && x.cliente_id === payload.sub);
    if (!d) return err('No encontrada', 404);
    dirs.filter(x => x.cliente_id === payload.sub).forEach(x => x.es_predeterminada = 0);
    d.es_predeterminada = 1;
    Store.set('direcciones', dirs);
    return ok({ id: d.id, mensaje: 'Predeterminada actualizada' });
  };

  /* ---------- FAVORITOS ---------- */
  Handlers['clientes/favoritos/listar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const favs = Store.get('favoritos', []).filter(f => f.cliente_id === payload.sub);
    const prods = Store.get('productos', []);
    const out = favs.map(f => {
      const p = prods.find(x => x.id === f.producto_id);
      if (!p) return null;
      return {
        id: p.id, nombre: p.nombre, categoriaId: p.categoria_id, marca: p.marca,
        precio: p.precio, precioAnterior: p.precio_anterior,
        stock: p.stock, imagen: p.imagen_url || p.imagen,
        descripcion: p.descripcion, rating: p.rating, reviews: p.reviews,
        activo: !!p.activo, agregadoEn: f.creado_en,
      };
    }).filter(Boolean);
    return ok(out);
  };
  Handlers['clientes/favoritos/ids.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const favs = Store.get('favoritos', []).filter(f => f.cliente_id === payload.sub);
    return ok(favs.map(f => f.producto_id));
  };
  Handlers['clientes/favoritos/toggle.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('No autorizado', 403);
    const pid = body.productoId;
    if (!pid) return err('productoId requerido', 400);
    const favs = Store.get('favoritos', []);
    const idx = favs.findIndex(f => f.cliente_id === payload.sub && f.producto_id === pid);
    if (idx >= 0) {
      favs.splice(idx, 1);
      Store.set('favoritos', favs);
      return ok({ accion: 'eliminado', productoId: pid, favorito: false });
    }
    favs.push({ cliente_id: payload.sub, producto_id: pid, creado_en: new Date().toISOString() });
    Store.set('favoritos', favs);
    return ok({ accion: 'agregado', productoId: pid, favorito: true });
  };

  /* ---------- PRODUCTOS ---------- */
  Handlers['productos/listar.php'] = (req) => {
    const url = new URL(req.url);
    const cat = url.searchParams.get('categoria');
    const marca = url.searchParams.get('marca');
    const q = url.searchParams.get('q');
    const destacados = url.searchParams.has('destacados');
    const masVend = url.searchParams.has('mas_vendidos');
    let prods = Store.get('productos', []).filter(p => p.activo);
    if (cat) prods = prods.filter(p => p.categoria_id === cat);
    if (marca) prods = prods.filter(p => p.marca === marca);
    if (q) {
      const ql = q.toLowerCase();
      prods = prods.filter(p =>
        (p.nombre||'').toLowerCase().includes(ql) ||
        (p.descripcion||'').toLowerCase().includes(ql) ||
        (p.marca||'').toLowerCase().includes(ql)
      );
    }
    if (destacados) prods = prods.filter(p => p.destacado);
    if (masVend) prods = prods.filter(p => p.mas_vendido);
    prods.sort((a,b) => (b.destacado-a.destacado) || (b.mas_vendido-a.mas_vendido) || a.nombre.localeCompare(b.nombre));
    return ok(prods.map(p => ({
      id: p.id, nombre: p.nombre, categoria: p.categoria_id, marca: p.marca,
      precio: p.precio, precioAnterior: p.precio_anterior, stock: p.stock,
      rating: p.rating, reviews: p.reviews, imagen: p.imagen, imagenUrl: p.imagen_url,
      imagenes: Array.isArray(p.imagenes) ? p.imagenes : (p.imagen_url ? [p.imagen_url] : []),
      descripcion: p.descripcion, caracteristicas: p.caracteristicas, specs: p.specs,
      destacado: !!p.destacado, masVendido: !!p.mas_vendido,
    })));
  };
  Handlers['productos/guardar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const prods = Store.get('productos', []);
    let p;
    if (body.id) {
      p = prods.find(x => x.id === body.id);
      if (!p) { p = { id: body.id, creado_en: new Date().toISOString() }; prods.push(p); }
    } else {
      p = { id: 'p-' + Date.now(), creado_en: new Date().toISOString() };
      prods.push(p);
    }
    p.nombre = body.nombre; p.categoria_id = body.categoria || body.categoria_id;
    p.marca = body.marca; p.precio = +body.precio || 0;
    p.precio_anterior = body.precioAnterior ? +body.precioAnterior : null;
    p.stock = +body.stock || 0;
    p.rating = +body.rating || 4.5; p.reviews = +body.reviews || 0;
    p.imagen = body.imagen || 'img/placeholder.svg';
    // Múltiples fotos: aceptamos `imagenes` (array). La 1ª se replica en
    // imagen_url para retro-compat con vistas que aún leen una sola foto.
    if (Array.isArray(body.imagenes)) {
      p.imagenes = body.imagenes.filter(Boolean);
      p.imagen_url = p.imagenes[0] || null;
    } else {
      p.imagen_url = body.imagenUrl || null;
      p.imagenes = p.imagen_url ? [p.imagen_url] : [];
    }
    p.descripcion = body.descripcion || '';
    p.caracteristicas = body.caracteristicas || [];
    p.specs = body.specs || {};
    p.destacado = body.destacado ? 1 : 0;
    p.mas_vendido = body.masVendido ? 1 : 0;
    p.activo = body.activo != null ? +!!body.activo : 1;
    Store.set('productos', prods);
    return ok({ id: p.id, mensaje: 'Guardado' });
  };
  Handlers['productos/importar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const entrantes = Array.isArray(body && body.productos) ? body.productos : [];
    if (!entrantes.length) return err('No se recibieron productos', 400);
    const modo = (body && body.modo) || 'upsert';
    const norm = (p) => ({
      id: p.id, nombre: p.nombre || '', categoria_id: p.categoria_id || p.categoria || 'accesorios',
      marca: p.marca || '', precio: +p.precio || 0,
      precio_anterior: p.precio_anterior != null ? +p.precio_anterior : (p.precioAnterior != null ? +p.precioAnterior : null),
      stock: +p.stock || 0, rating: +p.rating || 4.5, reviews: +p.reviews || 0,
      imagen: p.imagen || 'img/placeholder.svg', imagen_url: p.imagen_url || null,
      imagenes: Array.isArray(p.imagenes) ? p.imagenes : [],
      descripcion: p.descripcion || '', caracteristicas: p.caracteristicas || [], specs: p.specs || {},
      destacado: p.destacado ? 1 : 0, mas_vendido: (p.mas_vendido || p.masVendido) ? 1 : 0,
      activo: p.activo != null ? (+!!p.activo) : 1, creado_en: new Date().toISOString(),
    });
    let prods = Store.get('productos', []);
    let nuevos = 0, actualizados = 0;
    if (modo === 'reemplazar') {
      prods = entrantes.map(norm);
    } else {
      const idx = {}; prods.forEach((p, i) => { idx[p.id] = i; });
      entrantes.forEach(e => {
        const n = norm(e);
        if (idx[n.id] != null) { prods[idx[n.id]] = Object.assign({}, prods[idx[n.id]], n); actualizados++; }
        else { prods.push(n); idx[n.id] = prods.length - 1; nuevos++; }
      });
    }
    Store.set('productos', prods);
    return ok({ importados: entrantes.length, nuevos, actualizados, total_catalogo: prods.length, modo });
  };

  Handlers['analytics/track.php'] = (req, body, payload) => {
    const EV = ['page_view','ver_categoria','ver_producto','buscar','add_carrito','inicia_checkout','compra'];
    if (!body || EV.indexOf(body.evento) === -1) return ok({ ignorado: true });
    const arr = Store.get('analytics', []);
    arr.push({
      sid: String(body.sid || '').slice(0, 40), evento: body.evento,
      producto_id: body.producto_id || null, categoria_id: body.categoria_id || null,
      termino: body.termino || null,
      resultados: (body.resultados != null ? +body.resultados : null),
      valor: (body.valor != null ? +body.valor : null), pagina: body.pagina || null,
      ts: Date.now(),
    });
    if (arr.length > 3000) arr.splice(0, arr.length - 3000);
    Store.set('analytics', arr);
    return ok({ registrado: true });
  };
  Handlers['analytics/resumen.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const arr = Store.get('analytics', []);
    let dias = 30; try { dias = parseInt(new URL(req.url).searchParams.get('dias'), 10) || 30; } catch (e) {}
    const desde = Date.now() - dias * 864e5;
    const ev = arr.filter(e => (e.ts || 0) >= desde);
    const cont = (n) => ev.filter(e => e.evento === n).length;
    const embudo = [
      { paso: 'Visitas',         evento: 'page_view',       n: cont('page_view') },
      { paso: 'Ver producto',    evento: 'ver_producto',    n: cont('ver_producto') },
      { paso: 'Añadir al carrito', evento: 'add_carrito',   n: cont('add_carrito') },
      { paso: 'Inicia checkout', evento: 'inicia_checkout', n: cont('inicia_checkout') },
      { paso: 'Compra',          evento: 'compra',          n: cont('compra') },
    ];
    const sinRes = {};
    ev.filter(e => e.evento === 'buscar' && e.resultados === 0).forEach(e => {
      const t = (e.termino || '').toLowerCase().trim(); if (!t) return;
      sinRes[t] = (sinRes[t] || 0) + 1;
    });
    const busquedas_sin_resultados = Object.keys(sinRes)
      .map(t => ({ termino: t, veces: sinRes[t] }))
      .sort((a, b) => b.veces - a.veces).slice(0, 20);
    return ok({ dias, total_eventos: ev.length, embudo, busquedas_sin_resultados });
  };

  Handlers['productos/eliminar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    let prods = Store.get('productos', []);
    prods = prods.filter(p => p.id !== body.id);
    Store.set('productos', prods);
    return ok({ id: body.id, eliminado: true });
  };

  /* ---------- CATEGORÍAS ---------- */
  Handlers['categorias/listar.php'] = () => {
    const cats = Store.get('categorias', []).filter(c => c.activa).sort((a,b) => a.orden - b.orden);
    return ok(cats);
  };
  Handlers['categorias/guardar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const cats = Store.get('categorias', []);
    let c = cats.find(x => x.id === body.id);
    if (!c) { c = { id: body.id || ('cat-'+Date.now()), orden: cats.length, activa: 1 }; cats.push(c); }
    c.nombre = body.nombre; c.icono = body.icono || '📦';
    c.iconoUrl = body.iconoUrl || null;
    c.descripcion = body.descripcion || '';
    if (body.orden != null) c.orden = +body.orden;
    if (body.activa != null) c.activa = +!!body.activa;
    Store.set('categorias', cats);
    return ok({ id: c.id });
  };
  Handlers['categorias/eliminar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    let cats = Store.get('categorias', []);
    cats = cats.filter(c => c.id !== body.id);
    Store.set('categorias', cats);
    return ok({ id: body.id });
  };

  /* ---------- CONFIG ---------- */
  Handlers['config/get.php'] = () => ok(Store.get('config', {}));
  Handlers['config/set.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const cfg = Store.get('config', {});
    Object.assign(cfg, body);
    Store.set('config', cfg);
    return ok(cfg);
  };

  /* ---------- PEDIDOS ---------- */
  // ---------- CLIENTES (admin): base de datos + historial ----------
  function seedClientesDemo() {
    if (Store.get('clientes_demo_seed') === 1) return;
    const productos = Store.get('productos', []) || [];
    if (!productos.length) return; // sin catálogo todavía
    const cls = Store.get('clientes', []);
    const peds = Store.get('pedidos', []);
    let cseq = Store.get('clientes_seq', cls.length + 1);
    let pseq = Store.get('pedidos_seq', peds.length + 1);
    const dHace = d => new Date(Date.now() - d * 86400e3).toISOString();
    const mkItems = (n, off = 0) => productos.slice(off, off + n).map(p => ({
      producto_id: p.id, nombre: p.nombre, precio_unitario: p.precio,
      cantidad: 1, subtotal: p.precio, imagen: p.imagen_url || p.imagen,
    }));
    const extra = [
      { nombre:'María Fernanda Torres',  email:'mafer.torres@gmail.com',    tel:'0987654321', ced:'1102345678',     ciudad:'Loja',      prov:'Loja',             dir:'Calle Bolívar 12-34 y Mercadillo', creado:120 },
      { nombre:'Juan Carlos Pineda',     email:'jc.pineda@hotmail.com',     tel:'0991122334', ced:'1719876543',     ciudad:'Quito',     prov:'Pichincha',        dir:'Av. Amazonas N34-56', creado:95 },
      { nombre:'Hostería Castillo Real', email:'reservas@castilloreal.ec',  tel:'0972233445', ced:'1190123456001',  ciudad:'Zamora',    prov:'Zamora Chinchipe', dir:'Vía a Zamora km 2', creado:80 },
      { nombre:'Andrea Salinas',         email:'andrea.salinas@outlook.com',tel:'0993344556', ced:'0926543217',     ciudad:'Guayaquil', prov:'Guayas',           dir:'Cdla. Kennedy Norte, Mz 4', creado:45 },
    ];
    const plan = [
      [ { estado:'entregado', dias:110, items:mkItems(2,0) }, { estado:'entregado', dias:30, items:mkItems(1,2) } ],
      [ { estado:'enviado',   dias:55,  items:mkItems(3,1) } ],
      [ { estado:'entregado', dias:70,  items:mkItems(4,0) }, { estado:'pagado', dias:24, items:mkItems(2,4) }, { estado:'pendiente', dias:3, items:mkItems(1,6) } ],
      [],
    ];
    const nuevosPed = [];
    extra.forEach((c, i) => {
      const cid = cseq++;
      cls.push({
        id: cid, email: c.email, password_hash: hashDemo('demo1234'),
        nombre: c.nombre, telefono: c.tel, cedula: c.ced,
        direccion: c.dir, ciudad: c.ciudad, provincia: c.prov,
        email_verificado: 1, email_verif_token: null, email_verif_enviado_en: null,
        notif_email: 1, notif_promos: 1, notif_pedidos: 1, creado_en: dHace(c.creado),
      });
      (plan[i] || []).forEach(o => {
        const sub = o.items.reduce((sx, it) => sx + it.subtotal, 0);
        const iva = +(sub * 0.15).toFixed(2);
        const env = sub >= 200 ? 0 : 8;
        const f = dHace(o.dias);
        const pid = pseq++;
        nuevosPed.push({
          id: pid, codigo: 'SNEL-' + String(10000 + pid), cliente_id: cid,
          nombre: c.nombre, email: c.email, telefono: c.tel, cedula: c.ced,
          direccion: c.dir, ciudad: c.ciudad, provincia: c.prov, referencia: '',
          subtotal: sub, iva, costo_envio: env, total: +(sub + iva + env).toFixed(2),
          tipo_envio: 'estandar', metodo_pago: 'transferencia', estado: o.estado, pago_referencia: null,
          notas: '', notas_internas: '', tracking_numero: null, tracking_courier: null, tracking_url: null,
          creado_en: f, actualizado_en: f, items: o.items,
        });
      });
    });
    Store.set('clientes', cls);
    Store.set('pedidos', peds.concat(nuevosPed));
    Store.set('clientes_seq', cseq);
    Store.set('pedidos_seq', pseq);
    Store.set('clientes_demo_seed', 1);
  }

  Handlers['clientes/admin-listar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin', 'admin'].includes(payload.rol)) return err('No autorizado', 403);
    seedClientesDemo();
    const cls = Store.get('clientes', []);
    const peds = Store.get('pedidos', []);
    const rows = cls.map(c => {
      const suyos = peds.filter(p => p.cliente_id === c.id || (p.email && c.email && p.email.toLowerCase() === c.email.toLowerCase()));
      const gasto = suyos.filter(p => p.estado !== 'cancelado').reduce((sx, p) => sx + Number(p.total || 0), 0);
      const ultimo = suyos.reduce((m, p) => (!m || new Date(p.creado_en) > new Date(m)) ? p.creado_en : m, null);
      const { password_hash, ...pub } = c;
      return { ...pub, num_pedidos: suyos.length, total_gastado: +gasto.toFixed(2), ultimo_pedido: ultimo };
    });
    rows.sort((a, b) => new Date(b.ultimo_pedido || 0) - new Date(a.ultimo_pedido || 0));
    return ok(rows);
  };

  Handlers['clientes/admin-detalle.php'] = (req, body, payload) => {
    if (!payload || !['superadmin', 'admin'].includes(payload.rol)) return err('No autorizado', 403);
    const id = +new URL(req.url).searchParams.get('id') || 0;
    const cls = Store.get('clientes', []);
    const c = cls.find(x => x.id === id);
    if (!c) return err('Cliente no encontrado', 404);
    const suyos = Store.get('pedidos', [])
      .filter(p => p.cliente_id === id || (p.email && c.email && p.email.toLowerCase() === c.email.toLowerCase()))
      .slice().sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    const total = suyos.filter(p => p.estado !== 'cancelado').reduce((sx, p) => sx + Number(p.total || 0), 0);
    const { password_hash, ...pub } = c;
    return ok({ cliente: pub, pedidos: suyos, resumen: { num_pedidos: suyos.length, total_gastado: +total.toFixed(2) } });
  };

  Handlers['pedidos/listar.php'] = (req, body, payload) => {
    if (!payload) return err('Token requerido', 401);
    let peds = Store.get('pedidos', []);
    if (payload.rol === 'cliente') peds = peds.filter(p => p.cliente_id === payload.sub);
    peds = peds.slice().sort((a,b) => new Date(b.creado_en) - new Date(a.creado_en));
    return ok(peds);
  };
  Handlers['pedidos/detalle.php'] = (req, body, payload) => {
    if (!payload) return err('Token requerido', 401);
    const url = new URL(req.url);
    const id = +url.searchParams.get('id') || 0;
    const codigo = url.searchParams.get('codigo');
    const peds = Store.get('pedidos', []);
    const p = id ? peds.find(x => x.id === id) : peds.find(x => x.codigo === codigo);
    if (!p) return err('Pedido no encontrado', 404);
    if (payload.rol === 'cliente' && p.cliente_id !== payload.sub) return err('No autorizado', 403);
    return ok({ pedido: p, items: p.items || [] });
  };
  Handlers['pedidos/crear.php'] = (req, body, payload) => {
    const must = requireFields(body, ['nombre','email','telefono','cedula','direccion','ciudad','provincia','items','metodo_pago','tipo_envio']);
    if (must) return must;
    if (!Array.isArray(body.items) || body.items.length === 0) return err('Carrito vacío', 400);
    if (!vEmail(body.email)) return err('Email inválido', 400);

    const cfg = Store.get('config', {});
    const ivaR = +cfg.iva || 0.15;
    const envGratis = +cfg.envio_gratis_desde || 200;
    const cEnv = +cfg.costo_envio || 8;
    const cEnvE = +cfg.costo_envio_express || 18;

    const prods = Store.get('productos', []);
    let sub = 0;
    const itemsV = [];
    for (const it of body.items) {
      const pr = prods.find(x => x.id === it.id);
      if (!pr) return err('Producto no encontrado: ' + it.id, 400);
      const cant = Math.max(1, +it.cantidad || 1);
      if (pr.stock < cant) return err(`Stock insuficiente para ${pr.nombre}`, 409);
      const subIt = +(pr.precio * cant).toFixed(2);
      sub += subIt;
      itemsV.push({
        producto_id: pr.id, nombre: pr.nombre, precio_unitario: pr.precio,
        cantidad: cant, subtotal: subIt, imagen: pr.imagen_url || pr.imagen,
      });
    }
    const env = body.tipo_envio === 'express' ? cEnvE : (sub >= envGratis ? 0 : cEnv);
    const iva = +(sub * ivaR).toFixed(2);
    const total = +(sub + iva + env).toFixed(2);
    const codigo = 'SNEL-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.random().toString(36).slice(2,7).toUpperCase();

    // Restar stock
    body.items.forEach(it => {
      const pr = prods.find(x => x.id === it.id);
      if (pr) pr.stock = Math.max(0, pr.stock - (+it.cantidad || 1));
    });
    Store.set('productos', prods);

    const peds = Store.get('pedidos', []);
    const ped = {
      id: nextId('pedidos_seq'), codigo,
      cliente_id: (payload && payload.rol === 'cliente') ? payload.sub : null,
      nombre: body.nombre, email: body.email.toLowerCase(),
      telefono: body.telefono, cedula: body.cedula,
      direccion: body.direccion, ciudad: body.ciudad, provincia: body.provincia,
      referencia: body.referencia || '',
      subtotal: sub, iva, costo_envio: env, total,
      tipo_envio: body.tipo_envio, metodo_pago: body.metodo_pago,
      estado: 'pendiente', pago_referencia: null, notas: body.notas || '',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
      items: itemsV,
    };
    peds.unshift(ped);
    Store.set('pedidos', peds);
    return ok({
      pedido: { id: ped.id, codigo, total, estado: 'pendiente' },
      pagoRedirect: null,
    }, 201);
  };
  Handlers['pedidos/cambiar-estado.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('Solo staff', 403);
    const peds = Store.get('pedidos', []);
    const p = peds.find(x => x.id === +body.id);
    if (!p) return err('No encontrado', 404);
    p.estado = body.estado;
    p.actualizado_en = new Date().toISOString();
    Store.set('pedidos', peds);
    return ok({ actualizado: true });
  };
  // Endpoint general para actualizar varios campos de un pedido (admin)
  Handlers['pedidos/actualizar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('Solo staff', 403);
    if (!body.id) return err('Falta id', 400);
    const peds = Store.get('pedidos', []);
    const p = peds.find(x => x.id === +body.id);
    if (!p) return err('No encontrado', 404);
    if (body.estado !== undefined) {
      const ev = ['pendiente','pagado','enviado','entregado','cancelado'];
      if (!ev.includes(body.estado)) return err('Estado inválido', 400);
      p.estado = body.estado;
    }
    if (body.trackingNumero !== undefined) p.tracking_numero = body.trackingNumero || null;
    if (body.trackingCourier !== undefined) p.tracking_courier = body.trackingCourier || null;
    if (body.trackingUrl !== undefined) p.tracking_url = body.trackingUrl || null;
    if (body.notasInternas !== undefined) p.notas_internas = body.notasInternas || null;
    p.actualizado_en = new Date().toISOString();
    Store.set('pedidos', peds);
    return ok({ actualizado: true, id: p.id });
  };
  Handlers['pedidos/cancelar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('Solo cliente', 403);
    const peds = Store.get('pedidos', []);
    const p = peds.find(x => x.id === +body.id && x.cliente_id === payload.sub);
    if (!p) return err('Pedido no encontrado', 404);
    if (p.estado !== 'pendiente') return err(`No puedes cancelar un pedido en estado '${p.estado}'. Contacta soporte.`, 409);
    p.estado = 'cancelado';
    Store.set('pedidos', peds);
    return ok({ id: p.id, codigo: p.codigo, estado: 'cancelado', mensaje: 'Pedido cancelado' });
  };

  // El cliente solicita la factura electrónica de un pedido suyo.
  //  - Solo pedidos facturables (pagado/enviado/entregado).
  //  - Guarda los datos fiscales en el pedido y marca factura_estado='solicitada'.
  //  - En demo, si la config SRI está completa, EMITE de inmediato (simula que
  //    el empresa procesó la solicitud) y deja factura_estado='emitida'.
  //  - Si SRI no está configurado, queda 'solicitada' (el staff la emite luego).
  Handlers['pedidos/solicitar-factura.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'cliente') return err('Solo cliente', 403);
    const peds = Store.get('pedidos', []);
    const p = peds.find(x => x.id === +body.id && x.cliente_id === payload.sub);
    if (!p) return err('Pedido no encontrado', 404);

    const facturables = ['pagado', 'enviado', 'entregado'];
    if (!facturables.includes(p.estado)) {
      return err('Solo puedes solicitar factura de pedidos ya pagados. Este pedido está en estado «' + p.estado + '».', 409);
    }
    if (p.factura_estado === 'emitida') return err('Este pedido ya tiene una factura emitida.', 409);
    if (p.factura_estado === 'solicitada') return err('Ya solicitaste la factura de este pedido. Está en proceso.', 409);

    // Validar datos del comprador (Tabla SRI: 04 RUC, 05 cédula, 06 pasaporte, 07 consumidor final)
    const c = body.comprador || {};
    const tipo = c.tipo_id || '07';
    if (!['04', '05', '06', '07'].includes(tipo)) return err('Tipo de identificación inválido', 400);
    let idNum = String(c.id || '').trim();
    if (tipo === '07') {
      idNum = '9999999999999';
    } else {
      if (tipo === '05' && !/^\d{10}$/.test(idNum)) return err('La cédula debe tener 10 dígitos', 400);
      if (tipo === '04' && !/^\d{13}$/.test(idNum)) return err('El RUC debe tener 13 dígitos', 400);
      if (tipo === '06' && idNum.length < 3)        return err('Número de pasaporte inválido', 400);
      if (!String(c.razon_social || '').trim())     return err('Ingresa la razón social o tus nombres completos', 400);
    }
    if (c.email && !vEmail(c.email)) return err('Email inválido', 400);

    const datosFact = {
      tipo_id: tipo,
      id: idNum,
      razon_social: tipo === '07' ? (String(c.razon_social || '').trim() || 'CONSUMIDOR FINAL') : String(c.razon_social).trim().slice(0, 300),
      direccion: c.direccion ? String(c.direccion).slice(0, 300) : (p.direccion || null),
      telefono: c.telefono ? String(c.telefono).slice(0, 50) : (p.telefono || null),
      email: c.email ? String(c.email).slice(0, 200) : (p.email || null),
    };

    p.datos_facturacion = datosFact;
    p.factura_estado = 'solicitada';
    p.factura_solicitada_en = new Date().toISOString();

    // Intentar emisión inmediata si SRI está configurado (en demo simula autorización)
    const cfg = _getSriConfig();
    if (cfg.ruc && cfg.razon_social) {
      try {
        const ivaPct = 15;
        const items = (p.items || []).map((it, i) => {
          // Los precios del pedido vienen CON IVA (gotcha E). El número
          // autoritativo es el bruto (lo que el cliente pagó): derivamos la
          // base y calculamos el IVA como residuo para no descuadrar centavos.
          const cant = Number(it.cantidad) || 1;
          const brutoLinea = +(Number(it.precio_unitario) * cant).toFixed(2);
          const totalLinea = +(brutoLinea / (1 + ivaPct / 100)).toFixed(2);
          const valorIva   = +(brutoLinea - totalLinea).toFixed(2);
          const puSinIva   = +(totalLinea / cant).toFixed(6);
          return {
            id: i + 1,
            producto_id: it.producto_id || null,
            codigo_principal: String(it.producto_id || ('SKU-' + (i + 1))).slice(0, 50),
            codigo_auxiliar: null,
            descripcion: String(it.nombre || '').slice(0, 300),
            cantidad: cant,
            precio_unitario: puSinIva,
            descuento: 0,
            precio_total_sin_impuesto: totalLinea,
            impuesto_codigo: '2',
            iva_codigo_porcentaje: '4',
            iva_tarifa: ivaPct,
            iva_base: totalLinea,
            iva_valor: valorIva,
            orden: i,
          };
        });
        const subtotal15 = +items.reduce((s, it) => s + it.precio_total_sin_impuesto, 0).toFixed(2);
        const totalIva   = +items.reduce((s, it) => s + it.iva_valor, 0).toFixed(2);
        const valorTotal = +(subtotal15 + totalIva).toFixed(2);

        const secKey = `sri_sec_${cfg.establecimiento}_${cfg.punto_emision}_01`;
        const secuencial = Store.get(secKey, 1);
        Store.set(secKey, secuencial + 1);
        const fechaHoy = new Date().toISOString().slice(0, 10);
        const claveAcceso = _claveAcceso({
          fechaISO: fechaHoy, tipoDoc: '01', ruc: cfg.ruc, ambiente: cfg.ambiente,
          estab: cfg.establecimiento, ptoEmi: cfg.punto_emision, secuencial, tipoEmision: cfg.tipo_emision,
        });
        const numeroCompleto = `${cfg.establecimiento}-${cfg.punto_emision}-${String(secuencial).padStart(9, '0')}`;
        const facturaId = 'fac-' + Math.random().toString(36).slice(2, 10);
        const factura = {
          id: facturaId,
          pedido_id: p.id,
          clave_acceso: claveAcceso,
          numero_autorizacion: claveAcceso,
          estab: cfg.establecimiento, pto_emi: cfg.punto_emision, secuencial,
          numero_completo: numeroCompleto, tipo_doc: '01',
          ambiente: cfg.ambiente, tipo_emision: cfg.tipo_emision, fecha_emision: fechaHoy,
          comprador_tipo_id: datosFact.tipo_id,
          comprador_id: datosFact.id,
          comprador_razon: datosFact.razon_social,
          comprador_direccion: datosFact.direccion,
          comprador_telefono: datosFact.telefono,
          comprador_email: datosFact.email,
          subtotal_sin_iva: subtotal15, subtotal_0: 0, subtotal_15: subtotal15,
          total_descuento: 0, total_iva: totalIva, propina: 0, valor_total: valorTotal,
          forma_pago: '01', estado_sri: 'autorizado',
          fecha_autorizacion: new Date().toISOString().replace('T', ' ').slice(0, 19),
          mensaje_sri: '[DEMO] Factura solicitada por el cliente y autorizada en modo simulado.',
          emitida_por: null, creado_en: new Date().toISOString(),
          _items: items,
        };
        const facturas = Store.get('facturas', []);
        facturas.unshift(factura);
        Store.set('facturas', facturas);

        p.factura_estado = 'emitida';
        p.factura_id = facturaId;
        Store.set('pedidos', peds);
        return ok({
          estado: 'emitida',
          factura_id: facturaId,
          numero_completo: numeroCompleto,
          mensaje: 'Tu factura fue emitida. Ya está disponible en «Mis facturas».',
        });
      } catch (e) {
        // Si algo falla, dejamos la solicitud registrada para procesar manualmente
      }
    }

    Store.set('pedidos', peds);
    return ok({
      estado: 'solicitada',
      mensaje: 'Solicitud de factura registrada. Te avisaremos cuando esté lista.',
    });
  };

  /* ---------- IMÁGENES ---------- */
  Handlers['imagenes/subir.php'] = async (req, body, payload, fd) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const file = fd && fd.get('foto');
    if (!file) return err('Archivo requerido', 400);
    if (!file.type || !file.type.startsWith('image/')) return err('El archivo no es una imagen', 400);
    if (file.size > 10 * 1024 * 1024) return err('Imagen muy grande (máx 10MB)', 400);
    // Leer como DataURL para "subir" en demo (queda persistido en localStorage del producto)
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('No se pudo leer el archivo'));
      r.readAsDataURL(file);
    });
    // Devolver imagenUrl (mismo shape que el backend PHP real)
    return ok({ imagenUrl: dataUrl, nombre: file.name });
  };

  /* ---------- LEADS (cotizaciones + visitas técnicas) ---------- */
  // Endpoint público (sin auth): crea un lead desde la landing
  Handlers['leads/crear.php'] = (req, body, payload) => {
    if (!body || typeof body !== 'object') return err('Datos inválidos', 400);
    if (!body.tipo || !['cotizacion','visita'].includes(body.tipo)) return err('Tipo inválido', 400);
    if (!body.nombre || !body.telefono) return err('Faltan campos obligatorios', 400);
    const leads = Store.get('leads', []);
    const lead = {
      id: 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tipo: body.tipo,
      nombre: String(body.nombre).slice(0, 200),
      telefono: String(body.telefono).slice(0, 50),
      email: body.email ? String(body.email).slice(0, 200) : null,
      // Campos específicos según tipo
      inmueble: body.inmueble || null,
      provincia: body.provincia || null,
      ciudad: body.ciudad || null,
      servicios: Array.isArray(body.servicios) ? body.servicios : [],
      motivo: body.motivo || null,
      direccion: body.direccion || null,
      fecha: body.fecha || null,
      franja: body.franja || null,
      mensaje: body.mensaje ? String(body.mensaje).slice(0, 2000) : '',
      estado: 'nuevo',
      creado_en: new Date().toISOString(),
    };
    leads.unshift(lead);
    Store.set('leads', leads);
    return ok({ id: lead.id, mensaje: 'Lead registrado' });
  };
  // Endpoint admin: listar leads (para futura bandeja en admin panel)
  Handlers['leads/listar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('No autorizado', 403);
    const leads = Store.get('leads', []);
    return ok(leads);
  };
  // Endpoint admin: actualizar estado / añadir nota interna
  Handlers['leads/actualizar.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('No autorizado', 403);
    const leads = Store.get('leads', []);
    const lead = leads.find(l => l.id === body.id);
    if (!lead) return err('Lead no encontrado', 404);
    if (body.estado) lead.estado = body.estado;
    if (body.nota_interna !== undefined) lead.nota_interna = body.nota_interna;
    Store.set('leads', leads);
    return ok({ id: lead.id, mensaje: 'Actualizado' });
  };

  /* ---------- PAGOS (stub) ---------- */
  Handlers['pagos/payphone-iniciar.php'] = () => ok({ pagoRedirect: 'https://payphone.example.com/demo-checkout' });
  Handlers['pagos/payphone-callback.php'] = () => ok({ recibido: true });

  /* ============================================================
     FACTURAS ELECTRÓNICAS SRI (demo)
     ============================================================
     - sri/configuracion.php : config persistida en Store
     - facturas/crear.php    : genera clave acceso real + factura "autorizada"
     - facturas/listar.php   : lista con filtros
     - facturas/detalle.php  : factura + items
     - facturas/anular.php   : marca como anulada
     - facturas/descargar-xml.php y ride.php se sirven directo desde el
       backend PHP en producción; en demo se construyen on the fly.
     ============================================================ */

  // --- Algoritmo de módulo 11 para clave de acceso SRI (idéntico al PHP) ---
  function _modulo11(num) {
    const factores = [2, 3, 4, 5, 6, 7];
    let suma = 0, j = 0;
    for (let i = num.length - 1; i >= 0; i--, j++) {
      suma += parseInt(num[i], 10) * factores[j % 6];
    }
    const r = suma % 11;
    if (r === 0) return '0';
    if (r === 1) return '1';
    return String(11 - r);
  }
  function _claveAcceso({ fechaISO, tipoDoc, ruc, ambiente, estab, ptoEmi, secuencial, tipoEmision = '1' }) {
    const [y, m, d] = fechaISO.split('-');
    const fecha = d + m + y;
    const sec = String(secuencial).padStart(9, '0');
    const cod = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const base = fecha + tipoDoc + ruc + ambiente + estab + ptoEmi + sec + cod + tipoEmision;
    return base + _modulo11(base);
  }

  // Config SRI por defecto en demo (campos vacíos para que el usuario los configure)
  function _getSriConfig() {
    return Store.get('sri_config', {
      id: 1,
      ruc: '',
      razon_social: '',
      nombre_comercial: SNEL_CONFIG?.empresa || 'Snel Seguridad',
      direccion_matriz: '',
      obligado_contabilidad: 'NO',
      contribuyente_especial: null,
      regimen: 'GENERAL',
      establecimiento: '001',
      punto_emision: '001',
      direccion_establecimiento: '',
      ambiente: '1',
      tipo_emision: '1',
      certificado_path: null,
      certificado_vence: null,
      pse_proveedor: null,
      pse_credenciales: null,
    });
  }

  Handlers['sri/configuracion.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    if (req.method === 'POST') {
      if (payload.rol !== 'superadmin') return err('Solo superadmin puede modificar', 403);
      const actual = _getSriConfig();
      const nueva = { ...actual, ...(body || {}) };
      // Validaciones mínimas
      if (nueva.ruc && !/^\d{13}$/.test(nueva.ruc)) return err('RUC debe tener 13 dígitos', 400);
      if (nueva.ambiente && !['1','2'].includes(nueva.ambiente)) return err('ambiente inválido', 400);
      Store.set('sri_config', nueva);
      return ok(nueva);
    }
    return ok(_getSriConfig());
  };

  Handlers['facturas/crear.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin','vendedor'].includes(payload.rol)) return err('No autorizado', 403);
    if (!body || !body.comprador || !Array.isArray(body.items) || body.items.length === 0) {
      return err('Faltan comprador o items', 400);
    }
    const cfg = _getSriConfig();
    if (!cfg.ruc || !cfg.razon_social) {
      return err('Configuración SRI incompleta. Configura RUC y Razón Social desde "Configuración SRI" primero.', 412);
    }

    // Reservar secuencial
    const secKey = `sri_sec_${cfg.establecimiento}_${cfg.punto_emision}_01`;
    const secuencial = Store.get(secKey, 1);
    Store.set(secKey, secuencial + 1);

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const claveAcceso = _claveAcceso({
      fechaISO: fechaHoy,
      tipoDoc: '01',
      ruc: cfg.ruc,
      ambiente: cfg.ambiente,
      estab: cfg.establecimiento,
      ptoEmi: cfg.punto_emision,
      secuencial,
      tipoEmision: cfg.tipo_emision,
    });

    // Calcular totales
    let subtotal0 = 0, subtotal15 = 0, totalDesc = 0, totalIva = 0;
    const items = body.items.map((it, i) => {
      const cant = parseFloat(it.cantidad) || 0;
      const pu   = parseFloat(it.precio_unitario) || 0;
      const desc = parseFloat(it.descuento) || 0;
      const ivaPct = it.iva_porcentaje !== undefined ? parseFloat(it.iva_porcentaje) : 15;
      const totalLinea = +(cant * pu - desc).toFixed(2);
      const valorIva = +(totalLinea * (ivaPct / 100)).toFixed(2);
      const codigoPorcentaje = ivaPct === 0 ? '0' : ivaPct === 15 ? '4' : ivaPct === 12 ? '2' : '4';
      if (ivaPct === 0) subtotal0 += totalLinea;
      else subtotal15 += totalLinea;
      totalDesc += desc;
      totalIva += valorIva;
      return {
        id: i + 1,
        producto_id: it.producto_id || null,
        codigo_principal: String(it.codigo_principal || `SKU-${i+1}`).slice(0, 50),
        codigo_auxiliar: it.codigo_auxiliar || null,
        descripcion: String(it.descripcion || '').slice(0, 300),
        cantidad: cant,
        precio_unitario: pu,
        descuento: desc,
        precio_total_sin_impuesto: totalLinea,
        impuesto_codigo: '2',
        iva_codigo_porcentaje: codigoPorcentaje,
        iva_tarifa: ivaPct,
        iva_base: totalLinea,
        iva_valor: valorIva,
        orden: i,
      };
    });

    const subtotalSinIva = +(subtotal0 + subtotal15).toFixed(2);
    const valorTotal = +(subtotalSinIva + totalIva).toFixed(2);

    const numeroCompleto = `${cfg.establecimiento}-${cfg.punto_emision}-${String(secuencial).padStart(9, '0')}`;
    const comp = body.comprador || {};
    const facturaId = 'fac-' + Math.random().toString(36).slice(2, 10);

    const factura = {
      id: facturaId,
      pedido_id: body.pedido_id || null,
      clave_acceso: claveAcceso,
      numero_autorizacion: claveAcceso, // En esquema online son iguales
      estab: cfg.establecimiento,
      pto_emi: cfg.punto_emision,
      secuencial,
      numero_completo: numeroCompleto,
      tipo_doc: '01',
      ambiente: cfg.ambiente,
      tipo_emision: cfg.tipo_emision,
      fecha_emision: fechaHoy,
      comprador_tipo_id: comp.tipo_id || '07',
      comprador_id: (comp.tipo_id === '07') ? '9999999999999' : (comp.id || '9999999999999'),
      comprador_razon: String(comp.razon_social || 'CONSUMIDOR FINAL').slice(0, 300),
      comprador_direccion: comp.direccion || null,
      comprador_telefono: comp.telefono || null,
      comprador_email: comp.email || null,
      subtotal_sin_iva: subtotalSinIva,
      subtotal_0: +subtotal0.toFixed(2),
      subtotal_15: +subtotal15.toFixed(2),
      total_descuento: +totalDesc.toFixed(2),
      total_iva: +totalIva.toFixed(2),
      propina: 0,
      valor_total: valorTotal,
      forma_pago: body.forma_pago || '01',
      estado_sri: 'autorizado',  // En demo (ambiente 1) simulamos autorización inmediata
      fecha_autorizacion: new Date().toISOString().replace('T', ' ').slice(0, 19),
      mensaje_sri: '[DEMO] Autorizado en modo simulado. Para emisión real, configurar certificado o PSE.',
      emitida_por: payload.id || null,
      creado_en: new Date().toISOString(),
      _items: items,
    };

    const facturas = Store.get('facturas', []);
    facturas.unshift(factura);
    Store.set('facturas', facturas);

    // Si la factura proviene de un pedido, marcarlo como facturado
    if (factura.pedido_id != null) {
      const peds = Store.get('pedidos', []);
      const ped = peds.find(x => x.id === factura.pedido_id);
      if (ped) {
        ped.factura_estado = 'emitida';
        ped.factura_id = facturaId;
        Store.set('pedidos', peds);
      }
    }

    return ok({
      id: facturaId,
      numero_completo: numeroCompleto,
      clave_acceso: claveAcceso,
      estado_sri: 'autorizado',
      numero_autorizacion: claveAcceso,
      fecha_autorizacion: factura.fecha_autorizacion,
      valor_total: valorTotal,
      mensaje: factura.mensaje_sri,
    });
  };

  Handlers['facturas/listar.php'] = (req, body, payload) => {
    if (!payload) return err('No autorizado', 401);
    let facturas = Store.get('facturas', []);
    // Si es cliente, filtrar solo las suyas: las que provienen de un pedido suyo
    // o cuyo comprador coincide con su identificación.
    if (!['superadmin','admin','vendedor'].includes(payload.rol)) {
      const misPedidos = new Set(
        Store.get('pedidos', []).filter(p => p.cliente_id === payload.sub).map(p => p.id)
      );
      facturas = facturas.filter(f =>
        (f.pedido_id != null && misPedidos.has(f.pedido_id)) ||
        (payload.identificacion && f.comprador_id === payload.identificacion)
      );
    }
    const qs = req.queryParams || {};
    if (qs.estado)    facturas = facturas.filter(f => f.estado_sri === qs.estado);
    if (qs.desde)     facturas = facturas.filter(f => f.fecha_emision >= qs.desde);
    if (qs.hasta)     facturas = facturas.filter(f => f.fecha_emision <= qs.hasta);
    if (qs.comprador) facturas = facturas.filter(f => f.comprador_id === qs.comprador);
    if (qs.pedido_id) facturas = facturas.filter(f => f.pedido_id === qs.pedido_id);
    // Quitar campo interno `_items` del listado
    return ok(facturas.map(f => { const { _items, ...rest } = f; return rest; }));
  };

  Handlers['facturas/detalle.php'] = (req, body, payload) => {
    if (!payload) return err('No autorizado', 401);
    const qs = req.queryParams || {};
    const facturas = Store.get('facturas', []);
    const f = qs.id ? facturas.find(x => x.id === qs.id)
                    : facturas.find(x => x.clave_acceso === qs.clave_acceso);
    if (!f) return err('Factura no encontrada', 404);
    if (!['superadmin','admin','vendedor'].includes(payload.rol)) {
      const esSuPedido = f.pedido_id != null &&
        Store.get('pedidos', []).some(p => p.id === f.pedido_id && p.cliente_id === payload.sub);
      const esSuId = payload.identificacion && f.comprador_id === payload.identificacion;
      if (!esSuPedido && !esSuId) return err('No autorizado', 403);
    }
    const { _items, ...factura } = f;
    return ok({ factura, items: _items || [] });
  };

  Handlers['facturas/anular.php'] = (req, body, payload) => {
    if (!payload || !['superadmin','admin'].includes(payload.rol)) return err('No autorizado', 403);
    const facturas = Store.get('facturas', []);
    const f = facturas.find(x => x.id === body.id);
    if (!f) return err('Factura no encontrada', 404);
    if (f.estado_sri === 'autorizado') {
      return err('Esta factura ya fue autorizada por el SRI. En producción debe emitirse una NOTA DE CRÉDITO. (En demo te permito anular para pruebas.)', 409);
    }
    f.estado_sri = 'anulado';
    f.mensaje_sri = body.motivo || 'Anulada manualmente';
    Store.set('facturas', facturas);
    return ok({ id: f.id, estado: 'anulado' });
  };

  /* ============================================================
     RENDERIZADO DE RIDE (HTML imprimible) Y XML EN DEMO
     ============================================================
     En producción los archivos /api/endpoints/facturas/ride.php y
     descargar-xml.php los sirve PHP. En demo no hay PHP, así que
     exponemos helpers globales que generan el contenido on-the-fly
     y lo abren en una pestaña nueva (blob URL).

     Estos helpers se llaman desde admin.js y cuenta.js (vía
     SnelFacturasUI.verRide / descargarXml).
     ============================================================ */

  function _esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  function _num(v, dec = 2) {
    const n = Number(v) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function _fechaDMY(iso) {
    if (!iso) return '—';
    const s = String(iso);
    if (s.includes('-')) {
      const [y, m, d] = s.slice(0, 10).split('-');
      const rest = s.length > 10 ? s.slice(10) : '';
      return `${d}/${m}/${y}${rest}`;
    }
    return s;
  }

  function _construirRideHtml(cfg, f, items) {
    const clave = f.clave_acceso || '';
    const autoriz = f.numero_autorizacion || clave;
    const fechaEm = _fechaDMY(f.fecha_emision);
    const fechaAut = _fechaDMY(f.fecha_autorizacion || '');
    const urlSri = `https://srienlinea.sri.gob.ec/sri-en-linea/SriPagosWeb/ConsultaComprobantesElectronicos/Consultas/ConsultaComprobante?numeroAcceso=${clave}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(urlSri)}`;

    let regimenLeyenda = '';
    if (cfg.regimen === 'RIMPE_NEGOCIO_POPULAR') regimenLeyenda = '<p class="rimpe">Contribuyente Régimen RIMPE - Negocio Popular</p>';
    else if (cfg.regimen === 'RIMPE_EMPRENDEDOR') regimenLeyenda = '<p class="rimpe">Contribuyente Régimen RIMPE - Emprendedor</p>';

    const contribEspecial = cfg.contribuyente_especial
      ? `<p><strong>Contribuyente Especial Nº:</strong> ${_esc(cfg.contribuyente_especial)}</p>` : '';

    const ambienteLeyenda = String(f.ambiente) === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';

    const itemsHtml = (items || []).map(it => `
      <tr>
        <td>${_esc(it.codigo_principal)}</td>
        <td>${_num(it.cantidad, 2)}</td>
        <td>${_esc(it.descripcion)}</td>
        <td class="r">${_num(it.precio_unitario)}</td>
        <td class="r">${_num(it.descuento)}</td>
        <td class="r">${_num(it.precio_total_sin_impuesto)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>RIDE Factura ${_esc(f.numero_completo)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 11px; color: #111; margin: 0; background: #f3f4f6; }
  .doc { max-width: 780px; margin: 20px auto; background: #fff; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .head { display: table; width: 100%; border-collapse: collapse; }
  .head .left, .head .right { display: table-cell; vertical-align: top; border: 1px solid #444; padding: 12px; }
  .head .left { width: 55%; }
  .head .right { width: 45%; border-left: none; }
  .marca { font-size: 18px; font-weight: 800; color: #0F1419; margin: 0 0 4px; letter-spacing: -0.01em; }
  .small { font-size: 10px; color: #444; }
  .right h2 { font-size: 14px; margin: 0 0 6px; color: #0F1419; }
  .right p { margin: 3px 0; font-size: 11px; }
  .clave { font-family: 'Courier New', monospace; font-size: 9.5px; word-break: break-all; background: #f5f5f5; padding: 6px; border-radius: 3px; }
  .qr { text-align: center; margin-top: 8px; }
  .rimpe { background: #fef3c7; color: #92400e; padding: 4px 8px; font-weight: 600; border-radius: 3px; display: inline-block; margin: 6px 0; font-size: 10px; }
  .comprador { border: 1px solid #444; border-top: none; padding: 8px 12px; }
  .comprador h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .comprador-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 16px; font-size: 11px; }
  .comprador-grid div b { color: #555; font-weight: 600; }
  table.det { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.det th, table.det td { border: 1px solid #444; padding: 5px 6px; font-size: 10.5px; vertical-align: top; }
  table.det th { background: #0F1419; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; text-align: left; }
  table.det td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { display: table; width: 100%; margin-top: 10px; border-collapse: collapse; }
  .footer .info, .footer .totales { display: table-cell; vertical-align: top; border: 1px solid #444; padding: 10px 12px; }
  .footer .info { width: 60%; }
  .footer .totales { width: 40%; border-left: none; }
  .footer .info h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #555; }
  .footer table.tot { width: 100%; font-size: 11px; }
  .footer table.tot td { padding: 3px 0; }
  .footer table.tot td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .footer table.tot tr.fin td { border-top: 2px solid #444; padding-top: 6px; font-weight: 700; font-size: 13px; }
  .firma-leyenda { text-align: center; margin-top: 14px; padding: 10px; border: 1px solid #444; font-size: 10px; color: #555; }
  .acciones-no-print { text-align: center; margin: 20px 0; }
  .acciones-no-print button { padding: 10px 22px; background: #00D4FF; color: #0F1419; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; margin: 0 4px; }
  .acciones-no-print .demo-badge { background: #fbbf24; color: #92400e; }
  @media print { .acciones-no-print { display: none; } body { background: #fff; } .doc { box-shadow: none; padding: 0; margin: 0; } }
</style>
</head>
<body>
<div class="acciones-no-print">
  <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <button class="demo-badge" onclick="window.close()">✕ Cerrar</button>
</div>
<div class="doc">
  <div class="head">
    <div class="left">
      <h1 class="marca">${_esc(cfg.nombre_comercial || cfg.razon_social)}</h1>
      <p><strong>Razón Social:</strong> ${_esc(cfg.razon_social)}</p>
      <p><strong>RUC:</strong> ${_esc(cfg.ruc)}</p>
      <p class="small"><strong>Dirección Matriz:</strong> ${_esc(cfg.direccion_matriz)}</p>
      <p class="small"><strong>Dirección Sucursal:</strong> ${_esc(cfg.direccion_establecimiento)}</p>
      <p class="small"><strong>Obligado a llevar contabilidad:</strong> ${_esc(cfg.obligado_contabilidad)}</p>
      ${contribEspecial}
      ${regimenLeyenda}
    </div>
    <div class="right">
      <h2>FACTURA</h2>
      <p><strong>N°:</strong> ${_esc(f.numero_completo)}</p>
      <p><strong>Número de autorización:</strong></p>
      <p class="clave">${_esc(autoriz)}</p>
      <p><strong>Fecha y hora autorización:</strong> ${_esc(fechaAut)}</p>
      <p><strong>Ambiente:</strong> ${ambienteLeyenda}</p>
      <p><strong>Emisión:</strong> Normal</p>
      <p><strong>Clave de Acceso:</strong></p>
      <p class="clave">${_esc(clave)}</p>
      <div class="qr"><img src="${_esc(qrUrl)}" alt="QR consulta SRI" width="140" height="140"></div>
    </div>
  </div>
  <div class="comprador">
    <h3>Datos del comprador</h3>
    <div class="comprador-grid">
      <div><b>Razón social / Nombres:</b> ${_esc(f.comprador_razon)}</div>
      <div><b>Identificación:</b> ${_esc(f.comprador_id)}</div>
      <div><b>Fecha de emisión:</b> ${_esc(fechaEm)}</div>
      <div><b>Dirección:</b> ${_esc(f.comprador_direccion || '—')}</div>
      <div><b>Teléfono:</b> ${_esc(f.comprador_telefono || '—')}</div>
      <div><b>Correo:</b> ${_esc(f.comprador_email || '—')}</div>
    </div>
  </div>
  <table class="det">
    <thead>
      <tr>
        <th style="width:12%;">Código</th>
        <th style="width:8%;">Cant.</th>
        <th>Descripción</th>
        <th style="width:13%;" class="r">P. Unitario</th>
        <th style="width:10%;" class="r">Descuento</th>
        <th style="width:13%;" class="r">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="footer">
    <div class="info">
      <h4>Información adicional</h4>
      <p><b>Correo:</b> ${_esc(f.comprador_email || '—')}</p>
      <p><b>Teléfono:</b> ${_esc(f.comprador_telefono || '—')}</p>
      ${f.pedido_id ? `<p><b>Pedido relacionado:</b> ${_esc(f.pedido_id)}</p>` : ''}
      <p style="margin-top:14px; font-size:9.5px; color:#666;">
        Verifique este comprobante en:<br>
        <a href="${_esc(urlSri)}" target="_blank" rel="noopener">${_esc(urlSri)}</a>
      </p>
    </div>
    <div class="totales">
      <table class="tot">
        <tr><td>SUBTOTAL 15%</td><td class="r">$ ${_num(f.subtotal_15)}</td></tr>
        <tr><td>SUBTOTAL 0%</td><td class="r">$ ${_num(f.subtotal_0)}</td></tr>
        <tr><td>SUBTOTAL SIN IMPUESTOS</td><td class="r">$ ${_num(f.subtotal_sin_iva)}</td></tr>
        <tr><td>TOTAL DESCUENTO</td><td class="r">$ ${_num(f.total_descuento)}</td></tr>
        <tr><td>IVA 15%</td><td class="r">$ ${_num(f.total_iva)}</td></tr>
        ${Number(f.propina) > 0 ? `<tr><td>PROPINA</td><td class="r">$ ${_num(f.propina)}</td></tr>` : ''}
        <tr class="fin"><td>VALOR TOTAL</td><td class="r">$ ${_num(f.valor_total)}</td></tr>
      </table>
    </div>
  </div>
  <div class="firma-leyenda">
    ${ambienteLeyenda === 'PRUEBAS' ? '⚠️ <strong>AMBIENTE DE PRUEBAS — NO TIENE VALIDEZ TRIBUTARIA</strong><br>' : ''}
    Este es un comprobante electrónico válido y firmado digitalmente. Su autenticidad
    puede verificarse en el portal del SRI ingresando la clave de acceso.<br>
    Conserve este documento durante <strong>7 años</strong> conforme a la normativa tributaria vigente.
  </div>
</div>
</body>
</html>`;
  }

  function _construirXml(cfg, f, items) {
    // XML simplificado (equivalente a sri_xml.php). Sin firma.
    const num = (v, dec = 2) => Number(v || 0).toFixed(dec);
    const esc = (v) => _esc(v);
    const fechaSRI = _fechaDMY(f.fecha_emision);

    let regimenXml = '';
    if (['RIMPE_NEGOCIO_POPULAR','RIMPE_EMPRENDEDOR'].includes(cfg.regimen)) {
      const leyenda = cfg.regimen === 'RIMPE_NEGOCIO_POPULAR'
        ? 'Contribuyente Régimen RIMPE - Negocio Popular'
        : 'Contribuyente Régimen RIMPE - Emprendedor';
      regimenXml = `    <agenteRetencion>NO</agenteRetencion>\n    <contribuyenteRimpe>${leyenda}</contribuyenteRimpe>\n`;
    }

    const totalImpuestosXml = [
      Number(f.subtotal_15) > 0 ? `      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${num(f.subtotal_15)}</baseImponible>
        <valor>${num(f.total_iva)}</valor>
      </totalImpuesto>` : '',
      Number(f.subtotal_0) > 0 ? `      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${num(f.subtotal_0)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>` : '',
    ].filter(Boolean).join('\n');

    const detallesXml = (items || []).map(it => `    <detalle>
      <codigoPrincipal>${esc(it.codigo_principal)}</codigoPrincipal>${it.codigo_auxiliar ? `\n      <codigoAuxiliar>${esc(it.codigo_auxiliar)}</codigoAuxiliar>` : ''}
      <descripcion>${esc(it.descripcion)}</descripcion>
      <cantidad>${num(it.cantidad, 6)}</cantidad>
      <precioUnitario>${num(it.precio_unitario, 6)}</precioUnitario>
      <descuento>${num(it.descuento)}</descuento>
      <precioTotalSinImpuesto>${num(it.precio_total_sin_impuesto)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${it.impuesto_codigo}</codigo>
          <codigoPorcentaje>${it.iva_codigo_porcentaje}</codigoPorcentaje>
          <tarifa>${num(it.iva_tarifa)}</tarifa>
          <baseImponible>${num(it.iva_base)}</baseImponible>
          <valor>${num(it.iva_valor)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`).join('\n');

    const infoAd = [
      f.comprador_email    ? `    <campoAdicional nombre="Email">${esc(f.comprador_email)}</campoAdicional>` : '',
      f.comprador_telefono ? `    <campoAdicional nombre="Telefono">${esc(f.comprador_telefono)}</campoAdicional>` : '',
      f.pedido_id          ? `    <campoAdicional nombre="Pedido">${esc(f.pedido_id)}</campoAdicional>` : '',
    ].filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${f.ambiente}</ambiente>
    <tipoEmision>${f.tipo_emision}</tipoEmision>
    <razonSocial>${esc(cfg.razon_social)}</razonSocial>
    <nombreComercial>${esc(cfg.nombre_comercial || cfg.razon_social)}</nombreComercial>
    <ruc>${cfg.ruc}</ruc>
    <claveAcceso>${f.clave_acceso}</claveAcceso>
    <codDoc>${f.tipo_doc}</codDoc>
    <estab>${f.estab}</estab>
    <ptoEmi>${f.pto_emi}</ptoEmi>
    <secuencial>${String(f.secuencial).padStart(9, '0')}</secuencial>
    <dirMatriz>${esc(cfg.direccion_matriz)}</dirMatriz>
${regimenXml}  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fechaSRI}</fechaEmision>
    <dirEstablecimiento>${esc(cfg.direccion_establecimiento)}</dirEstablecimiento>
${cfg.contribuyente_especial ? `    <contribuyenteEspecial>${esc(cfg.contribuyente_especial)}</contribuyenteEspecial>\n` : ''}    <obligadoContabilidad>${cfg.obligado_contabilidad}</obligadoContabilidad>
    <tipoIdentificacionComprador>${f.comprador_tipo_id}</tipoIdentificacionComprador>
    <razonSocialComprador>${esc(f.comprador_razon)}</razonSocialComprador>
    <identificacionComprador>${f.comprador_id}</identificacionComprador>
${f.comprador_direccion ? `    <direccionComprador>${esc(f.comprador_direccion)}</direccionComprador>\n` : ''}    <totalSinImpuestos>${num(f.subtotal_sin_iva)}</totalSinImpuestos>
    <totalDescuento>${num(f.total_descuento)}</totalDescuento>
    <totalConImpuestos>
${totalImpuestosXml}
    </totalConImpuestos>
    <propina>${num(f.propina)}</propina>
    <importeTotal>${num(f.valor_total)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${f.forma_pago}</formaPago>
        <total>${num(f.valor_total)}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
${detallesXml}
  </detalles>
${infoAd ? `  <infoAdicional>\n${infoAd}\n  </infoAdicional>\n` : ''}</factura>`;
  }

  // API global: abre el RIDE/XML en una pestaña nueva (modo demo).
  // En producción (sin demo), admin/cuenta.js usa Api.facturas.urlRide/urlXml
  // que apunta al PHP real.
  window.SnelDemoFacturas = {
    verRide(facturaId) {
      const f = Store.get('facturas', []).find(x => x.id === facturaId);
      if (!f) { alert('Factura no encontrada'); return; }
      const cfg = _getSriConfig();
      const html = _construirRideHtml(cfg, f, f._items || []);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Cleanup tras un rato
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    descargarXml(facturaId) {
      const f = Store.get('facturas', []).find(x => x.id === facturaId);
      if (!f) { alert('Factura no encontrada'); return; }
      const cfg = _getSriConfig();
      const xml = _construirXml(cfg, f, f._items || []);
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${f.clave_acceso}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };

  /* ============================================================
     DEMO · Contabilidad avanzada (Fase 1)
     Datos en memoria, marcados como referenciales/demo.
     ============================================================ */
  const DemoConta = {
    config: {
      obligado_contabilidad: 'NO', metodo_costo: 'promedio', asientos_automaticos: 1,
      cuenta_caja: '1.1.01', cuenta_bancos: '1.1.02', cuenta_cxc: '1.1.03',
      cuenta_cxp: '2.1.01', cuenta_ventas: '4.1.01', cuenta_iva_ventas: '2.1.02',
      cuenta_iva_compras: '1.1.05', cuenta_costo_ventas: '5.1.01',
    },
    tarifas: [
      { id: 1, impuesto: 'IVA',   codigo_sri: '721',  concepto: 'Retención IVA bienes 30% (referencial)',        porcentaje: 30,  fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
      { id: 2, impuesto: 'IVA',   codigo_sri: '723',  concepto: 'Retención IVA servicios 70% (referencial)',      porcentaje: 70,  fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
      { id: 3, impuesto: 'IVA',   codigo_sri: '725',  concepto: 'Retención IVA 100% (referencial)',               porcentaje: 100, fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
      { id: 4, impuesto: 'RENTA', codigo_sri: '312',  concepto: 'Renta bienes 1.75% (referencial)',               porcentaje: 1.75, fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
      { id: 5, impuesto: 'RENTA', codigo_sri: '3440', concepto: 'Renta servicios 2.75% (referencial)',            porcentaje: 2.75, fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
      { id: 6, impuesto: 'RENTA', codigo_sri: '303',  concepto: 'Renta honorarios profesionales 10% (referencial)', porcentaje: 10, fecha_inicio: '2024-01-01', fecha_fin: null, activo: 1, notas: 'Ejemplo — validar con SRI' },
    ],
    cuentas: [
      { codigo: '1',      nombre: 'ACTIVO',                        tipo: 'activo',     cuenta_padre: null, movimiento: 0, activa: 1 },
      { codigo: '1.1.01', nombre: 'Caja',                          tipo: 'activo',     cuenta_padre: '1',  movimiento: 1, activa: 1 },
      { codigo: '1.1.02', nombre: 'Bancos',                        tipo: 'activo',     cuenta_padre: '1',  movimiento: 1, activa: 1 },
      { codigo: '1.1.03', nombre: 'Cuentas por cobrar clientes',   tipo: 'activo',     cuenta_padre: '1',  movimiento: 1, activa: 1 },
      { codigo: '1.1.04', nombre: 'Inventario',                    tipo: 'activo',     cuenta_padre: '1',  movimiento: 1, activa: 1 },
      { codigo: '1.1.05', nombre: 'IVA crédito tributario',        tipo: 'activo',     cuenta_padre: '1',  movimiento: 1, activa: 1 },
      { codigo: '2',      nombre: 'PASIVO',                        tipo: 'pasivo',     cuenta_padre: null, movimiento: 0, activa: 1 },
      { codigo: '2.1.01', nombre: 'Cuentas por pagar proveedores', tipo: 'pasivo',     cuenta_padre: '2',  movimiento: 1, activa: 1 },
      { codigo: '2.1.02', nombre: 'IVA por pagar',                 tipo: 'pasivo',     cuenta_padre: '2',  movimiento: 1, activa: 1 },
      { codigo: '2.1.03', nombre: 'Retenciones por pagar',         tipo: 'pasivo',     cuenta_padre: '2',  movimiento: 1, activa: 1 },
      { codigo: '3',      nombre: 'PATRIMONIO',                    tipo: 'patrimonio', cuenta_padre: null, movimiento: 0, activa: 1 },
      { codigo: '3.1.01', nombre: 'Capital',                       tipo: 'patrimonio', cuenta_padre: '3',  movimiento: 1, activa: 1 },
      { codigo: '4',      nombre: 'INGRESOS',                      tipo: 'ingreso',    cuenta_padre: null, movimiento: 0, activa: 1 },
      { codigo: '4.1.01', nombre: 'Ventas de productos de seguridad', tipo: 'ingreso', cuenta_padre: '4', movimiento: 1, activa: 1 },
      { codigo: '4.1.02', nombre: 'Servicios de instalación',     tipo: 'ingreso',    cuenta_padre: '4',  movimiento: 1, activa: 1 },
      { codigo: '5',      nombre: 'COSTOS Y GASTOS',               tipo: 'gasto',      cuenta_padre: null, movimiento: 0, activa: 1 },
      { codigo: '5.1.01', nombre: 'Costo de ventas',               tipo: 'costo',      cuenta_padre: '5',  movimiento: 1, activa: 1 },
      { codigo: '5.2.01', nombre: 'Gastos administrativos',        tipo: 'gasto',      cuenta_padre: '5',  movimiento: 1, activa: 1 },
      { codigo: '5.2.02', nombre: 'Gastos de transporte',          tipo: 'gasto',      cuenta_padre: '5',  movimiento: 1, activa: 1 },
      { codigo: '5.2.03', nombre: 'Gastos bancarios',              tipo: 'gasto',      cuenta_padre: '5',  movimiento: 1, activa: 1 },
    ],
    _nextTarifaId: 7,
  };

  function contaSoloAdmin(payload) {
    return payload && ['superadmin', 'admin'].includes(payload.rol);
  }

  Handlers['contabilidad/dashboard.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    // Cifras demo (referenciales) para visualizar el tablero.
    return ok({
      periodo: (req.queryParams && req.queryParams.mes) || new Date().toISOString().slice(0, 7),
      tarjetas: {
        ventas_mes: 4820.50, ventas_gravadas: 4320.50, ventas_cero: 500.00,
        iva_cobrado: 648.08, iva_pagado_compras: 312.40,
        iva_por_pagar: 335.68, retenciones_recibidas: 86.40, retenciones_emitidas: 54.20,
        cuentas_por_cobrar: 1240.00, cuentas_por_pagar: 980.00,
        utilidad_bruta: 2150.00, facturas_pendientes_sri: 1, documentos_anulados: 0,
      },
      alertas: [
        { tipo: 'info', texto: 'Datos de demostración. Conecta la base de datos para cifras reales.' },
        { tipo: 'warn', texto: 'Hay 1 factura pendiente de autorización del SRI.' },
      ],
      _demo: true,
    });
  };

  /* ---- Libro de ventas (Fase 2): deriva de las facturas demo ---- */
  // Si todavía no hay facturas en el Store (sesión recién abierta), sembramos
  // unas cuantas realistas para que el libro de ventas se vea funcionando.
  function sembrarFacturasDemoSiVacio() {
    const existentes = Store.get('facturas', []);
    if (existentes.length) return existentes;
    const hoy = new Date();
    const ym = (d) => d.toISOString().slice(0, 10);
    const menos = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() - dias); return d; };
    const semilla = [
      { dias: 1,  sec: 105, razon: 'COMERCIAL ANDINA S.A.',      tid: '04', id: '1790012345001', b0: 0,      b15: 1250.00, fp: '20', estado: 'autorizado' },
      { dias: 3,  sec: 104, razon: 'CONSUMIDOR FINAL',           tid: '07', id: '9999999999999', b0: 0,      b15: 89.90,   fp: '01', estado: 'autorizado' },
      { dias: 8,  sec: 103, razon: 'PEREZ LOPEZ JUAN CARLOS',    tid: '05', id: '1712345678',    b0: 45.00,  b15: 320.00,  fp: '19', estado: 'autorizado' },
      { dias: 12, sec: 102, razon: 'SEGURIDAD TOTAL CIA LTDA',   tid: '04', id: '1791234567001', b0: 0,      b15: 2480.00, fp: '20', estado: 'autorizado' },
      { dias: 20, sec: 101, razon: 'CONSUMIDOR FINAL',           tid: '07', id: '9999999999999', b0: 120.00, b15: 0,       fp: '16', estado: 'autorizado' },
      { dias: 2,  sec: 106, razon: 'MENDOZA RUIZ ANA MARIA',     tid: '05', id: '1798765432',    b0: 0,      b15: 540.00,  fp: '19', estado: 'enviado' },
      { dias: 35, sec: 98,  razon: 'IMPORTADORA QUITO S.A.',     tid: '04', id: '1792223334001', b0: 0,      b15: 760.00,  fp: '20', estado: 'anulado' },
    ];
    const facturas = semilla.map((s, i) => {
      const iva = +(s.b15 * 0.15).toFixed(2);
      const total = +(s.b0 + s.b15 + iva).toFixed(2);
      const fecha = ym(menos(s.dias));
      const numero = '001-001-' + String(s.sec).padStart(9, '0');
      const clave = (fecha.replace(/-/g, '') + '01179000000010011001' + String(s.sec).padStart(9, '0') + '12345678' + '1').slice(0, 49).padEnd(49, '0');
      return {
        id: 'fac-demo-' + (i + 1),
        pedido_id: i % 2 === 0 ? ('ped-demo-' + (i + 1)) : null,
        clave_acceso: clave,
        numero_autorizacion: s.estado === 'autorizado' ? clave : null,
        estab: '001', pto_emi: '001', secuencial: s.sec,
        numero_completo: numero, tipo_doc: '01', ambiente: '1', tipo_emision: '1',
        fecha_emision: fecha,
        comprador_tipo_id: s.tid, comprador_id: s.id, comprador_razon: s.razon,
        comprador_direccion: null, comprador_telefono: null, comprador_email: null,
        subtotal_sin_iva: +(s.b0 + s.b15).toFixed(2),
        subtotal_0: +s.b0.toFixed(2), subtotal_15: +s.b15.toFixed(2),
        total_descuento: 0, total_iva: iva, propina: 0, valor_total: total,
        forma_pago: s.fp,
        estado_sri: s.estado,
        fecha_autorizacion: s.estado === 'autorizado' ? (fecha + ' 09:15:00') : null,
        mensaje_sri: '[DEMO] Factura de ejemplo para el libro de ventas.',
        emitida_por: null, creado_en: new Date(menos(s.dias)).toISOString(),
        _items: [],
      };
    });
    Store.set('facturas', facturas);
    return facturas;
  }

  Handlers['contabilidad/ventas.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let facturas = sembrarFacturasDemoSiVacio();
    const qs = req.queryParams || {};

    // Rango de fechas: mes (YYYY-MM) > año (YYYY) > desde/hasta.
    let desde = null, hasta = null, periodo = null;
    if (qs.mes && /^\d{4}-\d{2}$/.test(qs.mes)) {
      periodo = qs.mes; desde = qs.mes + '-01';
      const d = new Date(qs.mes + '-01'); hasta = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (qs.anio && /^\d{4}$/.test(qs.anio)) {
      periodo = qs.anio; desde = qs.anio + '-01-01'; hasta = qs.anio + '-12-31';
    } else {
      if (qs.desde) desde = qs.desde;
      if (qs.hasta) hasta = qs.hasta;
    }

    let filas = facturas.slice();
    if (desde) filas = filas.filter(f => f.fecha_emision >= desde);
    if (hasta) filas = filas.filter(f => f.fecha_emision <= hasta);
    if (qs.estado)     filas = filas.filter(f => f.estado_sri === qs.estado);
    if (qs.forma_pago) filas = filas.filter(f => f.forma_pago === qs.forma_pago);
    if (qs.comprador) {
      const t = String(qs.comprador).toLowerCase();
      filas = filas.filter(f => String(f.comprador_id).toLowerCase().includes(t) ||
                                String(f.comprador_razon).toLowerCase().includes(t));
    }

    filas = filas
      .map(({ _items, ...rest }) => rest)
      .sort((a, b) => (b.fecha_emision + b.numero_completo).localeCompare(a.fecha_emision + a.numero_completo));

    const tot = { base_0: 0, base_iva: 0, iva: 0, descuento: 0, total: 0, count: 0, anuladas: 0 };
    filas.forEach(f => {
      if (f.estado_sri === 'anulado') { tot.anuladas++; return; }
      tot.base_0 += +f.subtotal_0 || 0;
      tot.base_iva += +f.subtotal_15 || 0;
      tot.iva += +f.total_iva || 0;
      tot.descuento += +f.total_descuento || 0;
      tot.total += +f.valor_total || 0;
      tot.count++;
    });
    ['base_0', 'base_iva', 'iva', 'descuento', 'total'].forEach(k => tot[k] = +tot[k].toFixed(2));

    return ok({ filas, totales: tot, periodo, rango: { desde, hasta }, _demo: true });
  };

  Handlers['contabilidad/config/get.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    return ok(DemoConta.config);
  };
  Handlers['contabilidad/config/set.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    DemoConta.config = { ...DemoConta.config, ...(body || {}) };
    return ok(DemoConta.config);
  };

  Handlers['contabilidad/tarifas/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    return ok({ tarifas: DemoConta.tarifas, referencial: true });
  };
  Handlers['contabilidad/tarifas/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const t = body || {};
    if (!t.impuesto || !t.codigo_sri || t.porcentaje === undefined || t.porcentaje === '') {
      return err('Faltan campos: impuesto, código SRI y porcentaje son obligatorios', 400);
    }
    if (t.id) {
      const i = DemoConta.tarifas.findIndex(x => x.id === Number(t.id));
      if (i === -1) return err('Tarifa no encontrada', 404);
      DemoConta.tarifas[i] = { ...DemoConta.tarifas[i], ...t, id: Number(t.id), porcentaje: Number(t.porcentaje) };
      return ok(DemoConta.tarifas[i]);
    }
    const nueva = {
      id: DemoConta._nextTarifaId++, impuesto: t.impuesto, codigo_sri: String(t.codigo_sri),
      concepto: t.concepto || '', porcentaje: Number(t.porcentaje),
      fecha_inicio: t.fecha_inicio || new Date().toISOString().slice(0, 10),
      fecha_fin: t.fecha_fin || null, activo: t.activo === undefined ? 1 : Number(t.activo),
      notas: t.notas || '',
    };
    DemoConta.tarifas.push(nueva);
    return ok(nueva);
  };

  Handlers['contabilidad/cuentas/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    return ok({ cuentas: DemoConta.cuentas });
  };
  Handlers['contabilidad/cuentas/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const c = body || {};
    if (!c.codigo || !c.nombre || !c.tipo) return err('Código, nombre y tipo son obligatorios', 400);
    const i = DemoConta.cuentas.findIndex(x => x.codigo === c.codigo);
    const reg = {
      codigo: String(c.codigo), nombre: c.nombre, tipo: c.tipo,
      cuenta_padre: c.cuenta_padre || null,
      movimiento: c.movimiento === undefined ? 1 : Number(c.movimiento),
      activa: c.activa === undefined ? 1 : Number(c.activa),
    };
    if (i === -1) DemoConta.cuentas.push(reg); else DemoConta.cuentas[i] = reg;
    return ok(reg);
  };

  /* ---- Compras (Fase 3) ---- */
  function sembrarComprasDemoSiVacio() {
    const ex = Store.get('conta_compras', null);
    if (ex) return ex;
    const hoy = new Date();
    const ym = (d) => d.toISOString().slice(0, 10);
    const menos = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return ym(d); };
    const base = [
      { dias: 2,  prov: 'DISTRIBUIDORA TECNOSEG S.A.', ruc: '1792345678001', num: '001-001-000004521', s15: 1200.00, fp: 'transferencia', pago: 'pagada',     ded: 1, tipo: 'factura' },
      { dias: 6,  prov: 'CABLES Y CONECTORES CIA LTDA', ruc: '1791112223001', num: '002-001-000000890', s15: 430.50,  fp: 'efectivo',      pago: 'pendiente',  ded: 1, tipo: 'factura' },
      { dias: 11, prov: 'SERVICIOS ELECTRICOS DEL SUR', ruc: '0992223334001', num: '001-005-000012044', s15: 0, s0: 250.00, fp: 'transferencia', pago: 'pagada',  ded: 1, tipo: 'factura' },
      { dias: 18, prov: 'PAPELERIA OFICINA TOTAL',      ruc: '1700556677001', num: '003-001-000007781', s15: 86.00,   fp: 'tarjeta',       pago: 'parcial',    ded: 1, tipo: 'factura' },
      { dias: 28, prov: 'ARRIENDOS INMOBILIARIA NN',    ruc: '1793334445001', num: '001-001-000000310', s0: 800.00,   fp: 'transferencia', pago: 'pagada',     ded: 1, tipo: 'factura' },
    ];
    const compras = base.map((c, i) => {
      const s15 = +(c.s15 || 0); const s0 = +(c.s0 || 0);
      const iva = +(s15 * 0.15).toFixed(2);
      const total = +(s15 + s0 + iva).toFixed(2);
      return {
        id: i + 1, fecha_emision: menos(c.dias), fecha_registro: menos(c.dias),
        proveedor: c.prov, proveedor_ruc: c.ruc, tipo_comprobante: c.tipo,
        numero_comprobante: c.num, clave_acceso: null, autorizacion_sri: null,
        subtotal_0: s0, subtotal_iva: s15, iva, ice: 0, total,
        categoria_id: null, categoria_nombre: null, forma_pago: c.fp,
        estado_pago: c.pago, deducible: c.ded, observaciones: null,
        estado: 'registrada', _items: [],
      };
    });
    Store.set('conta_compras', compras);
    Store.set('conta_compras_seq', compras.length + 1);
    return compras;
  }
  function filtrarPorPeriodo(filas, qs) {
    let desde = null, hasta = null;
    if (qs.mes && /^\d{4}-\d{2}$/.test(qs.mes)) {
      desde = qs.mes + '-01';
      const d = new Date(qs.mes + '-01'); hasta = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (qs.anio && /^\d{4}$/.test(qs.anio)) {
      desde = qs.anio + '-01-01'; hasta = qs.anio + '-12-31';
    } else { if (qs.desde) desde = qs.desde; if (qs.hasta) hasta = qs.hasta; }
    if (desde) filas = filas.filter(f => f.fecha_emision >= desde);
    if (hasta) filas = filas.filter(f => f.fecha_emision <= hasta);
    return filas;
  }

  Handlers['contabilidad/compras/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let filas = sembrarComprasDemoSiVacio().slice();
    const qs = req.queryParams || {};
    filas = filtrarPorPeriodo(filas, qs);
    if (qs.estado)      filas = filas.filter(f => f.estado === qs.estado);
    if (qs.estado_pago) filas = filas.filter(f => f.estado_pago === qs.estado_pago);
    if (qs.tipo)        filas = filas.filter(f => f.tipo_comprobante === qs.tipo);
    if (qs.deducible !== undefined && qs.deducible !== '') filas = filas.filter(f => String(f.deducible) === String(qs.deducible));
    if (qs.proveedor) {
      const t = String(qs.proveedor).toLowerCase();
      filas = filas.filter(f => f.proveedor_ruc.includes(t) || f.proveedor.toLowerCase().includes(t));
    }
    filas = filas.map(({ _items, ...r }) => r).sort((a, b) => (b.fecha_emision).localeCompare(a.fecha_emision));
    const tot = { subtotal_0: 0, subtotal_iva: 0, iva: 0, total: 0, count: 0, anuladas: 0, por_pagar: 0 };
    filas.forEach(f => {
      if (f.estado === 'anulada') { tot.anuladas++; return; }
      tot.subtotal_0 += +f.subtotal_0 || 0; tot.subtotal_iva += +f.subtotal_iva || 0;
      tot.iva += +f.iva || 0; tot.total += +f.total || 0;
      if (f.estado_pago !== 'pagada') tot.por_pagar += +f.total || 0;
      tot.count++;
    });
    ['subtotal_0', 'subtotal_iva', 'iva', 'total', 'por_pagar'].forEach(k => tot[k] = +tot[k].toFixed(2));
    return ok({ filas, totales: tot, _demo: true });
  };
  Handlers['contabilidad/compras/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const b = body || {};
    const ruc = String(b.proveedor_ruc || '').replace(/\D/g, '');
    if (!b.proveedor) return err('El proveedor es obligatorio', 400);
    if (ruc.length !== 13) return err('El RUC del proveedor debe tener 13 dígitos', 400);
    if (!/^\d{3}-\d{3}-\d{9}$/.test(b.numero_comprobante || '')) return err('El número debe tener el formato 001-001-000000001', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_emision || '')) return err('Fecha de emisión inválida', 400);
    const clave = String(b.clave_acceso || '').replace(/\D/g, '');
    if (clave && clave.length !== 49) return err('La clave de acceso debe tener 49 dígitos (o dejarse vacía)', 400);
    const compras = sembrarComprasDemoSiVacio();
    // Duplicado: mismo proveedor + número (+ clave).
    const dup = compras.find(c => c.id !== Number(b.id) && c.proveedor_ruc === ruc && c.numero_comprobante === b.numero_comprobante);
    if (dup) return err('Ese comprobante ya fue registrado para este proveedor (no se permiten duplicados).', 409);
    const s0 = +(b.subtotal_0 || 0), s15 = +(b.subtotal_iva || 0), iva = +(b.iva || 0), ice = +(b.ice || 0);
    const total = (b.total !== undefined && b.total !== '') ? +b.total : +(s0 + s15 + iva + ice).toFixed(2);
    const reg = {
      fecha_emision: b.fecha_emision, fecha_registro: new Date().toISOString().slice(0, 10),
      proveedor: b.proveedor, proveedor_ruc: ruc,
      tipo_comprobante: b.tipo_comprobante || 'factura', numero_comprobante: b.numero_comprobante,
      clave_acceso: clave || null, autorizacion_sri: null,
      subtotal_0: +s0.toFixed(2), subtotal_iva: +s15.toFixed(2), iva: +iva.toFixed(2), ice: +ice.toFixed(2), total: +total.toFixed(2),
      categoria_id: null, categoria_nombre: null, forma_pago: b.forma_pago || null,
      estado_pago: b.estado_pago || 'pendiente', deducible: b.deducible === undefined ? 1 : (b.deducible ? 1 : 0),
      observaciones: b.observaciones || null, estado: 'registrada',
      _items: Array.isArray(b.items) ? b.items.filter(i => i && i.descripcion) : [],
    };
    if (b.id) {
      const i = compras.findIndex(c => c.id === Number(b.id));
      if (i === -1) return err('Compra no encontrada', 404);
      compras[i] = { ...compras[i], ...reg, id: Number(b.id) };
      Store.set('conta_compras', compras);
      return ok(compras[i]);
    }
    let seq = Store.get('conta_compras_seq', compras.length + 1);
    reg.id = seq++; Store.set('conta_compras_seq', seq);
    compras.unshift(reg); Store.set('conta_compras', compras);
    return ok(reg);
  };
  Handlers['contabilidad/compras/detalle.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const id = Number((req.queryParams || {}).id);
    const c = sembrarComprasDemoSiVacio().find(x => x.id === id);
    if (!c) return err('Compra no encontrada', 404);
    const { _items, ...compra } = c;
    return ok({ compra, items: _items || [] });
  };
  Handlers['contabilidad/compras/anular.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const compras = sembrarComprasDemoSiVacio();
    const c = compras.find(x => x.id === Number((body || {}).id));
    if (!c) return err('Compra no encontrada', 404);
    if (c.estado === 'anulada') return err('La compra ya está anulada', 409);
    c.estado = 'anulada'; Store.set('conta_compras', compras);
    return ok({ id: c.id, estado: 'anulada' });
  };

  /* ---- Retenciones (Fase 3) ---- */
  function sembrarRetencionesDemoSiVacio() {
    const ex = Store.get('conta_retenciones', null);
    if (ex) return ex;
    const hoy = new Date();
    const menos = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const seed = [
      { dias: 2, dir: 'emitida', terc: 'DISTRIBUIDORA TECNOSEG S.A.', id: '1792345678001', num: '001-001-000000045',
        det: [{ impuesto: 'RENTA', codigo_sri: '312', base: 1200, porcentaje: 1.75 }, { impuesto: 'IVA', codigo_sri: '721', base: 180, porcentaje: 30 }] },
      { dias: 11, dir: 'emitida', terc: 'SERVICIOS ELECTRICOS DEL SUR', id: '0992223334001', num: '001-001-000000046',
        det: [{ impuesto: 'RENTA', codigo_sri: '308', base: 250, porcentaje: 8 }] },
      { dias: 5, dir: 'recibida', terc: 'COMERCIAL ANDINA S.A.', id: '1790012345001', num: '004-002-000023110',
        det: [{ impuesto: 'RENTA', codigo_sri: '312', base: 1250, porcentaje: 1.75 }, { impuesto: 'IVA', codigo_sri: '725', base: 187.5, porcentaje: 70 }] },
      { dias: 20, dir: 'recibida', terc: 'SEGURIDAD TOTAL CIA LTDA', id: '1791234567001', num: '001-001-000005512',
        det: [{ impuesto: 'IVA', codigo_sri: '723', base: 372, porcentaje: 100 }] },
    ];
    const rets = seed.map((r, i) => {
      const det = r.det.map((d, j) => ({ id: i * 10 + j + 1, retencion_id: i + 1, impuesto: d.impuesto, codigo_sri: d.codigo_sri,
        tarifa_id: null, base: +d.base.toFixed(2), porcentaje: +d.porcentaje.toFixed(2), valor: +(d.base * d.porcentaje / 100).toFixed(2) }));
      return { id: i + 1, direccion: r.dir, tercero: r.terc, tercero_id: r.id, numero: r.num, clave_acceso: null,
        compra_id: null, factura_id: null, fecha_emision: menos(r.dias), fecha_pago: null,
        total_retenido: +det.reduce((s, d) => s + d.valor, 0).toFixed(2), estado: 'emitida', _detalles: det };
    });
    Store.set('conta_retenciones', rets);
    Store.set('conta_ret_seq', rets.length + 1);
    return rets;
  }
  Handlers['contabilidad/retenciones/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let filas = sembrarRetencionesDemoSiVacio().slice();
    const qs = req.queryParams || {};
    filas = filtrarPorPeriodo(filas, qs);
    if (qs.direccion) filas = filas.filter(f => f.direccion === qs.direccion);
    if (qs.estado)    filas = filas.filter(f => f.estado === qs.estado);
    if (qs.tercero) {
      const t = String(qs.tercero).toLowerCase();
      filas = filas.filter(f => String(f.tercero_id).includes(t) || f.tercero.toLowerCase().includes(t));
    }
    filas = filas.map(({ _detalles, ...r }) => r).sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision));
    const tot = { emitidas: 0, recibidas: 0, count: 0, anuladas: 0 };
    filas.forEach(f => {
      if (f.estado === 'anulada') { tot.anuladas++; return; }
      if (f.direccion === 'emitida') tot.emitidas += +f.total_retenido || 0; else tot.recibidas += +f.total_retenido || 0;
      tot.count++;
    });
    tot.emitidas = +tot.emitidas.toFixed(2); tot.recibidas = +tot.recibidas.toFixed(2);
    return ok({ filas, totales: tot, _demo: true });
  };
  Handlers['contabilidad/retenciones/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const b = body || {};
    if (!['emitida', 'recibida'].includes(b.direccion)) return err('Dirección inválida (emitida o recibida)', 400);
    if (!b.tercero) return err('El tercero (proveedor/cliente) es obligatorio', 400);
    const tid = String(b.tercero_id || '').replace(/\D/g, '');
    if (tid.length < 10) return err('La identificación del tercero debe tener al menos 10 dígitos', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_emision || '')) return err('Fecha de emisión inválida', 400);
    const dets = Array.isArray(b.detalles) ? b.detalles : [];
    const detNorm = [];
    dets.forEach((d, j) => {
      const imp = d.impuesto === 'RENTA' ? 'RENTA' : (d.impuesto === 'IVA' ? 'IVA' : null);
      if (!imp || !d.codigo_sri) return;
      const base = +(d.base || 0), pct = +(d.porcentaje || 0);
      const val = (d.valor !== undefined && d.valor !== '') ? +d.valor : +(base * pct / 100).toFixed(2);
      detNorm.push({ id: j + 1, impuesto: imp, codigo_sri: String(d.codigo_sri), tarifa_id: d.tarifa_id || null,
        base: +base.toFixed(2), porcentaje: +pct.toFixed(2), valor: +val.toFixed(2) });
    });
    if (!detNorm.length) return err('La retención necesita al menos un detalle válido (IVA o RENTA)', 400);
    const totalRet = +detNorm.reduce((s, d) => s + d.valor, 0).toFixed(2);
    const rets = sembrarRetencionesDemoSiVacio();
    const reg = {
      direccion: b.direccion, tercero: b.tercero, tercero_id: tid, numero: b.numero || null,
      clave_acceso: (String(b.clave_acceso || '').replace(/\D/g, '') || null),
      compra_id: b.compra_id || null, factura_id: b.factura_id || null,
      fecha_emision: b.fecha_emision, fecha_pago: b.fecha_pago || null,
      total_retenido: totalRet, estado: b.estado || 'emitida', _detalles: detNorm,
    };
    if (b.id) {
      const i = rets.findIndex(r => r.id === Number(b.id));
      if (i === -1) return err('Retención no encontrada', 404);
      rets[i] = { ...rets[i], ...reg, id: Number(b.id) };
      Store.set('conta_retenciones', rets);
      return ok(rets[i]);
    }
    let seq = Store.get('conta_ret_seq', rets.length + 1);
    reg.id = seq++; Store.set('conta_ret_seq', seq);
    rets.unshift(reg); Store.set('conta_retenciones', rets);
    return ok(reg);
  };
  Handlers['contabilidad/retenciones/detalle.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const id = Number((req.queryParams || {}).id);
    const r = sembrarRetencionesDemoSiVacio().find(x => x.id === id);
    if (!r) return err('Retención no encontrada', 404);
    const { _detalles, ...retencion } = r;
    return ok({ retencion, detalles: _detalles || [] });
  };

  /* ---- Fase 4: CxC / CxP / Pagos ---- */
  Handlers['contabilidad/pagos/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let filas = Store.get('conta_pagos', []).slice();
    const qs = req.queryParams || {};
    if (qs.tipo) filas = filas.filter(p => p.tipo === qs.tipo);
    if (qs.documento_tipo) filas = filas.filter(p => p.documento_tipo === qs.documento_tipo);
    if (qs.desde) filas = filas.filter(p => p.fecha >= qs.desde);
    if (qs.hasta) filas = filas.filter(p => p.fecha <= qs.hasta);
    return ok({ filas: filas.sort((a, b) => b.fecha.localeCompare(a.fecha)) });
  };
  Handlers['contabilidad/pagos/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const b = body || {};
    if (!['cobro', 'pago'].includes(b.tipo)) return err('Tipo inválido (cobro o pago)', 400);
    const monto = +(b.monto || 0);
    if (monto <= 0) return err('El monto debe ser mayor a 0', 400);
    const pagos = Store.get('conta_pagos', []);
    let seq = Store.get('conta_pagos_seq', 1);
    const reg = {
      id: seq++, tipo: b.tipo, documento_tipo: b.documento_tipo || 'otro',
      documento_id: b.documento_tipo === 'compra' ? (b.documento_id || null) : null,
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : new Date().toISOString().slice(0, 10),
      metodo: b.metodo || 'transferencia', monto: +monto.toFixed(2),
      referencia: b.documento_tipo === 'factura' && b.documento_ref ? String(b.documento_ref) : (b.referencia || null),
      conciliado: b.conciliado ? 1 : 0,
    };
    Store.set('conta_pagos_seq', seq);
    pagos.unshift(reg); Store.set('conta_pagos', pagos);
    // Recalcular estado_pago de la compra.
    if (reg.tipo === 'pago' && reg.documento_tipo === 'compra' && reg.documento_id) {
      const compras = Store.get('conta_compras', []);
      const c = compras.find(x => x.id === Number(reg.documento_id));
      if (c) {
        const pagado = pagos.filter(p => p.tipo === 'pago' && p.documento_tipo === 'compra' && Number(p.documento_id) === c.id).reduce((s, p) => s + p.monto, 0);
        c.estado_pago = pagado <= 0.005 ? 'pendiente' : (pagado + 0.005 >= c.total ? 'pagada' : 'parcial');
        Store.set('conta_compras', compras);
      }
    }
    return ok(reg);
  };
  Handlers['contabilidad/cxc.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const facturas = sembrarFacturasDemoSiVacio().filter(f => f.estado_sri === 'autorizado');
    const pagos = Store.get('conta_pagos', []);
    const hoy = new Date();
    const filas = []; const tot = { saldo: 0, vencido: 0, count: 0 };
    facturas.forEach(f => {
      const cobrado = pagos.filter(p => p.tipo === 'cobro' && p.documento_tipo === 'factura' && p.referencia === f.id).reduce((s, p) => s + p.monto, 0);
      const saldo = +((+f.valor_total) - cobrado).toFixed(2);
      if (saldo <= 0.005) return;
      const dv = Math.max(0, Math.floor((hoy - new Date(f.fecha_emision)) / 86400000));
      filas.push({ id: f.id, numero: f.numero_completo, fecha_emision: f.fecha_emision, cliente: f.comprador_razon, identificacion: f.comprador_id, total: +(+f.valor_total).toFixed(2), cobrado: +cobrado.toFixed(2), saldo, dias_vencido: dv });
      tot.saldo += saldo; tot.count++; if (dv > 0) tot.vencido += saldo;
    });
    tot.saldo = +tot.saldo.toFixed(2); tot.vencido = +tot.vencido.toFixed(2);
    filas.sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision));
    return ok({ filas, totales: tot, _demo: true });
  };
  Handlers['contabilidad/cxp.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const compras = sembrarComprasDemoSiVacio().filter(c => c.estado === 'registrada');
    const pagos = Store.get('conta_pagos', []);
    const hoy = new Date();
    const filas = []; const tot = { saldo: 0, vencido: 0, count: 0 };
    compras.forEach(c => {
      const pagado = pagos.filter(p => p.tipo === 'pago' && p.documento_tipo === 'compra' && Number(p.documento_id) === c.id).reduce((s, p) => s + p.monto, 0);
      const saldo = +((+c.total) - pagado).toFixed(2);
      if (saldo <= 0.005) return;
      const dv = Math.max(0, Math.floor((hoy - new Date(c.fecha_emision)) / 86400000));
      filas.push({ id: c.id, numero: c.numero_comprobante, fecha_emision: c.fecha_emision, proveedor: c.proveedor, ruc: c.proveedor_ruc, total: +(+c.total).toFixed(2), pagado: +pagado.toFixed(2), saldo, dias_vencido: dv, estado_pago: c.estado_pago });
      tot.saldo += saldo; tot.count++; if (dv > 0) tot.vencido += saldo;
    });
    tot.saldo = +tot.saldo.toFixed(2); tot.vencido = +tot.vencido.toFixed(2);
    filas.sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision));
    return ok({ filas, totales: tot, _demo: true });
  };

  /* ---- Fase 4: Bancos ---- */
  function sembrarBancosDemoSiVacio() {
    const ex = Store.get('conta_bancos', null);
    if (ex) return ex;
    const menos = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const seed = [
      { dias: 1, banco: 'Banco Pichincha', tipo: 'ingreso', desc: 'Depósito cobro cliente', valor: 1437.50, estado: 'pendiente' },
      { dias: 3, banco: 'Banco Pichincha', tipo: 'egreso', desc: 'Pago proveedor TecnoSeg', valor: 1380.00, estado: 'conciliado' },
      { dias: 7, banco: 'Banco Guayaquil', tipo: 'ingreso', desc: 'Transferencia recibida', valor: 540.00, estado: 'pendiente' },
      { dias: 12, banco: 'Banco Pichincha', tipo: 'egreso', desc: 'Servicios básicos', valor: 96.40, estado: 'conciliado' },
    ];
    const movs = seed.map((m, i) => ({ id: i + 1, fecha: menos(m.dias), banco: m.banco, cuenta: null, tipo: m.tipo, descripcion: m.desc, valor: m.valor, referencia: null, doc_tipo: 'ninguno', doc_id: null, estado: m.estado }));
    Store.set('conta_bancos', movs); Store.set('conta_bancos_seq', movs.length + 1);
    return movs;
  }
  Handlers['contabilidad/bancos/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let filas = sembrarBancosDemoSiVacio().slice();
    const qs = req.queryParams || {};
    if (qs.desde) filas = filas.filter(m => m.fecha >= qs.desde);
    if (qs.hasta) filas = filas.filter(m => m.fecha <= qs.hasta);
    if (qs.estado) filas = filas.filter(m => m.estado === qs.estado);
    if (qs.tipo) filas = filas.filter(m => m.tipo === qs.tipo);
    if (qs.banco) filas = filas.filter(m => m.banco.toLowerCase().includes(String(qs.banco).toLowerCase()));
    const tot = { ingresos: 0, egresos: 0, pendientes: 0, count: filas.length };
    filas.forEach(m => { if (m.tipo === 'ingreso') tot.ingresos += +m.valor; else tot.egresos += +m.valor; if (m.estado === 'pendiente') tot.pendientes++; });
    tot.ingresos = +tot.ingresos.toFixed(2); tot.egresos = +tot.egresos.toFixed(2); tot.saldo = +(tot.ingresos - tot.egresos).toFixed(2);
    return ok({ filas: filas.sort((a, b) => b.fecha.localeCompare(a.fecha)), totales: tot, _demo: true });
  };
  Handlers['contabilidad/bancos/guardar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const b = body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return err('Fecha inválida', 400);
    if (!b.banco) return err('El banco es obligatorio', 400);
    if (!['ingreso', 'egreso'].includes(b.tipo)) return err('Tipo inválido (ingreso o egreso)', 400);
    if (+(b.valor || 0) <= 0) return err('El valor debe ser mayor a 0', 400);
    const movs = sembrarBancosDemoSiVacio();
    const reg = { fecha: b.fecha, banco: b.banco, cuenta: b.cuenta || null, tipo: b.tipo, descripcion: b.descripcion || null, valor: +(+b.valor).toFixed(2), referencia: b.referencia || null, doc_tipo: 'ninguno', doc_id: null, estado: 'pendiente' };
    if (b.id) {
      const i = movs.findIndex(m => m.id === Number(b.id));
      if (i === -1) return err('Movimiento no encontrado', 404);
      movs[i] = { ...movs[i], ...reg, id: Number(b.id) }; Store.set('conta_bancos', movs); return ok(movs[i]);
    }
    let seq = Store.get('conta_bancos_seq', movs.length + 1);
    reg.id = seq++; Store.set('conta_bancos_seq', seq);
    movs.unshift(reg); Store.set('conta_bancos', movs);
    return ok(reg);
  };
  Handlers['contabilidad/bancos/conciliar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const movs = sembrarBancosDemoSiVacio();
    const m = movs.find(x => x.id === Number((body || {}).id));
    if (!m) return err('Movimiento no encontrado', 404);
    m.estado = (body || {}).conciliado ? 'conciliado' : 'pendiente';
    Store.set('conta_bancos', movs);
    return ok({ id: m.id, estado: m.estado });
  };

  /* ---- Fase 4: Asientos ---- */
  Handlers['contabilidad/asientos/listar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    let filas = Store.get('conta_asientos', []).map(({ _movimientos, ...a }) => a);
    const qs = req.queryParams || {};
    if (qs.mes && /^\d{4}-\d{2}$/.test(qs.mes)) { const d = qs.mes + '-01'; const h = new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0).toISOString().slice(0, 10); filas = filas.filter(a => a.fecha >= d && a.fecha <= h); }
    if (qs.origen) filas = filas.filter(a => a.origen_tipo === qs.origen);
    if (qs.estado) filas = filas.filter(a => a.estado === qs.estado);
    return ok({ filas: filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id), _demo: true });
  };
  Handlers['contabilidad/asientos/detalle.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const id = Number((req.queryParams || {}).id);
    const a = Store.get('conta_asientos', []).find(x => x.id === id);
    if (!a) return err('Asiento no encontrado', 404);
    const { _movimientos, ...asiento } = a;
    return ok({ asiento, movimientos: _movimientos || [] });
  };
  Handlers['contabilidad/asientos/reversar.php'] = (req, body, payload) => {
    if (!payload || payload.rol !== 'superadmin') return err('Solo superadmin puede reversar', 403);
    const asientos = Store.get('conta_asientos', []);
    const orig = asientos.find(x => x.id === Number((body || {}).id));
    if (!orig) return err('Asiento no encontrado', 404);
    if (orig.estado !== 'registrado') return err('Solo se pueden reversar asientos en estado "registrado"', 409);
    let seq = Store.get('conta_asientos_seq', asientos.length + 1);
    const nuevo = {
      id: seq++, fecha: new Date().toISOString().slice(0, 10), glosa: 'Reverso de asiento #' + orig.id + ' — ' + orig.glosa,
      origen_tipo: 'reverso', origen_id: orig.origen_id, estado: 'registrado', reverso_de: orig.id,
      total_debe: orig.total_haber, total_haber: orig.total_debe,
      _movimientos: (orig._movimientos || []).map((l, i) => ({ id: i + 1, cuenta_codigo: l.cuenta_codigo, cuenta_nombre: l.cuenta_nombre, detalle: 'Reverso: ' + (l.detalle || ''), debe: l.haber, haber: l.debe })),
    };
    orig.estado = 'reversado';
    asientos.push(nuevo); Store.set('conta_asientos_seq', seq); Store.set('conta_asientos', asientos);
    return ok({ id: orig.id, estado: 'reversado', reverso_id: nuevo.id });
  };
  Handlers['contabilidad/asientos/generar.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const mes = /^\d{4}-\d{2}$/.test((body || {}).mes || '') ? body.mes : new Date().toISOString().slice(0, 7);
    const d0 = mes + '-01'; const d1 = new Date(new Date(d0).getFullYear(), new Date(d0).getMonth() + 1, 0).toISOString().slice(0, 10);
    const C = { bancos: '1.1.02', cxc: '1.1.03', cxp: '2.1.01', ventas: '4.1.01', iva_ventas: '2.1.04', iva_compras: '1.1.05', gasto: '5.1.01' };
    const asientos = Store.get('conta_asientos', []);
    let seq = Store.get('conta_asientos_seq', asientos.length + 1);
    const existe = (origen, oid) => asientos.some(a => a.origen_tipo === origen && String(a.origen_id) === String(oid) && a.estado === 'registrado');
    const crear = (fecha, glosa, origen, oid, lineas) => {
      const debe = +lineas.reduce((s, l) => s + l[2], 0).toFixed(2);
      const haber = +lineas.reduce((s, l) => s + l[3], 0).toFixed(2);
      asientos.push({ id: seq, fecha, glosa, origen_tipo: origen, origen_id: oid, estado: 'registrado', reverso_de: null, total_debe: debe, total_haber: haber,
        _movimientos: lineas.map((l, i) => ({ id: i + 1, cuenta_codigo: l[0], cuenta_nombre: null, detalle: l[1], debe: +l[2].toFixed(2), haber: +l[3].toFixed(2) })) });
      seq++;
    };
    let creados = 0;
    sembrarFacturasDemoSiVacio().filter(f => f.estado_sri === 'autorizado' && f.fecha_emision >= d0 && f.fecha_emision <= d1).forEach(f => {
      if (existe('venta', f.id)) return;
      const iva = +f.total_iva, total = +f.valor_total, neto = +(total - iva).toFixed(2);
      crear(f.fecha_emision, 'Venta factura ' + f.numero_completo, 'venta', f.id, [[C.cxc, 'Cliente', total, 0], [C.ventas, 'Ventas', 0, neto], [C.iva_ventas, 'IVA ventas', 0, iva]]); creados++;
    });
    sembrarComprasDemoSiVacio().filter(c => c.estado === 'registrada' && c.fecha_emision >= d0 && c.fecha_emision <= d1).forEach(c => {
      if (existe('compra', c.id)) return;
      const iva = +c.iva, total = +c.total, neto = +(total - iva).toFixed(2);
      crear(c.fecha_emision, 'Compra ' + c.numero_comprobante, 'compra', c.id, [[C.gasto, 'Gasto/compra', neto, 0], [C.iva_compras, 'IVA crédito', iva, 0], [C.cxp, 'Proveedor', 0, total]]); creados++;
    });
    Store.get('conta_pagos', []).filter(p => p.fecha >= d0 && p.fecha <= d1).forEach(p => {
      const origen = p.tipo === 'cobro' ? 'cobro' : 'pago';
      if (existe(origen, p.id)) return;
      if (p.tipo === 'cobro') crear(p.fecha, 'Cobro de cliente', 'cobro', p.id, [[C.bancos, 'Bancos', p.monto, 0], [C.cxc, 'Cliente', 0, p.monto]]);
      else crear(p.fecha, 'Pago a proveedor', 'pago', p.id, [[C.cxp, 'Proveedor', p.monto, 0], [C.bancos, 'Bancos', 0, p.monto]]);
      creados++;
    });
    Store.set('conta_asientos_seq', seq); Store.set('conta_asientos', asientos);
    return ok({ periodo: mes, creados, cuentas_usadas: C, nota: 'Asientos referenciales (demo). Ajusta el mapeo de cuentas en Configuración y valida con tu contador.', _demo: true });
  };

  /* ---- Fase 4: Reportes tributarios ---- */
  function sumFacturas(d0, d1) {
    const f = sembrarFacturasDemoSiVacio().filter(x => x.estado_sri === 'autorizado' && x.fecha_emision >= d0 && x.fecha_emision <= d1);
    return f.reduce((a, x) => { a.gravadas += +x.subtotal_15 || 0; a.cero += +x.subtotal_0 || 0; a.iva += +x.total_iva || 0; a.total += +x.valor_total || 0; return a; }, { gravadas: 0, cero: 0, iva: 0, total: 0 });
  }
  function sumCompras(d0, d1) {
    const c = sembrarComprasDemoSiVacio().filter(x => x.estado === 'registrada' && x.fecha_emision >= d0 && x.fecha_emision <= d1);
    return c.reduce((a, x) => { a.gravadas += +x.subtotal_iva || 0; a.cero += +x.subtotal_0 || 0; a.iva += +x.iva || 0; a.total += +x.total || 0; return a; }, { gravadas: 0, cero: 0, iva: 0, total: 0 });
  }
  const r2 = (o) => { Object.keys(o).forEach(k => o[k] = +(+o[k]).toFixed(2)); return o; };
  Handlers['contabilidad/reportes/iva.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const mes = /^\d{4}-\d{2}$/.test((req.queryParams || {}).mes || '') ? req.queryParams.mes : new Date().toISOString().slice(0, 7);
    const d0 = mes + '-01'; const d1 = new Date(new Date(d0).getFullYear(), new Date(d0).getMonth() + 1, 0).toISOString().slice(0, 10);
    const v = sumFacturas(d0, d1), c = sumCompras(d0, d1);
    return ok({ periodo: mes,
      ventas: r2({ gravadas: v.gravadas, tarifa_0: v.cero, iva: v.iva }),
      compras: r2({ gravadas: c.gravadas, tarifa_0: c.cero, iva_credito: c.iva }),
      iva_por_pagar: +(v.iva - c.iva).toFixed(2),
      retencion_iva_recibida: +sembrarRetencionesDemoSiVacio().filter(r => r.direccion === 'recibida' && r.estado !== 'anulada' && r.fecha_emision >= d0 && r.fecha_emision <= d1).reduce((s, r) => s + (r._detalles || []).filter(d => d.impuesto === 'IVA').reduce((a, d) => a + d.valor, 0), 0).toFixed(2),
      nota: 'Valores referenciales (demo). Verificar con el contador (formulario 104).', _demo: true });
  };
  Handlers['contabilidad/reportes/retenciones.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const mes = /^\d{4}-\d{2}$/.test((req.queryParams || {}).mes || '') ? req.queryParams.mes : new Date().toISOString().slice(0, 7);
    const d0 = mes + '-01'; const d1 = new Date(new Date(d0).getFullYear(), new Date(d0).getMonth() + 1, 0).toISOString().slice(0, 10);
    const rets = sembrarRetencionesDemoSiVacio().filter(r => r.estado !== 'anulada' && r.fecha_emision >= d0 && r.fecha_emision <= d1);
    const map = {}; const tot = { emitida: 0, recibida: 0 };
    rets.forEach(r => (r._detalles || []).forEach(d => {
      const key = r.direccion + '|' + d.impuesto + '|' + d.codigo_sri;
      if (!map[key]) map[key] = { direccion: r.direccion, impuesto: d.impuesto, codigo_sri: d.codigo_sri, num: 0, base: 0, retenido: 0 };
      map[key].num++; map[key].base += d.base; map[key].retenido += d.valor; tot[r.direccion] += d.valor;
    }));
    const filas = Object.values(map).map(f => ({ ...f, base: +f.base.toFixed(2), retenido: +f.retenido.toFixed(2) }));
    return ok({ periodo: mes, filas, totales: r2(tot), nota: 'Resumen referencial por código del SRI (demo).', _demo: true });
  };
  Handlers['contabilidad/reportes/tributario-mensual.php'] = (req, body, payload) => {
    if (!contaSoloAdmin(payload)) return err('No autorizado', 403);
    const mes = /^\d{4}-\d{2}$/.test((req.queryParams || {}).mes || '') ? req.queryParams.mes : new Date().toISOString().slice(0, 7);
    const d0 = mes + '-01'; const d1 = new Date(new Date(d0).getFullYear(), new Date(d0).getMonth() + 1, 0).toISOString().slice(0, 10);
    const v = sumFacturas(d0, d1), c = sumCompras(d0, d1);
    const rets = sembrarRetencionesDemoSiVacio().filter(r => r.estado !== 'anulada' && r.fecha_emision >= d0 && r.fecha_emision <= d1);
    const retEmit = rets.filter(r => r.direccion === 'emitida').reduce((s, r) => s + r.total_retenido, 0);
    const retReci = rets.filter(r => r.direccion === 'recibida').reduce((s, r) => s + r.total_retenido, 0);
    return ok({ periodo: mes, lineas: [
      { concepto: 'Total ventas (autorizadas)', valor: +v.total.toFixed(2) },
      { concepto: 'IVA en ventas (cobrado)', valor: +v.iva.toFixed(2) },
      { concepto: 'Total compras (registradas)', valor: +c.total.toFixed(2) },
      { concepto: 'IVA en compras (crédito tributario)', valor: +c.iva.toFixed(2) },
      { concepto: 'IVA por pagar (104)', valor: +(v.iva - c.iva).toFixed(2), destacar: true },
      { concepto: 'Retenciones emitidas (a proveedores)', valor: +retEmit.toFixed(2) },
      { concepto: 'Retenciones recibidas (de clientes)', valor: +retReci.toFixed(2) },
    ], nota: 'Borrador referencial para declaraciones (104/103). Validar con contador autorizado.', _demo: true });
  };

  /* ============================================================
     INTERCEPTOR de fetch
     ============================================================ */
  const origFetch = (typeof window.fetch === 'function')
    ? window.fetch.bind(window)
    : (() => Promise.reject(new Error('fetch nativo no disponible')));
  const DELAY_MS = 150; // delay simulado (sensación realista)

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    // Solo interceptar URLs de la API
    if (!/\/api\/endpoints\//.test(url)) return origFetch(input, init);

    // Asegurar seed antes de cada call (idempotente)
    seedTardio();

    // Path relativo desde /api/endpoints/
    const m = url.match(/\/api\/endpoints\/(.+?)(\?.*)?$/);
    const path = m ? m[1] : '';
    const handler = Handlers[path];
    if (!handler) {
      console.warn('[demo] Endpoint no implementado:', path);
      return new Response(JSON.stringify({ ok: false, error: 'Endpoint no implementado en modo demo: ' + path }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    const method = (init.method || 'GET').toUpperCase();
    const headers = init.headers || {};
    const payload = authFromReq(headers);

    let body = {}, formData = null;
    if (init.body) {
      if (init.body instanceof FormData) {
        formData = init.body;
      } else if (typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (_) { body = {}; }
      } else if (typeof init.body === 'object') {
        body = init.body;
      }
    }

    // Reconstruir un "request" mínimo con la URL absoluta
    const absUrl = url.startsWith('http') ? url : (location.origin + url);
    // Parsear query string para que los handlers puedan leerla cómodamente
    let queryParams = {};
    try {
      const u = new URL(absUrl);
      u.searchParams.forEach((v, k) => { queryParams[k] = v; });
    } catch (_) {}
    const fakeReq = { url: absUrl, method, headers, queryParams };

    try {
      const resp = await new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const r = await handler(fakeReq, body, payload, formData);
            resolve(r);
          } catch (e) {
            console.error('[demo] Handler crash:', e);
            resolve(err('Error interno demo: ' + e.message, 500));
          }
        }, DELAY_MS);
      });
      return resp;
    } catch (e) {
      return err('Error interno demo: ' + e.message, 500);
    }
  };

  // Montar el banner cuando el DOM esté listo
  function montarBannerConGuard() {
    montarBanner();
    // Vigilar el documento: si algo borra el banner (ej. admin.js que hace
    // document.body.innerHTML = ...), reinsertarlo automáticamente.
    if (typeof MutationObserver === 'function' && !window.__snelDemoObserver) {
      const obs = new MutationObserver(() => {
        try {
          if (!document || !document.getElementById) return;
          if (!document.getElementById('snel-demo-banner')) {
            setTimeout(() => {
              try {
                if (document && document.getElementById && !document.getElementById('snel-demo-banner')) {
                  montarBanner();
                }
              } catch (_) {}
            }, 50);
          }
        } catch (_) {}
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.__snelDemoObserver = obs;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { seedTardio(); montarBannerConGuard(); });
  } else {
    seedTardio();
    montarBannerConGuard();
  }

  // Forzar URL base de la API a algo relativo para que el regex matchee
  // (api.js usa location.origin + '/api/endpoints/'; en file:// origin es 'null'
  //  así que reemplazamos para que apunte a una ruta simulada).
  window.SNEL_API_BASE = '/api/endpoints/';

  console.log('🧪 [Snel] Modo demo activo. Banner abajo a la izquierda.');
})();
