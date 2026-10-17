/* ============================================================
   SNEL SEGURIDAD — Lógica global (carrito, render, utilidades)
   ============================================================ */

const CART_KEY = "snel_carrito";

/* ---------- Ecommerce real (Snel en Loxafree) ----------
   La landing ya no simula su propia tienda: todo enlace de navegación,
   carrito, cuenta o catálogo apunta directo al ecommerce real. */
const SNEL_ECOMMERCE_URL = 'https://snel.loxafree.com';
const SNEL_ECOMMERCE = {
  home: `${SNEL_ECOMMERCE_URL}/home/1`,
  catalogo: `${SNEL_ECOMMERCE_URL}/catalogo`,
  carrito: `${SNEL_ECOMMERCE_URL}/carrito`,
  cuenta: `${SNEL_ECOMMERCE_URL}/user`,
  terminos: `${SNEL_ECOMMERCE_URL}/terminos`,
  admin: `${SNEL_ECOMMERCE_URL}/admin`,
};

/* ---------- Carga de catálogo desde la API ---------- */
// PRODUCTOS / CATEGORIAS / SNEL_CONFIG vienen de data.js como fallback.
// Si la API responde, los reemplazamos con los datos del servidor (fuente de verdad).
async function cargarDatosDesdeAPI() {
  if (typeof Api === 'undefined') return false; // api.js no cargado todavía
  try {
    const [productos, categorias, config] = await Promise.all([
      Api.productos.listar().catch(() => null),
      Api.categorias.listar().catch(() => null),
      Api.config.get().catch(() => null),
    ]);
    if (productos) {
      PRODUCTOS.length = 0; PRODUCTOS.push(...productos);
    }
    if (categorias) {
      CATEGORIAS.length = 0; CATEGORIAS.push(...categorias);
    }
    if (config) Object.assign(SNEL_CONFIG, config);
    return true;
  } catch {
    return false; // mantenemos data.js como fallback offline
  }
}

// Esperar la primera carga antes de renderizar las páginas.
// data.js queda como fallback offline si la API no responde.
window.SNEL_LISTO = cargarDatosDesdeAPI().then(ok => {
  document.dispatchEvent(new CustomEvent('snel:ready', { detail: { fromApi: ok } }));
  return ok;
});

/* ---------- Cross-tab sync: escuchar cambios del admin ---------- */
(function snelFrontendSync() {
  async function aplicarSync(tipo) {
    await cargarDatosDesdeAPI();
    if (typeof window.onAdminSync === 'function') {
      window.onAdminSync(tipo);
    } else {
      const t = document.createElement('div');
      t.className = 'toast visible';
      t.style.cssText = 'background:var(--cyan-700); color:#fff;';
      t.innerHTML = '<span class="icono">⟳</span><span>Catálogo actualizado</span>';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    }
  }

  // 1) BroadcastChannel (rápido, funciona cuando hay origen real)
  try {
    const bc = new BroadcastChannel('snel-sync');
    bc.onmessage = e => {
      if (['producto-guardado','producto-eliminado','categoria-guardada','categoria-eliminada','config-guardada'].includes(e.data?.tipo)) {
        aplicarSync(e.data.tipo);
      }
    };
  } catch (_) {}

  // 2) Fallback: evento 'storage' de localStorage (se dispara entre pestañas
  //    del mismo origen incluso en file:// cuando BroadcastChannel falla).
  //    Vigila las keys que el modo demo y el backend real podrían tocar.
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === 'snel_demo_productos' ||
        e.key === 'snel_demo_categorias' ||
        e.key === 'snel_demo_config' ||
        e.key.startsWith('snel_catalogo_sync')) {
      aplicarSync('storage');
    }
  });
})();

/* ---------- Utilidades ---------- */
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function qsParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Favoritos (cache local + sincronización con API) ----------
   Mantiene un Set de productoIds. Refresca al iniciar si hay sesión.
   Funciones sincrónicas para que las cards puedan pintar el corazón
   sin esperar la red. */
