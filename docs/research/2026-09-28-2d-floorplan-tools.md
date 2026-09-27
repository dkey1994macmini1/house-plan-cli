# Research: narzędzia 2D do rzutów mieszkań — inspiracje dla `house-plan-cli`

**Data:** 2026-09-28
**Cel:** zebrać sprawdzone wzorce z istniejących narzędzi (komercyjnych i open-source) dla deterministycznego CLI, które LLM wykorzysta jako tool do authoringu rzutów 2D (MVP: jedna kondygnacja, ortogonalne ściany, JSON + SVG + raport walidacji; PDF później).

**Metoda:** 4 strumienie badawcze (komercyjne modele domenowe, open-source CAD + formaty, walidacja/building codes, wymiarowanie + eksport). Inline search + extract; brak `delegate_task` w runtime leaf-a. Źródła sprawdzone ręcznie.

---

## 1. Przydatne wzorce

### 1.1 Model domenowy — minimalna ortogonalna ściana

Sweet Home 3D (DTD modelu obiektowego) i Floorplanner v3 (TypeScript) niezależnie potwierdzają ten sam minimalny shape ściany: **dwa punkty końcowe (axis line), grubość, wysokość, kolekcja otworów przypisana do ściany (nie osobna topologia)**.

- Sweet Home 3D `Wall`: `xStart/yStart/xEnd/yEnd`, `thickness`, `height`, `wallAtStart`, `wallAtEnd`, `getPoints()` (corner polygon), `getLength()`. JavaDoc.
- Floorplanner v3 `Wall extends GenericLine`: `a: Point`, `b: Point`, `thickness: number // in cm`, `balance: number // 0..1` (przesunięcie grubości względem osi), `openings: Opening[]` (`Door` | `Window`), `az: Endpoint3D { z, h }`, `bz: Endpoint3D { z, h }`, opcjonalny `c: Point` dla krzywej Béziera.
- openPlan3D (laanlabs) — TypeScript `Project → walls/areas/surfaces/dimensions/items/labels`. Export DXF z dedykowanymi warstwami.

**Implikacja dla CLI:** ściana jako encja pierwszorzędna, otwory (`door`/`window`) jako dzieci ściany z pozycją parametryczną `t ∈ [0,1]` wzdłuż linii ściany. To rozwiązanie wybiera też BULC Building Designer (MCP tool dla LLM: `xStart/yStart/xEnd/yEnd/thickness/height/level`).

### 1.2 Dwie warstwy modelu: persistent vs derived

