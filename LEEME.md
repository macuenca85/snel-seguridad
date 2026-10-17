# Landing Snel Seguridad — carpeta de trabajo independiente

Esta carpeta es una **copia fiel solo de la landing** (`index.html`), extraída del
proyecto completo `Web Snel seguridad`. Contiene únicamente lo que la portada
necesita para verse y funcionar igual que en la web, sin el resto de la tienda
(catálogo, carrito, checkout, cuenta, admin) ni el backend PHP.

Es independiente: puedes trabajarla sin afectar tu proyecto original.

## Cómo abrirla

Opción rápida: doble clic en `index.html`.

Opción recomendada (evita errores de caché con imágenes):

```bash
cd "Landing Snel seguridad"
python3 -m http.server 8000
# luego abre http://localhost:8000/?demo=1
```

El `?demo=1` activa el modo demo (datos simulados), igual que en el proyecto grande.

## Qué incluye

- `index.html` — la landing.
- `css/styles.css` — todos los estilos.
- `js/` — los 8 archivos que carga la portada: data, app, cookies, analytics,
  api, demo-mode, leads, chatbot.
- `img/` — favicon, fondos del hero, testimonios, íconos de categorías y las
  imágenes de producto que aparecen en "destacados / más vendidos".

## Nota importante sobre los enlaces del menú y el footer

Como aquí SOLO está la landing, los enlaces del header y del footer (Catálogo,
Carrito, Contacto, etc.) apuntan a páginas que no existen en esta carpeta, así
que darán "no encontrado" si haces clic. Es lo esperado en una landing aislada.

Si quieres, puedo redirigir esos botones a tu tienda real (snelseguridad.store)
o a WhatsApp — solo pídemelo.