const FAV_KEY = 'snel_favoritos_ids';
const SnelFav = {
  _set: null,
  cargar() {
    if (this._set !== null) return;
    try { this._set = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
    catch (_) { this._set = new Set(); }
  },
  guardar() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...this._set])); } catch (_) {}
  },
  es(productoId) { this.cargar(); return this._set.has(productoId); },
  /** Sincroniza con el servidor si hay sesión. Llamar al iniciar la página. */
  async sincronizar() {
    this.cargar();
    if (!window.Api || !Api.clientes || !Api.clientes.logueado()) return;
    try {
      const ids = await Api.clientes.favoritos.ids();
      this._set = new Set(ids || []);
      this.guardar();
      // Repintar corazones visibles
      this.pintarCards();
    } catch (_) { /* silencio: no romper la UI por esto */ }
  },
  pintarCards() {
    document.querySelectorAll('[data-fav-id]').forEach(btn => {
      const es = this.es(btn.dataset.favId);
      btn.classList.toggle('activo', es);
      btn.textContent = es ? '❤️' : '🤍';
      btn.title = es ? 'Quitar de favoritos' : 'Agregar a favoritos';
    });
  },
  /** Toggle desde la UI. Si no hay sesión, manda a login. */
  async toggle(productoId) {
    if (!window.Api || !Api.clientes.logueado()) {
      // Guardar producto pendiente y mandar a login
      try { sessionStorage.setItem('snel_fav_pendiente', productoId); } catch (_) {}
      location.href = 'cuenta.html#login';
      return;
    }
    try {
      const r = await Api.clientes.favoritos.toggle(productoId);
      if (r.favorito) this._set.add(productoId);
      else this._set.delete(productoId);
      this.guardar();
      this.pintarCards();
      if (typeof toast === 'function') {
        toast(r.favorito ? '❤️ Agregado a favoritos' : 'Quitado de favoritos');
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Error: ' + e.message, 'error');
    }
  },
};

// Click delegado para todos los corazones de cards
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fav-id]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  SnelFav.toggle(btn.dataset.favId);
});

/* ---------- Carrito ---------- */
const Carrito = {
  obtener() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  },
  guardar(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    Carrito.actualizarBadge();
  },
  agregar(productoId, cantidad = 1) {
    const items = Carrito.obtener();
    const existe = items.find(i => i.id === productoId);
    if (existe) existe.cantidad += cantidad;
    else items.push({ id: productoId, cantidad });
    Carrito.guardar(items);
    mostrarToast(`✓ Agregado al carrito`);
    if (window.SnelTrack) window.SnelTrack('add_carrito', { producto_id: productoId, cantidad: cantidad });
  },
  cambiarCantidad(productoId, cantidad) {
    const items = Carrito.obtener();
    const item = items.find(i => i.id === productoId);
    if (!item) return;
    item.cantidad = Math.max(1, cantidad);
    Carrito.guardar(items);
  },
  eliminar(productoId) {
    const items = Carrito.obtener().filter(i => i.id !== productoId);
    Carrito.guardar(items);
  },
  vaciar() {
    localStorage.removeItem(CART_KEY);
    Carrito.actualizarBadge();
  },
  totalItems() {
    return Carrito.obtener().reduce((sum, i) => sum + i.cantidad, 0);
  },
  detallado() {
    return Carrito.obtener()
      .map(item => {
        const producto = getProducto(item.id);
        return producto ? { ...item, producto } : null;
      })
      .filter(Boolean);
  },
  subtotal() {
    return Carrito.detallado().reduce((sum, item) =>
      sum + (item.producto.precio * item.cantidad), 0);
  },
  actualizarBadge() {
    const badge = $('#cart-count');
    if (badge) {
      const count = Carrito.totalItems();
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  },
};

