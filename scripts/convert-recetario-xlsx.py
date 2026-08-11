#!/usr/bin/env python3
"""
Convierte un recetario en el "Formato Comandas" (hojas: Recetas, Platillos,
Ingredientes, Preparaciones) a un JSON importable por import-recetas.mjs.

Uso:
  python3 scripts/convert-recetario-xlsx.py <recetario.xlsx> <salida.json>

Normaliza:
  - unidades a G / ML / PZA ("2 kilos"→2000 G, "un cuarto de pieza"→0.25 PZA,
    "2 cucharadas"→30 ML, "1 cucharadita"→5 ML, "Pizca"/"Sazonar"→1 G nominal)
  - nombres de ingrediente duplicados (Espinaca/Espinacas, Camarón/Camarones…)
  - líneas repetidas del mismo insumo en una receta (se suman)

Las "Bases / Masas" (pesto, bechamel, focaccia, masa de pizza…) se tratan como
INSUMOS de producción interna: los platillos las consumen; su costo se fija a
mano (o vía compra) hasta que exista producción de sub-recetas en el hub. A
cada pizza se le agrega 1 "Masa de pizza (bola)" porque el recetario lista
solo los toppings.
"""

import json
import re
import sys
import unicodedata

import openpyxl

# ── Nombre canónico de insumos (merge de variantes) ──────────────────────────
CANON = {
    "espinacas": "Espinaca",
    "champiñones": "Champiñón",
    "camarones": "Camarón",
    "camarón limpio": "Camarón",
    "arugula": "Arúgula",
    "jamon serrano": "Jamón serrano",
    "almendra en rebanadas": "Almendra rebanada",
    "parmesano": "Queso parmesano",
    "bechamel": "Salsa bechamel",
    "salsa bechamel": "Salsa bechamel",
    "grano de elote": "Elote en grano",
    "pechuga": "Pechuga de pollo",
    "pollo": "Pechuga de pollo",
    "lechuga italiana y sangría": "Lechuga italiana",
    "mezcla de lechugas con radicchio": "Mezcla de lechugas",
    "sal fina": "Sal",
    "queso pizza": "Queso mozzarella",
    "contadina": "Salsa de tomate",
    "hoja de albahaca": "Albahaca",
    "aceite de ajo": "Aceite de ajo",
    "ajillo": "Aceite de ajo",
    "perejil picado": "Perejil",
    "perejil seco": "Perejil",
    "queso philadelphia": "Queso crema",
}

# Mapeo recetario → nombre del platillo en el menú cargado
MENU_MAP = {
    ("Ensaladas", "CAPRESE"): "Ensalada Caprese",
    ("Ensaladas", "MI FAMILIA"): "Ensalada Mi Familia",
    ("Ensaladas", "FRUTASTIKA"): "Ensalada Frutastika",
    ("Ensaladas", "FRESKI"): "Ensalada La Freski",
    ("Ensaladas", "POKE BOWL"): "Poke Bowl",
    ("Ensaladas", "PLAYACAR"): "Ensalada PlayaCar",
    ("Ensaladas", "DE FEDE"): "Ensalada De Fede",
    ("Pizzas", "HAWAIANA"): "Pizza Hawaiana",
    ("Pizzas", "ANIMALIN"): "Pizza Animalin",
    ("Pizzas", "PIZZA POBLANA"): "Pizza Poblana",
    ("Pizzas", "CAMARONSINI"): "Pizza Camaronsini",
    ("Pizzas", "CARNIVORA"): "Pizza Carnívora",
    ("Pizzas", "PIENSA EN VERDE"): "Pizza Piensa en Verde",
    ("Pizzas", "PALERMO"): "Pizza Palermo",
    ("Pizzas", "COS"): "Pizza Cos",
    ("Pizzas", "DEL CERRO"): "Pizza Del Cerro",
    ("Pizzas", "LOBUKI"): "Pizza Lobuki",
    ("Pizzas", "MI FAMILIA"): "Pizza Mi Familia",
    ("Pastas", "AL PESTO"): "Pasta Al Pesto",
    ("Pastas", "POBLANA"): "Pasta Poblana",
    ("Pastas", "4 QUESOS"): "Pasta 4 Quesos",
    ("Pastas", "QUECHIPOTLE"): "Pasta Quechipotle",
    ("Pastas", "ALFREDO"): "Pasta Alfredo",
    ("Pastas", "PASTA BIRRIA"): "Pasta Birria",
    ("Pastas", "PASTA MI FAMILIA"): "Pasta Mi Familia",
    ("Pastas", "POMODORO"): "Pasta Pomodoro",
    ("Sándwiches", "SANDWICH DE CARNES FRIAS"): "Focaccia Carnes Frías",
    ("Sándwiches", "CHORIPAN"): "Choripán",
}

MASA_PIZZA = "Masa de pizza (bola)"

NUM_WORDS = {
    "un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "media": 0.5, "medio": 0.5,
}


