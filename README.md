# RestauranteOS

Gestión de restaurantes — satélite de
[contabilidad-os](https://github.com/juanjobarroeta/contabilidad-os).

React/Vite SPA **sin base de datos, sin auth propio y sin lógica contable
propia**: todo vive en el hub (contabilidad-os) y se consume por HTTPS con un
bearer JWT, siguiendo `docs/INTEGRATION-GUIDE-SATELLITE-APPS.md` del hub. El
módulo se gatea por empresa con `CompanyModule(modulo = RESTAURANTE)`.

## Qué hace

- **Comandas (POS)** — órdenes de mesa / llevar / domicilio, partidas con
  precio congelado, agregar platillos, cobro con propina y forma de pago
  (efectivo / tarjeta / transferencia / cortesía). Cada cobro postea al libro
  del hub: ingresos A&B + IVA + propinas (pasivo) + costo de venta teórico con
  descarga de inventario por receta.
- **Cocina (KDS)** — cola por estación (cocina / barra / postres), flujo por
  partida `PENDIENTE → EN PREPARACIÓN → LISTO → ENTREGADO`, auto-refresh.
- **Menú** — categorías, platillos y **recetas**; costeo teórico, food-cost %
  y margen contra el costo promedio vigente de los insumos; toggle "86" de
  disponibilidad diaria.
- **Insumos** — inventario con costo promedio móvil y stock mínimo.
- **Compras** — orden de compra a proveedor → **recibir** (alimenta stock +
  costo promedio + asiento almacén/IVA acreditable/acreedores) → **pagar**
  (asiento acreedores/caja-bancos + movimiento bancario conciliado).
- **Facturación CFDI** — una orden cobrada se timbra desde el POS contra el
  endpoint existente del hub (`POST /api/facturas`, Facturapi, idempotente) y
  queda ligada al CFDI.
- **Dashboard** — ventas del día, food cost real, propinas, top platillos,
  insumos bajo mínimo y compras por pagar.

## Desarrollo

```bash
npm install
cp .env.example .env   # apunta VITE_API_URL al hub
npm run dev            # http://localhost:5173
```

Requisitos en el hub (una vez, ver `docs/RESTAURANTE.md` en contabilidad-os):

1. Rama del hub con el módulo RESTAURANTE desplegada + `prisma db push`.
2. `API_ALLOWED_ORIGINS` incluye el origen de este satélite
   (`http://localhost:5173` en dev).
3. Módulo habilitado en tu empresa:
   `node scripts/enable-restaurante-module.mjs <RFC>`.

Inicia sesión con tu usuario de contabilidad-os — no hay registro aquí.

## Importar un menú (onboarding de un restaurante nuevo)

El menú completo de un restaurante se carga en un comando. Playbook:

1. Crear la Company en contabilidad-os (RFC, razón social, régimen, CP).
2. Habilitar el módulo: `node scripts/enable-restaurante-module.mjs <RFC>`
   (repo del hub).
3. Extraer su carta a un JSON con la forma de `data/menu-mifamilia.json`
   (categorías → items con nombre, precio IVA-incluido, descripción y
   estación COCINA/BARRA/POSTRES).
4. Cargar:

```bash
API_URL=https://<hub>.up.railway.app \
EMAIL=tu@correo.com PASSWORD=... \
node scripts/import-menu.mjs data/menu-mifamilia.json --rfc <RFC> [--dry-run]
```

Idempotente (lo existente se salta por nombre); `--update-prices` sincroniza
cambios de precio en re-corridas. Las recetas se capturan después en Menú →
Editar, cuando el restaurante quiera costeo por platillo.

## Deploy (Railway)

El repo trae `railway.json`: Nixpacks corre `npm ci && npm run build` y el
start sirve `dist/` con fallback SPA (`serve -s`).

1. Nuevo servicio en Railway apuntando a este repo.
2. Variable `VITE_API_URL=https://<hub>.up.railway.app` — es env de **build**:
   cualquier cambio requiere redeploy.
3. Genera el dominio público del servicio y agrégalo a `API_ALLOWED_ORIGINS`
   del hub (exacto: `https://<satelite>.up.railway.app`, sin slash final).

(También funciona en Vercel/Netlify como estático: build `npm run build`,
output `dist/`, rewrite de todas las rutas a `/index.html`.)
