#!/usr/bin/env node
/**
 * Bulk menu importer — the onboarding tool for a new restaurant.
 *
 * Reads a menu JSON (see data/menu-mifamilia.json for the shape) and loads it
 * into the hub via the same bearer API the app uses. Idempotent: existing
 * categories/items (matched by name) are skipped, so re-running is safe.
 * With --update-prices, items whose price changed are PATCHed instead.
 *
 * Usage:
 *   API_URL=https://<hub>.up.railway.app \
 *   EMAIL=tu@correo.com PASSWORD=... \
 *   node scripts/import-menu.mjs data/menu-mifamilia.json --rfc XAXX010101000 [--update-prices] [--dry-run]
 *
 * Replication playbook for a NEW restaurant:
 *   1. Create the Company in contabilidad-os (RFC, razón social, régimen, CP)
 *   2. Enable the module: node scripts/enable-restaurante-module.mjs <RFC> (hub repo)
 *   3. Extract their menu into a JSON like data/menu-mifamilia.json
 *   4. Run this script → the POS is sellable in minutes
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const rfc = (args[args.indexOf("--rfc") + 1] ?? "").toUpperCase().trim();
const updatePrices = args.includes("--update-prices");
const dryRun = args.includes("--dry-run");

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const die = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };

if (!file) die("Uso: node scripts/import-menu.mjs <menu.json> --rfc <RFC>");
if (!rfc || args.indexOf("--rfc") === -1) die("Falta --rfc <RFC de la empresa>");
if (!EMAIL || !PASSWORD) die("Define EMAIL y PASSWORD (credenciales de contabilidad-os) en el entorno");

const menu = JSON.parse(readFileSync(file, "utf8"));

async function api(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) ? JSON.stringify(data.error) : `${res.status}`;
    throw new Error(`${opts.method ?? "GET"} ${path} → ${msg}`);
  }
  return data;
}

async function main() {
  console.log(`\n═══ Importar menú: ${menu.restaurante ?? file} ═══\n`);

  // 1. Login + resolve company
  const login = await api("/api/auth/token", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const company = login.companies.find((c) => c.rfc === rfc);
  if (!company) die(`Tu usuario no tiene acceso a ninguna empresa con RFC ${rfc}`);
  if (!company.modulos?.includes("RESTAURANTE")) {
    die(`La empresa ${company.razonSocial} no tiene el módulo RESTAURANTE habilitado`);
  }
  const token = login.token;
  const companyId = company.id;
  console.log(`✓ Empresa: ${company.razonSocial} (${rfc})`);

  // 2. Existing state (idempotency by name)
  const [existingCats, existingItems] = await Promise.all([
    api(`/api/restaurante/menu/categorias?companyId=${companyId}`, { token }),
    api(`/api/restaurante/menu/items?companyId=${companyId}`, { token }),
  ]);
  const catByName = new Map(existingCats.map((c) => [c.nombre.toLowerCase(), c]));
  const itemByName = new Map(existingItems.map((i) => [i.nombre.toLowerCase(), i]));

  let stats = { catNew: 0, itemNew: 0, itemSkip: 0, itemPrice: 0 };

  for (const cat of menu.categorias) {
    let catRow = catByName.get(cat.nombre.toLowerCase());
    if (!catRow) {
      console.log(`+ Categoría: ${cat.nombre}`);
      if (!dryRun) {
        catRow = await api("/api/restaurante/menu/categorias", {
          method: "POST", token,
          body: { companyId, nombre: cat.nombre, orden: cat.orden ?? 0 },
        });
      } else {
        catRow = { id: null };
      }
      stats.catNew++;
    }

    for (const item of cat.items) {
      const existing = itemByName.get(item.nombre.toLowerCase());
      if (existing) {
        if (updatePrices && existing.precio !== item.precio) {
          console.log(`  ~ ${item.nombre}: $${existing.precio} → $${item.precio}`);
          if (!dryRun) {
            await api(`/api/restaurante/menu/items/${existing.id}`, {
              method: "PATCH", token, body: { precio: item.precio },
            });
          }
          stats.itemPrice++;
        } else {
          stats.itemSkip++;
        }
        continue;
      }
      console.log(`  + ${item.nombre} — $${item.precio}`);
      if (!dryRun) {
        await api("/api/restaurante/menu/items", {
          method: "POST", token,
          body: {
            companyId,
            nombre: item.nombre,
            precio: item.precio,
            descripcion: item.descripcion ?? null,
            categoriaId: catRow.id,
            estacion: item.estacion ?? cat.estacion ?? "COCINA",
          },
        });
      }
      stats.itemNew++;
    }
  }

  console.log(
    `\n✅ Listo${dryRun ? " (dry-run, nada escrito)" : ""}: ` +
    `${stats.catNew} categorías nuevas, ${stats.itemNew} platillos nuevos, ` +
    `${stats.itemSkip} ya existían${updatePrices ? `, ${stats.itemPrice} precios actualizados` : ""}\n`
  );
}

main().catch((e) => die(e.message));
