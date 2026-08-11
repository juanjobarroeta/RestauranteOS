#!/usr/bin/env node
/**
 * Importa el recetario al hub: crea los insumos que falten y liga la receta
 * de cada platillo (reemplaza la receta completa del platillo — el JSON es la
 * fuente de verdad). Idempotente: re-correr deja el mismo estado.
 *
 * Entrada: el JSON generado por scripts/convert-recetario-xlsx.py
 *
 * Uso:
 *   API_URL=https://<hub>.up.railway.app EMAIL=... PASSWORD=... \
 *   node scripts/import-recetas.mjs data/recetario-mifamilia.json --rfc XAXX010101000 [--dry-run]
 *
 * Después de importar, captura los costos: Insumos → Editar → costo promedio
 * (o recibe compras reales) y el food-cost por platillo se calcula solo.
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const rfc = (args[args.indexOf("--rfc") + 1] ?? "").toUpperCase().trim();
const dryRun = args.includes("--dry-run");

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const die = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
if (!file) die("Uso: node scripts/import-recetas.mjs <recetario.json> --rfc <RFC>");
if (!rfc || args.indexOf("--rfc") === -1) die("Falta --rfc <RFC de la empresa>");
if (!EMAIL || !PASSWORD) die("Define EMAIL y PASSWORD en el entorno");

const data = JSON.parse(readFileSync(file, "utf8"));

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
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) {
    const msg = (payload && payload.error) ? JSON.stringify(payload.error) : `${res.status}`;
    throw new Error(`${opts.method ?? "GET"} ${path} → ${msg}`);
  }
  return payload;
}

async function main() {
  console.log(`\n═══ Importar recetario: ${data.fuente ?? file} ═══\n`);

  const login = await api("/api/auth/token", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const company = login.companies.find((c) => c.rfc === rfc);
  if (!company) die(`Sin acceso a una empresa con RFC ${rfc}`);
  if (!company.modulos?.includes("RESTAURANTE")) die(`${company.razonSocial} no tiene el módulo RESTAURANTE`);
  const token = login.token;
  const companyId = company.id;
  console.log(`✓ Empresa: ${company.razonSocial} (${rfc})`);

  // 1. Insumos (crear los que falten)
  const existing = await api(`/api/restaurante/insumos?companyId=${companyId}`, { token });
  const insumoByName = new Map(existing.map((i) => [i.nombre.toLowerCase(), i]));
  let created = 0;
  for (const ins of data.insumos) {
    if (insumoByName.has(ins.nombre.toLowerCase())) continue;
    console.log(`+ Insumo: ${ins.nombre} (${ins.unidad})${ins.produccionInterna ? " · producción interna" : ""}`);
    if (!dryRun) {
      const row = await api("/api/restaurante/insumos", {
        method: "POST", token,
        body: {
          companyId,
          nombre: ins.nombre,
          unidad: ins.unidad,
          categoria: ins.produccionInterna ? "Producción interna" : null,
        },
      });
      insumoByName.set(row.nombre.toLowerCase(), row);
    } else {
      insumoByName.set(ins.nombre.toLowerCase(), { id: `dry-${ins.nombre}` });
    }
    created++;
  }

  // 2. Recetas por platillo (reemplazo completo)
  const menuItems = await api(`/api/restaurante/menu/items?companyId=${companyId}`, { token });
  const itemByName = new Map(menuItems.map((m) => [m.nombre.toLowerCase(), m]));
  let linked = 0, missing = 0;
  for (const receta of data.recetas) {
    const item = itemByName.get(receta.menuItem.toLowerCase());
    if (!item) {
      console.log(`  aviso: platillo no encontrado en el menú: ${receta.menuItem}`);
      missing++;
      continue;
    }
    const lineas = [];
    for (const l of receta.lineas) {
      const ins = insumoByName.get(l.insumo.toLowerCase());
      if (!ins) { console.log(`  aviso: insumo no encontrado: ${l.insumo}`); continue; }
      lineas.push({ insumoId: ins.id, cantidad: l.cantidad });
    }
    console.log(`~ Receta: ${receta.menuItem} (${lineas.length} insumos)`);
    if (!dryRun) {
      await api(`/api/restaurante/menu/items/${item.id}`, {
        method: "PATCH", token,
        body: { receta: lineas },
      });
    }
    linked++;
  }

  console.log(
    `\n✅ Listo${dryRun ? " (dry-run, nada escrito)" : ""}: ` +
    `${created} insumos nuevos, ${linked} recetas ligadas` +
    (missing ? `, ${missing} platillos sin match` : "") + "\n"
  );
  if (data.bases?.length) {
    console.log(
      "Nota: las bases de producción (" + data.bases.map((b) => b.nombre).join(", ") + ") " +
      "quedaron como insumos de «Producción interna». Fija su costo promedio en Insumos " +
      "para que el costeo de los platillos que las usan sea completo."
    );
  }
}

main().catch((e) => die(e.message));