def canon(nombre: str) -> str:
    key = nombre.strip().lower()
    return CANON.get(key, nombre.strip())


def parse_cantidad(raw: str):
    """'250 gramos' → (250, 'G'); 'Un cuarto de pieza' → (0.25, 'PZA'); …"""
    s = unicodedata.normalize("NFKC", str(raw)).strip().lower()
    if not s:
        return None
    if s in ("pizca", "sazonar", "al gusto"):
        return (1, "G")  # nominal: costo ≈ 0, aparece en la receta
    if "un octavo" in s:
        return (0.125, "PZA")
    if "un cuarto" in s:
        return (0.25, "PZA")
    if s.startswith("media ") or s.startswith("medio "):
        return (0.5, "PZA")
    m = re.match(r"^([\d.,]+)\s*([a-záéíóúñ()\s]*)$", s.split("(")[0].strip())
    if not m:
        # "110 gramos o 4-5 hojas" → toma la primera medida
        m = re.match(r"^([\d.,]+)\s*([a-záéíóúñ]+)", s)
        if not m:
            return (1, "PZA")
    qty = float(m.group(1).replace(",", "."))
    unit = m.group(2).strip()
    if unit.startswith("gramo") or unit == "gr" or unit == "g":
        return (qty, "G")
    if unit.startswith("kilo") or unit == "kg":
        return (qty * 1000, "G")
    if unit.startswith("mililitro") or unit == "ml":
        return (qty, "ML")
    if unit.startswith("litro"):
        return (qty * 1000, "ML")
    if unit.startswith("cucharadita"):
        return (qty * 5, "ML")
    if unit.startswith("cucharada"):
        return (qty * 15, "ML")
    if unit.startswith(("pieza", "diente", "hoja", "ramita", "rebanada", "porción", "porcion")) or unit == "":
        return (qty, "PZA")
    return (qty, "PZA")


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb["Recetas"]

    insumos = {}   # nombre → {"unidad": U}
    recetas = {}   # menuItem → {insumo: cantidad}
    bases = {}     # nombre base → lineas (documental, no se importa como platillo)

    def ensure_insumo(nombre, unidad):
        row = insumos.setdefault(nombre, {"unidad": unidad})
        if row["unidad"] != unidad:
            # conflicto G vs ML vs PZA: gana el primero; se avisa
            print(f"  aviso: «{nombre}» usa {row['unidad']} y {unidad}; se queda {row['unidad']}")
        return row

    for r in ws.iter_rows(min_row=2, values_only=True):
        categoria, platillo, _, ingrediente, cantidad = (r[0], r[1], r[2], r[3], r[4])
        if not platillo or not ingrediente:
            continue
        categoria = str(categoria).strip()
        platillo = str(platillo).strip()
        nombre = canon(str(ingrediente))
        parsed = parse_cantidad(cantidad)
        if not parsed:
            continue
        qty, unidad = parsed

        if "bases" in categoria.lower():
            bases.setdefault(platillo, []).append(
                {"insumo": nombre, "cantidad": qty, "unidad": unidad}
            )
            ensure_insumo(nombre, unidad)
            continue

        menu_item = MENU_MAP.get((categoria, platillo))
        if not menu_item:
            print(f"  aviso: receta sin platillo en el menú: {categoria} / {platillo}")
            continue
        ensure_insumo(nombre, unidad)
        receta = recetas.setdefault(menu_item, {})
        receta[nombre] = round(receta.get(nombre, 0) + qty, 4)  # duplicados se suman

    # Toda pizza consume una bola de masa (el recetario solo lista toppings)
    ensure_insumo(MASA_PIZZA, "PZA")
    for item in list(recetas):
        if item.startswith("Pizza "):
            recetas[item].setdefault(MASA_PIZZA, 1)

    # Insumos de producción interna que las recetas consumen
    for interno in ("Pesto", "Salsa bechamel", "Focaccia", "Espinacas a la crema",
                    "Chimichurri", "Salsa de tomate", "Caldo", "Carne",
                    "Bolitas de carne", "Papas a la francesa", "Quinoa"):
        if interno in insumos:
            insumos[interno]["produccionInterna"] = True

    out = {
        "fuente": src.split("/")[-1],
        "insumos": [
            {"nombre": n, **v} for n, v in sorted(insumos.items())
        ],
        "recetas": [
            {
                "menuItem": item,
                "lineas": [
                    {"insumo": n, "cantidad": q} for n, q in sorted(lineas.items())
                ],
            }
            for item, lineas in sorted(recetas.items())
        ],
        "bases": [
            {"nombre": n, "lineas": ls} for n, ls in sorted(bases.items())
        ],
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"✅ {dst}: {len(out['insumos'])} insumos, {len(out['recetas'])} recetas, "
        f"{len(out['bases'])} bases de producción"
    )


if __name__ == "__main__":
    main()