/* ---------- Helper imagen: prefiere foto real (URL) sobre SVG ---------- */
function imagenProducto(p) {
  // Si hay imagenUrl (foto real), úsala; si falla la carga, el onerror cae al SVG
  if (p.imagenUrl) {
    const fallback = (p.imagen || 'img/placeholder.svg').replace(/'/g, "\\'");
    return { src: p.imagenUrl, onerror: `this.onerror=null; this.src='${fallback}';` };
  }
  return { src: p.imagen || 'img/placeholder.svg', onerror: '' };
}

/* ---------- Renderizado de productos ---------- */
function renderProductoCard(p) {
  const ratingEstrellas = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  const stockClass = p.stock === 0 ? 'agotado' : p.stock < 5 ? 'bajo' : 'disponible';
  const stockText = p.stock === 0
    ? 'Agotado'
    : p.stock < 5
      ? `Solo quedan ${p.stock}`
      : 'En stock';

  // La landing ya no muestra precios (viven en el ecommerce real): solo
  // conservamos los badges que no dependen del precio.
  const badges = [];
  if (p.masVendido) badges.push(`<span class="badge-pill ambar">+ VENDIDO</span>`);
  if (p.destacado && !p.masVendido) badges.push(`<span class="badge-pill azul">DESTACADO</span>`);

  const img = imagenProducto(p);
  return `
    <article class="producto-card" data-id="${p.id}">
      <a href="${SNEL_ECOMMERCE.catalogo}" class="imagen">
        <img src="${img.src}" onerror="${img.onerror}" alt="${escapeHTML(p.nombre)}" loading="lazy" referrerpolicy="no-referrer">
        ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
      </a>
      <div class="info">
        <div class="marca">${escapeHTML(p.marca)}</div>
        <h3><a href="${SNEL_ECOMMERCE.catalogo}">${escapeHTML(p.nombre)}</a></h3>
        <div class="rating">
          <span class="estrellas">${ratingEstrellas}</span>
          <span>${p.rating.toFixed(1)}</span>
          <span class="reviews-count">(${p.reviews})</span>
        </div>
        <div class="stock-info ${stockClass}">${stockText}</div>
        <div class="acciones">
          <a href="${SNEL_ECOMMERCE.catalogo}" class="btn btn-primary btn-sm">
            Ver más →
          </a>
        </div>
      </div>
    </article>
  `;
}

/* ---------- Logo inline (hereda fuente Montserrat de la página) ---------- */
/* Esquema fondo OSCURO (header/footer/sidebar): escudo y "seguridad" en blanco;
   SNEL (wordmark vectorizado del arte de marca) y candado en turquesa #27ADAA. */
const LOGO_INLINE_WHITE = `
  <svg viewBox="0 0 292 124" xmlns="http://www.w3.org/2000/svg" class="logo-svg" role="img" aria-label="Snel Seguridad">
    <g transform="translate(8 12)">
      <path d="M40 2 L74 13 Q78 14.5 78 19 L78 45 Q78 67 40 87 Q2 67 2 45 L2 19 Q2 14.5 6 13 Z" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/>
      <path d="M30 36 L30 29 Q30 18 40 18 Q50 18 50 29 L50 36" fill="none" stroke="#27ADAA" stroke-width="5" stroke-linecap="round"/>
      <rect x="25" y="36" width="30" height="24" rx="5" fill="#27ADAA"/>
      <circle cx="40" cy="46" r="3.4" fill="#0F1419"/>
      <rect x="38.7" y="46" width="2.6" height="8" rx="1.2" fill="#0F1419"/>
    </g>
    <g transform="translate(100 18) scale(0.58)"><path d="M195.1,98.6C162.9,95.8 141.7,60.3 154.7,31.4C156.7,27.1 157.3,25.9 159.2,23.2C179.8,-8.1 226.6,-5.0 243.6,28.7C244.4,30.5 245.2,32.1 245.2,32.5C245.2,32.8 245.4,33.5 245.7,34.1C246.0,34.7 246.6,36.5 247.0,38.1C247.6,40.5 247.8,41.0 248.3,41.0C249.0,41.0 249.0,40.5 249.1,22.1C249.1,8.8 249.3,3.1 249.5,2.8C250.1,2.2 266.1,2.1 267.0,2.8C267.5,3.1 267.6,5.7 267.6,40.2C267.6,76.0 267.6,77.2 268.2,77.7C268.8,78.2 270.2,78.3 284.6,78.4C302.7,78.4 299.9,77.7 305.9,84.3C309.9,88.7 309.9,88.5 307.6,90.6C299.8,98.0 302.9,97.3 275.3,97.3C251.5,97.3 250.2,97.3 249.7,96.7C249.2,96.2 249.2,93.8 249.2,69.9C249.2,41.9 249.2,42.5 247.6,43.9C246.3,45.0 243.1,46.0 237.7,46.8C236.6,47.0 235.5,47.3 235.3,47.5C234.8,47.9 232.5,48.6 227.4,49.7C222.2,50.9 220.5,51.3 216.0,52.5C213.8,53.0 211.6,53.5 211.2,53.5C210.7,53.5 210.1,53.7 209.8,53.8C209.5,54.0 207.9,54.4 206.4,54.7C204.9,55.0 203.2,55.5 202.7,55.7C202.2,56.0 201.3,56.2 200.7,56.2C200.0,56.2 199.3,56.3 199.1,56.5C199.0,56.6 197.5,57.1 195.8,57.5C194.2,57.9 192.3,58.4 191.6,58.5C190.9,58.7 190.0,58.9 189.5,58.9C189.1,58.9 188.6,59.0 188.5,59.2C188.4,59.3 187.7,59.5 187.0,59.6C185.7,59.8 184.1,60.2 181.8,60.9C181.0,61.1 179.6,61.4 178.6,61.5C174.6,62.1 175.2,64.9 180.7,70.1C191.9,80.7 208.4,80.4 219.6,69.3C221.8,67.2 221.7,67.2 228.5,65.9C231.5,65.3 236.5,64.3 239.7,63.7C246.9,62.2 247.0,62.3 245.3,66.4C244.9,67.5 244.2,69.3 243.8,70.4C243.4,71.5 242.9,72.6 242.6,72.9C242.4,73.2 241.6,74.5 240.8,75.8C237.2,81.8 231.1,88.1 225.5,91.4C221.9,93.5 215.1,96.7 214.1,96.7C213.7,96.7 213.3,96.8 213.2,97.0C213.1,97.2 211.4,97.6 206.0,98.3C202.9,98.8 198.3,98.9 195.1,98.6zM30.4,97.6C14.4,95.3 2.9,84.3 1.6,70.3C1.2,65.4 0.4,65.8 10.4,65.5C20.6,65.3 20.2,65.2 20.6,68.5C22.1,82.4 50.6,83.0 53.5,69.2C55.0,62.5 51.3,60.6 32.4,58.5C11.4,56.2 0.7,45.2 2.4,27.8C5.6,-4.8 63.4,-8.0 69.7,24.1C71.0,30.8 71.3,30.5 63.3,30.8C60.0,31.0 56.5,31.1 55.5,31.2C52.9,31.4 52.3,31.1 51.8,29.4C50.8,25.4 47.8,22.4 43.5,21.0C38.6,19.4 29.0,20.1 26.8,22.2C26.3,22.7 25.7,23.1 25.5,23.1C23.5,23.1 20.9,27.3 21.0,30.3C21.1,36.6 24.2,38.4 37.5,40.1C58.8,42.9 67.9,48.2 71.7,60.2C72.6,62.8 72.6,71.3 71.8,73.7C71.5,74.7 71.2,75.7 71.2,76.0C71.2,76.3 70.8,77.6 70.2,78.8C69.7,79.9 69.2,81.0 69.2,81.1C69.2,82.9 58.6,92.6 55.5,93.5C54.9,93.7 53.4,94.5 52.2,95.2C51.7,95.4 51.0,95.6 50.6,95.6C50.2,95.6 49.8,95.8 49.7,96.0C48.9,97.3 35.9,98.4 30.4,97.6zM77.0,97.0C76.3,96.7 76.3,96.7 76.3,49.6C76.4,2.5 76.4,2.5 82.9,2.4C86.5,2.4 89.8,2.4 90.2,2.5C90.9,2.7 92.4,4.7 98.1,12.9C98.9,14.2 100.5,16.4 101.5,17.9C102.5,19.4 104.5,22.2 105.9,24.2C107.3,26.3 109.2,29.0 110.1,30.3C111.0,31.6 112.3,33.4 112.9,34.3C113.5,35.2 114.3,36.3 114.6,36.8C115.2,37.5 121.0,46.1 126.2,53.5C129.5,58.4 129.3,60.3 129.3,29.8C129.4,10.9 129.5,3.1 129.8,2.8C130.5,2.0 146.9,2.1 147.6,3.0C148.7,4.1 148.4,96.1 147.3,96.8C145.7,97.9 134.1,97.6 133.1,96.4C132.1,95.4 129.4,91.8 129.4,91.5C129.4,91.4 127.6,88.7 125.3,85.5C120.6,78.8 117.3,74.0 113.7,68.7C110.9,64.6 104.8,55.8 102.0,51.7C94.1,40.2 94.9,38.2 94.6,70.4C94.5,96.8 94.5,96.8 93.6,97.0C92.4,97.4 77.9,97.3 77.0,97.0zM177.4,43.0C180.7,42.1 186.2,40.7 202.8,36.6C219.6,32.5 219.5,32.5 219.7,31.6C220.0,29.8 212.6,25.0 206.9,23.4C201.8,21.9 190.9,22.6 189.8,24.5C189.7,24.6 189.2,24.7 188.7,24.7C186.6,24.7 176.6,32.7 176.6,34.5C176.6,34.7 176.3,35.2 176.0,35.6C175.2,36.5 172.9,41.5 172.9,42.4C172.9,43.7 174.1,43.8 177.4,43.0z" fill="#27ADAA"/></g>
    <text x="190" y="103" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="27" font-weight="600" font-style="italic" fill="#FFFFFF" letter-spacing="0.3">seguridad</text>
  </svg>
`;

/* Esquema fondo CLARO (header claro, estilo ecommerce): escudo y "seguridad"
   en gris oscuro; candado se mantiene en turquesa de marca. */
const LOGO_INLINE_DARK = `
  <svg viewBox="0 0 292 124" xmlns="http://www.w3.org/2000/svg" class="logo-svg" role="img" aria-label="Snel Seguridad">
    <g transform="translate(8 12)">
      <path d="M40 2 L74 13 Q78 14.5 78 19 L78 45 Q78 67 40 87 Q2 67 2 45 L2 19 Q2 14.5 6 13 Z" fill="none" stroke="#1A1F26" stroke-width="5" stroke-linejoin="round"/>
      <path d="M30 36 L30 29 Q30 18 40 18 Q50 18 50 29 L50 36" fill="none" stroke="#27ADAA" stroke-width="5" stroke-linecap="round"/>
      <rect x="25" y="36" width="30" height="24" rx="5" fill="#27ADAA"/>
      <circle cx="40" cy="46" r="3.4" fill="#FFFFFF"/>
      <rect x="38.7" y="46" width="2.6" height="8" rx="1.2" fill="#FFFFFF"/>
    </g>
    <g transform="translate(100 18) scale(0.58)"><path d="M195.1,98.6C162.9,95.8 141.7,60.3 154.7,31.4C156.7,27.1 157.3,25.9 159.2,23.2C179.8,-8.1 226.6,-5.0 243.6,28.7C244.4,30.5 245.2,32.1 245.2,32.5C245.2,32.8 245.4,33.5 245.7,34.1C246.0,34.7 246.6,36.5 247.0,38.1C247.6,40.5 247.8,41.0 248.3,41.0C249.0,41.0 249.0,40.5 249.1,22.1C249.1,8.8 249.3,3.1 249.5,2.8C250.1,2.2 266.1,2.1 267.0,2.8C267.5,3.1 267.6,5.7 267.6,40.2C267.6,76.0 267.6,77.2 268.2,77.7C268.8,78.2 270.2,78.3 284.6,78.4C302.7,78.4 299.9,77.7 305.9,84.3C309.9,88.7 309.9,88.5 307.6,90.6C299.8,98.0 302.9,97.3 275.3,97.3C251.5,97.3 250.2,97.3 249.7,96.7C249.2,96.2 249.2,93.8 249.2,69.9C249.2,41.9 249.2,42.5 247.6,43.9C246.3,45.0 243.1,46.0 237.7,46.8C236.6,47.0 235.5,47.3 235.3,47.5C234.8,47.9 232.5,48.6 227.4,49.7C222.2,50.9 220.5,51.3 216.0,52.5C213.8,53.0 211.6,53.5 211.2,53.5C210.7,53.5 210.1,53.7 209.8,53.8C209.5,54.0 207.9,54.4 206.4,54.7C204.9,55.0 203.2,55.5 202.7,55.7C202.2,56.0 201.3,56.2 200.7,56.2C200.0,56.2 199.3,56.3 199.1,56.5C199.0,56.6 197.5,57.1 195.8,57.5C194.2,57.9 192.3,58.4 191.6,58.5C190.9,58.7 190.0,58.9 189.5,58.9C189.1,58.9 188.6,59.0 188.5,59.2C188.4,59.3 187.7,59.5 187.0,59.6C185.7,59.8 184.1,60.2 181.8,60.9C181.0,61.1 179.6,61.4 178.6,61.5C174.6,62.1 175.2,64.9 180.7,70.1C191.9,80.7 208.4,80.4 219.6,69.3C221.8,67.2 221.7,67.2 228.5,65.9C231.5,65.3 236.5,64.3 239.7,63.7C246.9,62.2 247.0,62.3 245.3,66.4C244.9,67.5 244.2,69.3 243.8,70.4C243.4,71.5 242.9,72.6 242.6,72.9C242.4,73.2 241.6,74.5 240.8,75.8C237.2,81.8 231.1,88.1 225.5,91.4C221.9,93.5 215.1,96.7 214.1,96.7C213.7,96.7 213.3,96.8 213.2,97.0C213.1,97.2 211.4,97.6 206.0,98.3C202.9,98.8 198.3,98.9 195.1,98.6zM30.4,97.6C14.4,95.3 2.9,84.3 1.6,70.3C1.2,65.4 0.4,65.8 10.4,65.5C20.6,65.3 20.2,65.2 20.6,68.5C22.1,82.4 50.6,83.0 53.5,69.2C55.0,62.5 51.3,60.6 32.4,58.5C11.4,56.2 0.7,45.2 2.4,27.8C5.6,-4.8 63.4,-8.0 69.7,24.1C71.0,30.8 71.3,30.5 63.3,30.8C60.0,31.0 56.5,31.1 55.5,31.2C52.9,31.4 52.3,31.1 51.8,29.4C50.8,25.4 47.8,22.4 43.5,21.0C38.6,19.4 29.0,20.1 26.8,22.2C26.3,22.7 25.7,23.1 25.5,23.1C23.5,23.1 20.9,27.3 21.0,30.3C21.1,36.6 24.2,38.4 37.5,40.1C58.8,42.9 67.9,48.2 71.7,60.2C72.6,62.8 72.6,71.3 71.8,73.7C71.5,74.7 71.2,75.7 71.2,76.0C71.2,76.3 70.8,77.6 70.2,78.8C69.7,79.9 69.2,81.0 69.2,81.1C69.2,82.9 58.6,92.6 55.5,93.5C54.9,93.7 53.4,94.5 52.2,95.2C51.7,95.4 51.0,95.6 50.6,95.6C50.2,95.6 49.8,95.8 49.7,96.0C48.9,97.3 35.9,98.4 30.4,97.6zM77.0,97.0C76.3,96.7 76.3,96.7 76.3,49.6C76.4,2.5 76.4,2.5 82.9,2.4C86.5,2.4 89.8,2.4 90.2,2.5C90.9,2.7 92.4,4.7 98.1,12.9C98.9,14.2 100.5,16.4 101.5,17.9C102.5,19.4 104.5,22.2 105.9,24.2C107.3,26.3 109.2,29.0 110.1,30.3C111.0,31.6 112.3,33.4 112.9,34.3C113.5,35.2 114.3,36.3 114.6,36.8C115.2,37.5 121.0,46.1 126.2,53.5C129.5,58.4 129.3,60.3 129.3,29.8C129.4,10.9 129.5,3.1 129.8,2.8C130.5,2.0 146.9,2.1 147.6,3.0C148.7,4.1 148.4,96.1 147.3,96.8C145.7,97.9 134.1,97.6 133.1,96.4C132.1,95.4 129.4,91.8 129.4,91.5C129.4,91.4 127.6,88.7 125.3,85.5C120.6,78.8 117.3,74.0 113.7,68.7C110.9,64.6 104.8,55.8 102.0,51.7C94.1,40.2 94.9,38.2 94.6,70.4C94.5,96.8 94.5,96.8 93.6,97.0C92.4,97.4 77.9,97.3 77.0,97.0zM177.4,43.0C180.7,42.1 186.2,40.7 202.8,36.6C219.6,32.5 219.5,32.5 219.7,31.6C220.0,29.8 212.6,25.0 206.9,23.4C201.8,21.9 190.9,22.6 189.8,24.5C189.7,24.6 189.2,24.7 188.7,24.7C186.6,24.7 176.6,32.7 176.6,34.5C176.6,34.7 176.3,35.2 176.0,35.6C175.2,36.5 172.9,41.5 172.9,42.4C172.9,43.7 174.1,43.8 177.4,43.0z" fill="#27ADAA"/></g>
    <text x="190" y="103" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="27" font-weight="600" font-style="italic" fill="#1A1F26" letter-spacing="0.3">seguridad</text>
  </svg>
`;

/* ---------- Cliente logueado: helper ---------- */
function clienteSesion() {
  try {
    if (!window.Api || !Api.clientes || !Api.clientes.logueado()) return null;
    return JSON.parse(localStorage.getItem('snel_cliente_perfil') || 'null');
  } catch (_) { return null; }
}

/* ---------- Header y Footer (inyección común) ---------- */
// Lista curada para el nav de categorías: mismas 7 que muestra el rediseño
// (Inicio + camaras/alarmas/porteros/biometricos/accesos/cercos/redes). El
// resto de categorías sigue disponible desde el catálogo.
const NAV_CATEGORIAS_HOME = ['camaras', 'alarmas', 'porteros', 'biometricos', 'accesos', 'cercos', 'redes'];

// Lista curada para la columna "Categorías" del footer: mismos textos que ya
// tenía, pero el link sale del campo `url` de cada categoría en data.js (la
// misma referencia que usa la sección "Explora nuestras categorías").
const FOOTER_CATEGORIAS = [
  { id: 'camaras',    texto: 'Cámaras de seguridad en Loja y Ecuador' },
  { id: 'alarmas',    texto: 'Alarmas de Seguridad' },
  { id: 'incendio',   texto: 'Alarmas Contra Incendio' },
  { id: 'cercos',     texto: 'Cercos Eléctricos' },
  { id: 'accesos',    texto: 'Control de Acceso y Asistencia' },
  { id: 'garage',     texto: 'Motores para Garage' },
  { id: 'equiposred', texto: 'Equipos de Redes' },
];

function renderHeader(paginaActiva = '') {
  // Toda la navegación de cuenta/carrito/catálogo apunta directo al
  // ecommerce real (snel.loxafree.com): la landing ya no simula su propia
  // sesión ni su propio carrito.
  const itemsMenu = `
        <a href="${SNEL_ECOMMERCE.cuenta}" class="btn btn-primary btn-block" style="margin-bottom:10px;">Iniciar sesión</a>
        <div style="text-align:center; font-size:13px; color:#64748b; margin-bottom: 10px;">
          ¿Cliente nuevo? <a href="${SNEL_ECOMMERCE.cuenta}" style="color:#19706F; font-weight:600;">Crear cuenta</a>
        </div>
        <hr class="menu-sep">
        <a href="${SNEL_ECOMMERCE.carrito}" class="menu-item"><i class="ph ph-package icono"></i>Mis pedidos</a>
        <a href="${SNEL_ECOMMERCE.cuenta}" class="menu-item"><i class="ph ph-gear icono"></i>Mi perfil</a>
      `;

  const catsNav = NAV_CATEGORIAS_HOME.map(id => CATEGORIAS.find(c => c.id === id)).filter(Boolean);

  return `
    <header class="header">
      <div class="header-top">
        <div class="container">
          <span><i class="ph ph-truck"></i>Envíos a todo el país</span>
          <span><i class="ph ph-phone"></i>${SNEL_CONFIG.telefono} · ${SNEL_CONFIG.horario}</span>
        </div>
      </div>
      <div class="header-main">
        <div class="container">
          <a href="${SNEL_ECOMMERCE.home}" class="logo" aria-label="${SNEL_CONFIG.empresa}">
            ${LOGO_INLINE_WHITE}
          </a>
          <a href="${SNEL_ECOMMERCE.catalogo}" class="btn-catalogo">Comprar aquí <i class="ph-bold ph-arrow-right"></i></a>
          <div class="header-actions">
            <div class="cuenta-menu-wrap" id="cuenta-wrap">
              <button class="header-link cuenta-btn" id="cuenta-btn" type="button" aria-haspopup="true" aria-expanded="false">
                <i class="ph ph-user-circle"></i>
                <span class="cuenta-texto">Hola, <strong>identifícate</strong><br><span class="cuenta-sub">Cuenta y pedidos ▾</span></span>
              </button>
              <div class="cuenta-menu" id="cuenta-menu" hidden>
                ${itemsMenu}
              </div>
            </div>
            <a href="${SNEL_ECOMMERCE.carrito}" class="cart-icon" aria-label="Carrito">
              <i class="ph ph-shopping-cart-simple"></i><span>Carrito</span>
            </a>
          </div>
        </div>
      </div>
      <nav class="nav-categorias" aria-label="Categorías de productos">
        <div class="container">
          <a href="${SNEL_ECOMMERCE.home}" class="${paginaActiva==='inicio'?'activo':''}"><i class="ph ph-house-line"></i>Inicio</a>
          ${catsNav.map(c => `
            <a href="${c.url || SNEL_ECOMMERCE.catalogo}" class="${paginaActiva===c.id?'activo':''}"><i class="ph ${c.iconoClase}"></i>${c.nombreNav || c.nombre}</a>
          `).join('')}
        </div>
      </nav>
    </header>
  `;
}

function renderFooter() {
  const año = new Date().getFullYear();
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-logo">${LOGO_INLINE_WHITE}</div>
            <p class="descripcion">Tu aliado en seguridad electrónica en Loja, Zamora y todo Ecuador. Cámaras, alarmas, cercos eléctricos, control de acceso y muchos productos más con instalación profesional y soporte garantizado.</p>
            <div class="footer-redes">
              <a href="${SNEL_CONFIG.facebook}" aria-label="Facebook">f</a>
              <a href="${SNEL_CONFIG.instagram}" aria-label="Instagram"><i class="ph ph-instagram-logo"></i></a>
              <a href="https://wa.me/${SNEL_CONFIG.whatsapp}" aria-label="WhatsApp"><i class="ph-fill ph-whatsapp-logo"></i></a>
            </div>
          </div>
          <div>
            <h4>Categorías</h4>
            <ul>
              ${FOOTER_CATEGORIAS.map(fc => {
                const cat = CATEGORIAS.find(c => c.id === fc.id);
                const url = (cat && cat.url) || SNEL_ECOMMERCE.catalogo;
                return `<li><a href="${url}">${fc.texto}</a></li>`;
              }).join('')}
            </ul>
          </div>
          <div>
            <h4>Empresa</h4>
            <ul>
              <li><a href="#nosotros">Sobre SNEL Seguridad</a></li>
              <li><a href="#preguntas">Preguntas frecuentes</a></li>
              <li><a href="#testimonios">Trabajos realizados</a></li>
              <li><a href="${SNEL_ECOMMERCE.catalogo}">Catálogo</a></li>
              <li><a href="terminos.html">Términos y condiciones</a></li>
              <li><a href="privacidad.html">Política de privacidad</a></li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <ul class="footer-contacto">
              <li><i class="ph ph-phone"></i>${SNEL_CONFIG.telefono} / +593 99 021 5603</li>
              <li><i class="ph ph-envelope-simple"></i>${SNEL_CONFIG.email}</li>
              <li><i class="ph ph-clock"></i>${SNEL_CONFIG.horario}</li>
              ${(SNEL_CONFIG.sucursales || []).map(s => `<li><i class="ph ph-map-pin"></i><a href="${s.mapa}" target="_blank" rel="noopener">${s.nombre} · ${s.direccion} · Cómo llegar</a></li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div>© ${año} ${SNEL_CONFIG.empresa}. Todos los derechos reservados. · <a href="${SNEL_ECOMMERCE.admin}" style="color: #8b9a9e; font-size: 12px;">Admin</a></div>
          <div class="metodos-pago">
            <span>VISA</span>
            <span>MASTERCARD</span>
            <span>PAYPHONE</span>
            <span>DATAFAST</span>
            <span>TRANSFERENCIA</span>
          </div>
        </div>
      </div>
    </footer>
    <a href="https://wa.me/${SNEL_CONFIG.whatsapp}?text=Hola%20Snel%20Seguridad%2C%20me%20gustar%C3%ADa%20más%20información" class="whatsapp-float" aria-label="Escribir a SNEL Seguridad por WhatsApp">
      <i class="ph-fill ph-whatsapp-logo"></i><span class="texto">Escríbenos por WhatsApp</span>
    </a>
  `;
}

/* ---------- Toast ---------- */
function mostrarToast(mensaje) {
  const existing = $('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="icono">✓</span><span>${escapeHTML(mensaje)}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

/* ---------- Dropdown "Mi cuenta" ---------- */
function bindCuentaMenu() {
  const wrap = document.getElementById('cuenta-wrap');
  const btn  = document.getElementById('cuenta-btn');
  const menu = document.getElementById('cuenta-menu');
  if (!wrap || !btn || !menu) return;

  const cerrar = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const abrir  = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? abrir() : cerrar();
  });
  // Cerrar al click fuera
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) cerrar();
  });
  // Cerrar con Escape
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  // Logout
  const logoutBtn = document.getElementById('btn-logout-cliente');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        Api.clientes.logout();
        localStorage.removeItem('snel_cliente_perfil');
      } catch (_) {}
      // Re-render header sin recargar la página
      location.reload();
    });
  }
}

