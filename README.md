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

## Deploy (Vercel)

- `VITE_API_URL=https://<hub>.up.railway.app` (env de build — redeploy con
  cache limpio al cambiarla).
- Agrega el dominio de Vercel a `API_ALLOWED_ORIGINS` en Railway.