Floorplanner jawnie rozróżnia:
- **persistent** — to, co zapisujesz (walls, openings, items, labels, dimensions)
- **runtime** — to, co engine wylicza (areas z zamkniętych obwodów walls, outline'y, tekstury)

**Implikacja dla CLI:** MVP zapisuje tylko `walls + openings + furniture + room-labels` (user intent). **Areas, room polygons, dimension lines, overlap warnings** — wyliczane deterministycznie przy każdym renderze/walidacji. To daje LLM-owi swobodę edycji bez niespójności.

### 1.3 Pozycjonowanie otworów: parametryczne `t` względem ściany

Floorplanner + Schematex zgadzają się: opening ma `(refid, width, z, z_height, t)`, gdzie `t=0` to środek nad endpoint `a`, `t=1` nad endpoint `b`. Schematex dodaje warianty:
- `at 50%` (procent wzdłuż ściany)
- `from start 0.30` (metry od początku)
- `before/after otherOpening` (referencja do wcześniej zdefiniowanego otworu)

**Implikacja dla CLI:** JSON otworu przechowuje zarówno `t` (do render), jak i `from_start` (do diagnostyki czytelnej dla LLM). Openings muszą być **clamped** do segmentu ściany z warningiem, jeśli wykraczają.

### 1.4 Auto-merge współdzielonych ścian (topologia)

Schematex: `room living at 0,0 size 5x4` + `extend living at 5,2 size 2x2` → kształt L; ściany po stronie Seam **scalają się w jeden band**, a powierzchnia jest sumowana. Rozszerzenie, które nie dotyka pokoju albo zachodzi na niego, jest **odrzucone z quantified error**. To daje LLM-owi precyzyjny feedback.

**Implikacja dla CLI:** przy `validate` engine liczy faktyczny zarys (`footprint`) z zestawu ścian, nie ufa deklaratywnym `room.poly`. Raport mówi „ściana W3 nie jest częścią żadnego zamkniętego obwodu — dangling" albo „zachodzą dwie ściany o 12 cm w osi".

### 1.5 Domyślne typy z walidacją

Schematex ma małą, zakrywającą 80% katalog (`bed-double`, `sofa`, `toilet`, `bathtub`, `stairs-l`). Każdy z domyślnymi wymiarami zgodnymi z Neufert/ANSI. BULC i openPlan3D idą w tę samą stronę — bounded vocabulary > free-form.

**Implikacja dla CLI:** wbudowany katalog symboli z **named footprints** (np. `bed-double: 1.40×2.00 m`). Custom wymaga `size` jawnie. Walidator może odrzucić mebel, którego bounding box nie mieści się w pokoju (overlap check).

### 1.6 Layer naming dla DXF eksportu

openPlan3D: `WALLS (7)`, `DOORS (30)`, `WINDOWS (5)`, `FURNITURE (3)`, `DIMENSIONS (8)`, `ROOMS (4)` — AutoCAD Color Index, polyline/arc/line/text. To rozsądna mapa.

AIA CAD Layer Guidelines (U.S. NCS) + ISO 13567 definiują bardziej rygorystyczną konwencję: `<discipline>-<major>-<minor>-<status>` z placeholderami dla nieużywanych pól (`A-WALL-FULL-TEXT-N`). W MVP nie trzeba pełnego NCS — ale warto, żeby **warstwy w SVG grupowały się analogicznie** (`<g id="walls">`, `<g id="openings">`).

### 1.7 Schemat JSON wejściowy — strict + small

BULC Building Designer używa Zod do walidacji inputu MCP toola — każde pole ma opis, default i required flag. Sweet Home 3D używa DTD z `REQUIRED`/`IMPLIED` atrybutami i `CDATA` typami. Floorplanner pisze Typescript interfaces z komentarzami (np. `// in cm`).

**Implikacja dla CLI:** 
- JSON Schema dla inputu (NIE TypeScript types — Effect CLI + JSON to główne wejście dla LLM)
- jednostki deklarowane jawnie na korzeniu (`"unit": "m"`) lub na obiekcie (`"thickness_cm": 12`)
- każde pole liczbowe z komentarzem w `$comment` JSON Schema lub w osobnym `docs/spec.md`

### 1.8 Diagnostyka jako język

Schematex: błędy z **mierzoną wartością**, np. *„Extension at 5,2 does not touch room living (gap 0.12m)"*. FloorDraft (DXF exporter): *„non-positive or non-finite calibration"*, *„missing referenced wall"*, *„linked openings outside their wall"*, *„overlapping openings on the same wall"* — ostrzeżenia oddzielone od błędów (`estimated dimensions and free openings are warnings rather than silent claims of accuracy`).

**Implikacja dla CLI:** raport walidacji to lista structured diagnostic objects: `{severity: "error"|"warning"|"info", code: "WALL_DANGLING", message, location: {entity_id, point?}, measured?: {value, unit, limit}}`. LLM może parsować i poprawiać bez czytania prose.

### 1.9 Skale i jednostki (FloorDraft hard lesson)

FloorDraft trzyma **mm-per-pixel** calibration i eksportuje z mnożnikiem na jednostkę pliku (mm/cm/m). Y-flip (Y-down → Y-up) wpływa nie tylko na punkty, ale też na **kąty mebli i swing arcs drzwi**. Trzy różne scales: drawing coords, viewport zoom, print scale — **tylko pierwszy** należy do modelu.

**Implikacja dla CLI:**
- `unit` na korzeniu JSON; konwersja tylko na granicy eksportu
- koordynaty w prawoskrętnym układzie matematycznym (Y-up, X-right) — bliżej CAD
- osobny `--scale 1:50` dopiero przy renderze SVG/PDF
- tekst-wymiarów i door arcs: konwersja wysokości tekstu przechodzi tę samą ścieżkę co geometria (nie osobna)

### 1.10 Otwory, które wycinają ścianę (vs symbol)

FloorDraft: opening powiązany ze ścianą **wycina** geometrię ściany w renderze. Wolny opening (bez wall ref) → symbol + warning. To musi przeżyć eksport.

**Implikacja dla CLI:** `opening.wallId` wymagane dla door/window; `opening.type: "decorative"` dla symboli nieinwazyjnych. Walidator odrzuca openingi bez `wallId` chyba że są jawne `decorative`.

---

## 2. Czego NIE kopiować do MVP

| Anty-wzorzec | Źródło | Dlaczego nie |
|---|---|---|
| **3D / camera / lighting / environment** | Sweet Home 3D (camera, observerCamera, environment, lightSource), Planner 5D | MVP = jedna kondygnacja, rzut 2D. Cała sekcja `environment`, `camera*`, `lightSource` to szum dla CLI. |
| **Materiały, tekstury, shininess, baseboards** | Sweet Home 3D `HomeTexture`, `WallSideDecor`, Floorplanner `TextureProps`, `WallTexture` | MVP: jednokolorowe wypełnienia, opcjonalnie `fill: "#color"`. Wszystkie PBR/atlasy to osobna iteracja. |
| **Curved walls (Bézier `c: Point`), 3D openings, multi-storey** | Floorplanner `Endpoint3D {z, h}`, `c`, Sweet Home 3D `arcExtent`, `heightAtEnd` | MVP = ortogonalne, jedna kondygnacja. Ograniczenie trzeba **wymusić** w walidatorze, nie tylko usunąć z UI. |
| **Furniture catalog z setkami symboli** | Schematex ma ~120 typów, Sweet Home 3D ma katalog | MVP: 6-10 najczęstszych (bed, sofa, table, toilet, sink, stove, fridge, bathtub). Reszta = custom `size` + `id`. |
| **AI room recognition / scan-to-plan** | Planner 5D B2B API | Poza zakresem. LLM sam ustala layout, nie odwrotnie. |
| **Runtime vs persistent file format podział** | Floorplanner | MVP jest single-format — wszystko jest persistent, derived jest memoizowany ale nie osobny plik. |
| **DWG eksport** | Planner 5D (beta), LibreCAD | PDF/SVG/DXF wystarczą. DWG to closed binary, overkill. |
| **Many settings toggles (showGrid, useMetric, showShadows3D, …)** | Floorplanner `ProjectSettings` ma 35+ flag | MVP: tylko `unit`, `precision` (decimal places), ewentualnie `northArrow`. Reszta to output renderer config. |
| **Asset library + refid system** | Floorplanner `refid → asset`, openPlan3D | MVP nie ma marketplace; custom = `furniture { id, type: "sofa", size, label? }`. |
| **Multi-user / permissions / owner history** | IFC `OwnerHistory`, Planner 5D user mgmt | MVP jest local-first, single-user, single-file. |

---

## 3. Źródła / URL-e

### Modele domenowe (wysokie confidence — primary)

| Narzędzie | URL | Co wyciągnięto |
|---|---|---|
| Sweet Home 3D `Wall.java` (javadoc) | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/Wall.html | `xStart/yStart/xEnd/yEnd/thickness/height/wallAtStart/wallAtEnd/getPoints/getLength` |
| Sweet Home 3D `HomeXMLHandler` (DTD) | https://www.sweethome3d.com/jsdoc/symbols/HomeXMLHandler.html | Pełny DTD: home → walls/rooms/polylines/dimensionLines/labels; atrybuty z `#REQUIRED/#IMPLIED` |
| Floorplanner v3.0 Specification | https://floorplanner.readme.io/reference/v30-specification | TS interfaces: `Project/Floor/Floorplan/Wall/Opening/Dimension/Area/Surface/Item/Label` + runtime vs persistent split |
| Floorplanner `createproject` / `importproject` | https://floorplanner.readme.io/reference/importproject | (kontekst API dla persistence) |
| IFC 4 IfcWall (buildingSMART) | https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD1/HTML/schema/ifcsharedbldgelements/lexical/ifcwall.htm | IfcWall + IfcWallStandardCase (axis + sweptSolid), IfcRelVoidsElement + IfcOpeningElement dla drzwi/okien |
| IFC 4 IfcSpace | https://github.com/buildingSMART/IFC4.3.x-development/blob/master/docs/schemas/core/IfcProductExtension/Entities/IfcSpace.md | Model przestrzeni (alternatywa do naszych `room`) |

### Open-source (wysokie confidence — implementacje do wglądu)

| Narzędzie | URL | Co wyciągnięto |
|---|---|---|
| Schematex (floorplan engine, source-defined) | https://schematex.js.org/docs/floorplan | DSL: `floorplan/room/wall/door/window/furniture`; auto-merge ścian; `between A B` resolver; placement `at/right-of/before/after`; BNF gramatyki |
| openPlan3D (laanlabs) | https://github.com/laanlabs/openPlan3D + https://deepwiki.com/laanlabs/openPlan3D/6.2-export-formats-png-svg-pdf-dxfdwg-json | Export pipeline: JSON native, SVG/PNG/PDF/DXF; DXF layers WALLS=7, DOORS=30, WINDOWS=5, FURNITURE=3, DIMENSIONS=8, ROOMS=4; Y-flip w cadExport.ts:50 |
| FreeCAD BIM `Arch.py` / `ArchWall.py` | https://github.com/FreeCAD/FreeCAD/blob/main/src/Mod/BIM/Arch.py | (referencja dla implementacji później) |
| BULC Building Designer MCP server | https://glama.ai/mcp/servers/using76/BULC_MCP/tools/bulc_create_wall | **Najbliższy wzorzec dla naszego CLI**: MCP tool schema z `xStart/yStart/xEnd/yEnd/thickness/height/level`; Zod validation; Z-axis elevation |
| FloorDraft DXF export guide | https://dev.to/dev_truth_f4c8f876c/a-floor-plan-is-more-than-pixels-getting-dxf-exports-to-preserve-meaning-1kmg | Acceptance checklist (mm/cm/m parity, structural check, orientation, view-independence); rejects z `non-finite calibration`, `missing wall ref`, `openings outside wall`, `overlapping openings` |

### Formaty / standardy

| Standard | URL | Co wyciągnięto |
|---|---|---|
| ISO 129-1:2018 (dimensioning) | https://www.iso.org/standard/64007.html | Extension lines, dimension lines, witness lines; liczby w mm bez jednostki; nie kopiujemy pełnego standardu — wystarczy konwencja |
| ISO 128 (linework) | (płatny) | Reference, do późniejszej implementacji |
| AIA CAD Layer Guidelines / U.S. NCS v3 | http://www.close-range.com/docs/US_National_CAD_Standard_V3.pdf | Layer naming z placeholderami; ISO 13567 conformance; status field (N=new, A=existing, D=demo…) |
| Paul Bourke DXF minimal | https://paulbourke.net/dataformats/dxf/min3d.html | (referencja dla DXF, nie wyciągnięto) |

### Building codes (walidacja — średnie confidence dla PL, wysokie dla US)

| Code | URL | Co wyciągnięto |
|---|---|---|
| IRC 2024 Egress Window (R310) | https://www.jaspector.com/codes/irc-2024/ch03-building-planning/egress-window-requirements-irc-2024/ | min 5.7 sqft opening, 20" min width, 24" min height, 44" max sill |
| IRC 2018 Egress (R310.2) | https://www.jaspector.com/codes/irc-2018/ch03-building-planning/egress-window-minimum-size-irc-2018/ | j.w. |
| WindowCalcs (calculator) | https://windowcalcs.com/calculators/egress-window-calculator/ | (encoding error — nie wyciągnięto) |
| PL: Rozporządzenie WT 2019/1065 | https://www.infor.pl/akt-prawny/DZU.2019.110.0001065 | §72-§94: minimalne powierzchnie mieszkalne (pokój dzienny 16m², sypialnia 8m², kuchnia min wymiary), wysokość 2,5m |
| PL: tekst jednolity WT 2024 | https://architektura.info/pl/prawo/warunki_techniczne_budynki | (encoding error) |
| PL: PN-83/B-03430 wentylacja | https://www.jelwent.pl/pliki/pn03430.pdf | (referencja) |

### Inne / kontekst

| | URL | Notatka |
|---|---|---|
| RoomSketcher JSON help | https://roomsketch3d.com/help/share-and-export/export-json + https://roomsketch3d.com/help/getting-started/import-json-file | Format zamknięty, publicznie dostępne tylko ogólne info („dimensions, positions and labels are safe to change. Don't change IDs"). Niska confidence co do struktury. |
| Planner 5D B2B API | https://support.planner5d.com/en/articles/15189751-planner-5d-b2b-api-technical-overview | Format wewnętrzny niepubliczny; eksport do IFC/DWG/DXF async |

---

## 4. Implikacje dla `command surface` i `diagnostics`

### 4.1 Komendy (Effect CLI subcommands)

Wzorzec: **operacje czytelne dla LLM, atomowe, idempotentne, z JSON output**.

```
house-plan init                     # tworzy pusty plan z unit, north
house-plan plan add-wall --from-json '...'
house-plan plan add-opening --wall-id W3 --type door --t 0.5 --width 0.9
house-plan plan add-room --id living --at 0,0 --size 5.2x4.2
house-plan plan add-furniture --type sofa --in living --at 0.25,2.9
house-plan validate                  # → raport.json + exit code
house-plan render svg --out plan.svg --scale 1:50 --with-dimensions
house-plan render json --out plan.pretty.json   # resolved (areas, derived walls)
house-plan report --format text|json|md
```

**Wzorce z open-source:**
- BULC: jeden `*_create_*` tool na encję, schema jest deklaratywna, Zod-walidowana
- Floorplanner: `importproject` (z JSON) i `createproject` (pusty) jako osobne operacje
- Schematex: cały pipeline to jeden source → validate → render; my rozbijamy na subcommands

**Reguły:**
1. Każdy `add-*` ma flagę `--from-json` dla złożonych przypadków (LLM może przekazać cały obiekt)
2. Każdy `add-*` zwraca `entity` (z wygenerowanym `id`) i **listę warnings** (np. „door clamps to wall")
3. `validate` zwraca structured report, **exit code 0** nawet przy warnings, **!=0** przy errors
4. `render` jest **derived** — ten sam input JSON daje zawsze ten sam SVG (deterministic)
5. Brak globalnych flag typu `--all`; każda operacja jawnie mówi co dotyczy

### 4.2 Diagnostics (raport walidacji)

Wzorzec z FloorDraft + Schematex + BULC: **każdy wpis ma `code`, `severity`, `message`, `location`, opcjonalnie `measured`**.

```json
{
  "summary": { "errors": 1, "warnings": 3, "info": 0 },
  "diagnostics": [
    {
      "code": "WALL_DANGLING",
      "severity": "error",
      "message": "Wall W7 has no connected wall at endpoint (2.00, 0.00)",
      "location": { "wallId": "W7", "endpoint": "a" }
    },
    {
      "code": "OPENING_OUTSIDE_WALL",
      "severity": "error",
      "message": "Door D2 spans beyond wall W3 (extends 0.12m past endpoint b)",
      "location": { "openingId": "D2", "wallId": "W3" },
      "measured": { "value": 0.12, "unit": "m", "limit": 0 }
    },
    {
      "code": "OPENING_CLAMPED",
      "severity": "warning",
      "message": "Window W2 width 1.50m exceeds available wall length 1.40m; clamped to 1.40m",
      "location": { "openingId": "W2", "wallId": "W4" }
    },
    {
      "code": "ROOM_NOT_CLOSED",
      "severity": "error",
      "message": "Room 'kitchen' has gap in its outline at (3.20, 1.40), distance 0.08m",
      "location": { "roomId": "kitchen" },
      "measured": { "value": 0.08, "unit": "m" }
    },
    {
      "code": "FURNITURE_OUT_OF_BOUNDS",
      "severity": "error",
      "message": "Sofa S1 extends 0.20m outside room living (south side)",
      "location": { "furnitureId": "S1", "roomId": "living" }
    }
  ]
}
```

**Kody dla MVP** (minimum, do rozszerzenia):

| Code | Sev | Kiedy |
|---|---|---|
| `JSON_INVALID` | error | schema validation failed |
| `WALL_DUPLICATE_ENDPOINT` | warning | dwa walls dzielą oba endpointy (podejrzane) |
| `WALL_DANGLING` | warning | endpoint nie łączy się z inną ścianą |
| `WALL_OVERLAPPING` | warning | dwie ściany pokrywają się na >X cm |
| `WALL_NON_ORTHOGONAL` | error | kąt ≠ 90° (dla MVP strict) |
| `OPENING_OUTSIDE_WALL` | error | opening wykracza poza `t ∈ [0,1]` |
| `OPENING_OVERLAPPING` | error | dwa openingi na tej samej ścianie zachodzą |
| `OPENING_CLAMPED` | warning | opening ścięty, bo przekraczał rozmiar |
| `ROOM_NOT_CLOSED` | error | polygon pokoju ma gap > tolerancji |
| `ROOM_DUPLICATE` | warning | dwa pokoje mają wspólną powierzchnię >50% |
| `FURNITURE_OUT_OF_BOUNDS` | warning | mebel wystaje poza pokój |
| `FURNITURE_COLLIDES` | warning | dwa meble nachodzą |
| `UNIT_MISMATCH` | error | wykryto mieszane jednostki |
| `CODE_ROOM_MIN_AREA` | info | pokój poniżej normy (jeśli country=PL) |
| `CODE_EGRESS_WINDOW` | info | brak okna spełniającego IRC R310 (jeśli country=US) |

**Reguła ważna:** errors = blokuje render (lub renderuje z markerami), warnings = renderuje z adnotacją. LLM może używać samych warnings do iteracyjnego dopracowywania.

### 4.3 Command surface — co odrzucić w MVP

- ❌ `plan undo/redo` (LLM sam trzyma historię w kontekście)
- ❌ `plan import dxf` (format wyłącznie eksportowy w MVP)
- ❌ `plan optimize` / `plan auto-layout` (antynomia: CLI nie generuje)
- ❌ `plan 3d-view` / `plan elevation` (poza zakresem MVP)
- ❌ `plan settings` subcommand (settings inline w JSON)
- ❌ Interaktywny REPL (LLM woła subcommands w pętli, nie potrzebuje shella)

### 4.4 Weryfikacja przed renderem (preconditions)

Wzorzec FloorDraft: validation przed renderem, z **odróżnieniem geometry coherence vs measurement trust**. Dla nas:
- Schema validation (JSON parse) → error natychmiast, exit 2
- Topological validation (zamknięte pokoje, dangling walls) → error, exit 3
- Code compliance (opcjonalny, `--strict-codes PL|US`) → info, render dalej
- Render wykonywany nawet przy warnings (z markerami); blokowany tylko przy errors

### 4.5 Determinism contract

Żeby LLM mógł polegać na CLI przy iteracji:
- Ten sam input → ten sam output (bit-perfect SVG; byte-identical JSON z sortowanymi kluczami)
- Timestamps tylko w raportach, nie w modelu
- ID generowane deterministycznie (np. `W${index}` po sortowaniu), **nie UUID**
- Kolejność diagnostyk stabilna (sort po `code`, potem `location.entityId`)

---

## 5. Rekomendowany minimalny JSON Schema (koncepcja)

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HousePlan",
  "type": "object",
  "required": ["version", "unit", "walls"],
  "properties": {
    "version": { "const": "1.0" },
    "unit": { "enum": ["m", "cm", "mm"], "default": "m" },
    "north": { "type": "number", "description": "compass rotation in degrees, 0=N up" },
    "walls": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "a", "b", "thickness"],
        "properties": {
          "id":        { "type": "string" },
          "a":         { "$ref": "#/$defs/point" },
          "b":         { "$ref": "#/$defs/point" },
          "thickness": { "type": "number", "exclusiveMinimum": 0 },
          "height":    { "type": "number", "exclusiveMinimum": 0, "default": 2.5 },
          "kind":      { "enum": ["exterior", "interior"], "default": "interior" },
          "openings":  { "type": "array", "items": { "$ref": "#/$defs/opening" } }
        }
      }
    },
    "rooms":    { "type": "array", "items": { "$ref": "#/$defs/room" } },
    "furniture":{ "type": "array", "items": { "$ref": "#/$defs/furniture" } },
    "labels":   { "type": "array", "items": { "$ref": "#/$defs/label" } }
  },
  "$defs": {
    "point":    { "type": "object", "required": ["x","y"], "properties": { "x": {"type":"number"}, "y": {"type":"number"} } },
    "opening":  {
      "type": "object",
      "required": ["id", "type", "wallId", "t", "width"],
      "properties": {
        "id":     { "type": "string" },
        "type":   { "enum": ["door", "window", "decorative"] },
        "wallId": { "type": "string" },
        "t":      { "type": "number", "minimum": 0, "maximum": 1, "description": "center position along wall, 0=end a, 1=end b" },
        "width":  { "type": "number", "exclusiveMinimum": 0 },
        "kind":   { "enum": ["single","double","sliding"] },         // door
        "swing":  { "enum": ["left","right"] },                       // door
        "sill":   { "type": "number", "minimum": 0, "maximum": 2.5 }  // window
      }
    },
    "room":     {
      "type": "object",
      "required": ["id", "label", "polygon"],
      "properties": {
        "id":     { "type": "string" },
        "label":  { "type": "string" },
        "polygon":{ "type": "array", "items": { "$ref": "#/$defs/point" }, "description": "ordered CCW; engine may rebuild from walls" }
      }
    },
    "furniture":{
      "type": "object",
      "required": ["id", "type", "in"],
      "properties": {
        "id":   { "type": "string" },
        "type": { "enum": ["bed-double","sofa","table","toilet","sink","stove","fridge","bathtub","custom"] },
        "in":   { "type": "string", "description": "room id" },
        "at":   { "$ref": "#/$defs/point" },
        "size": { "type": "object", "properties": { "w": {"type":"number"}, "d": {"type":"number"} } },
        "rotate":{ "type": "number", "default": 0 }
      }
    },
    "label": { "type": "object", "required": ["text","at"], "properties": { "text": {"type":"string"}, "at": {"$ref":"#/$defs/point"}, "fontSize":{"type":"number"} } }
  }
}
```

**Kluczowe decyzje:**
1. `walls` jest **jedynym źródłem geometrii**; `rooms[].polygon` jest derived/cache
2. `t ∈ [0,1]` jest kanonicznym pozycjonowaniem openingów
3. `unit` na korzeniu, nigdy mieszane
4. ID jako string (LLM- przyjazne), deterministyczne (np. `W1`, `W2`... w kolejności dodawania)
5. Schema waliduje types i ranges; **nie waliduje topologii** (to robi `validate`)

---

## 6. Coverage gaps / dalsze badania

- **Polskie WT 2024** — encoding strony uniemożliwił ekstrakcję pełnego tekstu; do weryfikacji §72 (wysokość), §72-§94 (mieszkaniówka: pokoje min. 8m² sypialnia, 16m² dzienny, kuchnia 4m² wnęki, łazienka 2,5m², wysokość 2,5m). Potrzebna ręczna lektura aktu.
- **Neufert / Architectural Graphic Standards** — źródła katalogowe dla domyślnych wymiarów mebli/urządzeń; Schematex je cytuje jako referencje, ale nie daje otwartej listy.
- **RoomSketcher JSON schema** — niepubl., potrzebny sample file do reverse-engineeringu (jeśli kiedyś potrzebny import).
- **Effect CLI patterns dla LLM-tool** — load skill `repo-skill-coupling` przy implementacji dla command-surface conventions.
- **Sweet Home 3D SH3D (zip) format** — archiwum zawierające Home.xml + PNG + objs; niepotrzebny w MVP, ale źródło ID generation patterns.