/* ---------- Inicialización común ---------- */
function initLayout(paginaActiva = '') {
  window.__snelLayoutInit = true;  // marca que la página ya montó su layout
  // Soporta ambos esquemas: #header-slot/#footer-slot y #header/#footer
  const headerSlot = $('#header-slot') || $('#header');
  const footerSlot = $('#footer-slot') || $('#footer');
  if (headerSlot) headerSlot.innerHTML = renderHeader(paginaActiva);
  if (footerSlot) footerSlot.innerHTML = renderFooter();
  Carrito.actualizarBadge();
  bindCuentaMenu();
  // Sincronizar favoritos en background si hay sesión
  if (typeof SnelFav !== 'undefined') SnelFav.sincronizar();
}

/* ---------- Red de seguridad: auto-montar header/footer ----------
   Algunas páginas (legales, contacto) no llamaban a initLayout() y se
   quedaban sin header ni footer. Si al cargar el DOM nadie montó el
   layout y existe un slot, lo montamos automáticamente. Las páginas que
   sí llaman a initLayout() lo hacen de forma síncrona antes de este
   evento (marcan __snelLayoutInit), por lo que no hay doble render. */
(function autoMontarLayout() {
  function montar() {
    if (window.__snelLayoutInit) return;
    const haySlot = document.getElementById('header-slot') || document.getElementById('header')
                 || document.getElementById('footer-slot') || document.getElementById('footer');
    if (haySlot) initLayout(window.__snelPaginaActiva || '');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(montar, 0));
  } else {
    setTimeout(montar, 0);
  }
})();
