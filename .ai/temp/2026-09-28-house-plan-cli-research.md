---
date: 2026-09-28T21:05:00+02:00
git_commit: 533458be8d87607a6fe37b55b086293f567d9e7c
branch: feat/house-plan-operating-skill
repository: house-plan-cli
topic: "house-plan-cli — jak działa, zalety, luki, usprawnienia skillu house-plan-cli-dk"
tags: [research, codebase, house-plan-cli, skill, cli, geometry]
status: complete
last_updated: 2026-09-28
last_updated_by: Muse Spark
---

# Research: house-plan-cli — jak działa, zalety, luki, usprawnienia skillu

**Date**: 2026-09-28T21:05:00+02:00
**Researcher**: Muse Spark
**Git Commit**: 533458be8d87607a6fe37b55b086293f567d9e7c
**Branch**: feat/house-plan-operating-skill
**Repository**: house-plan-cli

> Uwaga nazewnicza: użytkownik pytał o „home-plan-cli" — w workspace istnieje
> wyłącznie `house-plan-cli` (pakiet i binarka `house-plan`, skill
> `house-plan-cli-dk`). Cały research dotyczy `house-plan-cli`.

## Research Question

„zrob research tego jak dziala home-plan-cli, dowiedz sie jakie ma potencjalne
zalety i luki, a nastepnie sprawdz zdefiniowany tam home-plan-cli-dk skill
i powiedz mi jakie potencjalne usprawnienia bys w nim widzial"

Użytkownik explicite prosi o ocenę (zalety/luki/usprawnienia), więc ten dokument
— wyjątkowo względem domyślnej reguły „tylko dokumentuj" — zawiera także sekcje
ocenne: `## Zalety`, `## Luki` i `## Skill house-plan-cli-dk — ocena i usprawnienia`.

## Summary

`house-plan` to deterministyczny, local-first CLI (TypeScript 5.9 ESM, Effect v3,
`@effect/cli`) do autorskiego tworzenia wymiarowanych rzutów 2D przez agenta LLM.
Agent podejmuje decyzje layoutowe; CLI wyłącznie wykonuje jawne operacje na
wersjonowanym dokumencie `HousePlan` (JSON), chroni niezmienniki geometryczne,
raportuje typowane diagnostyki i renderuje deterministyczny SVG.

- Wejście: JSON array operacji `*.upsert` (9 rodzajów), wymiary w cm z krokiem
  0.1 cm, osie X prawo / Y góra.
- Zapis: transakcyjny `apply` z wymaganym `--expected-revision`, `structuredClone`
  + walidacja przed zapisem, atomowy zapis (temp sibling + rename), dokładnie
  +1 rewizji na zaakceptowany batch.
- Odczyt: `validate` (flaga + diagnostyki), `report` (pełna resolved geometria),
  `survey` (kompaktowy odczyt przestrzenny: pokoje, powierzchnie, połączenia),
  `render` (SVG per poziom + manifest).
- Kontrakt agentowy: stdout = dokładnie jedna koperta sukcesu
  `{ok,type,schemaVersion:1,data,meta}`; stderr = dokładnie jedna koperta błędu;
  kody 0/1/2/5; komendy discovery `commands` i `schema`.
- Domena: ortogonalne ściany centerline + grubość, derived faces (prostokąty),
  pokoje przez seed point, otwory na ścianie-host (offset od końca `a`),
  obiekty z rotacją 0/90/180/270 i opcjonalnym clearance, schody parowane
  cross-level + void na górze, adnotacje i linie wymiarowe.
- Cyrkulacja: graf faces łączony drzwiami i fizycznymi przerwami w ścianach;
  okna nigdy nie dają przejścia; osiągalność liczona BFS od „outside" **per storey**.
- Testy: Vitest, w tym testy realnego executabla przez `node:child_process`.

## Detailed Findings

### 1. CLI entrypoint i kontrakt (`src/bin.ts`, 543 linie)

- Cały `@effect/cli` command tree jest w `src/bin.ts:399-494`; `src/house-plan.ts`
  eksportuje tylko `projectName` (fasada re-eksportów), a `src/index.ts` to barrel.
- 8 komend: `init`, `apply`, `validate`, `render`, `report`, `survey`, `commands`,
  `schema`. `--help` jest human-readable (nie koperta).
- `CommandError` (`src/bin.ts:40-50`) niesie `type/message/hint/diagnostics?/exit`.
  `writeSuccess` (`54-64`) pisze stdout; `writeFailureAndExit` (`66-74`) pisze
  stderr i ustawia `process.exitCode`.
- Globalny adapter (`496-535`) wycisza prose `@effect/cli` (`Console.withConsole`)
  i mapuje każdy błąd na dokładnie jedną stderr-kopertę; `ValidationError`
  parsera → `invalid_input`/2 z pomocą jako message.
- `apply` (`137-228`): odczyt pliku → `JSON.parse` → `decodeOperations` (Effect
  Schema) → wymagany `--expected-revision` → `loadPlan` → `mutation.apply` →
  mapowanie `Failure→exit` (`revision_conflict|not_found→5`, `internal→1`,
  reszta →2) → **ponowna** walidacja wyniku → `dry-run` (bez zapisu, `meta.revision`
  = rewizja dyskowa) albo `savePlan` + `plan.applied`.
- `validate/report/survey` (`230-271`) nigdy nie piszą planu; `render` (`273-367`)
  rozgałęzia `--level+--out` vs `--all-levels+--out-dir`.
- `commands` (`370-389`) zwraca listę gramatyki i semantykę kodów; `schema`
  (`391-397`) emituje Draft-07 JSON Schema dla **array operacji**.

### 2. Mutacje i persistence (`mutation.ts`, `plan-file.ts`)

- `apply(plan, expectedRevision, ops)` (`mutation.ts:195-219`): konflikt rewizji →
  `Failure`; `structuredClone(plan)`; sekwencyjny `applyOne`, pierwszy błąd
  short-circuituje (transakcyjność in-memory); walidacja kandydata; sukces =
  `{...candidate, revision+1}`.
- `upsertLevel` (`42-58`) zachowuje `id` przy tej samej nazwie albo `randomUUID()`;
  nowy level dostaje `emptyStorey`. `upsertResource` (`88-183`) obsługuje 8
  pozostałych `*.upsert` przez `updateStorey` (level→storey, `not_found`/`internal`).
- Pomocniki `named/replace/withId` (`12-27`): **nazwa jest kluczem upsertu**
  w obrębie kolekcji storeya; `id` stabilne między upsertami tej samej nazwy.
- `resolution.ts:8-41`: `resolveStorey` buduje `DerivedTopology`, wiąże pokoje
  do faces przez seed, liczy bounds/area/perimeter; pokój bez face **wypada**
  z resolved (nie jest `null` — znika).
- `plan-file.ts:5-21`: `loadPlan` to `JSON.parse as HousePlan` **bez walidacji
  schematu**; `savePlan` robi `mkdir -p` + zapis do `${target}.${pid}.tmp` + `rename`
  (atomowo).
- Dry-run istnieje tylko w handlerze CLI, nie w domenie.

### 3. Kernel geometrii (`geometry.ts`, `topology.ts`, `circulation.ts`)

- `geometry.ts`: `isGridCentimetre` (`3-4`, `Number.isInteger(v*10)`),
  `boundsFromCenter/containsPoint/containsBounds/boundsOverlap/sameBounds/wallLength`.
  Trzy eksporty są **martwe** (brak użyć poza definicją): `canonicalCentimetre`,
  `hasOnlyGridCentimetres`, `extractSingleRectangularFace`.
- `topology.ts`: `deriveSplitSegments` (`61-67`) dzieli ściany w przecięciach
  H×V; `zoningExtensions` (`170-215`) wirtualnie przedłuża wolny koniec
  **interior** ściany do najbliższej prostopadłej (tylko do zoningu — nie
  persist, nie render, nie bariera); `extractOrthogonalFaces` (`218-245`)
  enumeruje **wszystkie** prostokąty z siatki unikalnych xs×ys i filtruje
  `hasClosedCellBoundary && !hasInteriorWall`; sort po y,x.
- `DerivedTopology` (`297-330`): immutable wrapper, `faceContaining` (inkluzywne
  `>=/<=`), `hasFaceBoundaryAt` (seed na granicy = ambiguous).
- `circulation.ts`: `StoreyCirculation` buduje faces raz w konstruktorze;
  `passageAccesses` (`169-189`) liczy niepokrytą ścianą długość wspólnej krawędzi
  dwóch faces; `doorAccesses` (`191-207`) tylko `type==="door"` przez `sidesOf`
  (`71-86`, midpoint otworu + testy przylegania, exterior + jedna strona =
  `[face,"outside"]`); graf BFS od outside (`40-54`); `hasExit` = stopień > 0.

### 4. Walidacja (`validation.ts`, 437 linii)

- `validate` (`418-435`) konkatenacja ~12 walidatorów, sort po `code,message`.
- Kody błędów: `LEVEL_*` (2), `NAME_DUPLICATE`, `WALL_*` (3),
  `ROOM_SEED_AMBIGUOUS`, `ROOM_FACE_NOT_FOUND`, `ROOM_WITHOUT_DOOR`,
  `ROOM_NOT_REACHABLE_FROM_ENTRY`, `OPENING_*` (4), `OBJECT_INVALID`,
  `OBJECT_WALL_COLLISION`, `DOOR_SWING_OBJECT_COLLISION`,
  `DOOR_STAIR_APPROACH_COLLISION`, `STAIR_*` (3).
- Ostrzeżenia: `OBJECT_COLLIDES`, `CLEARANCE_OBJECT_COLLISION`,
  `CLEARANCE_WALL_COLLISION`, `DOOR_SWING_CLEARANCE_COLLISION`.
- Diagnostyka ma `code/severity/message/location?/suggestion?`; pole `measured`
  z modelu (`model.ts:18`) **nigdy nie jest wypełniane**.
- Siatka 0.1 cm sprawdzana wybiórczo (ściany, offsety/width otworów, bounds
  obiektów), ale nie dla seedów pokoi ani bounds schodów/voidów.

### 5. Obiekty domenowe (`domain-objects.ts`, `model.ts`, `schema.ts`)

- `WallSegment`: `lengthCm` (Manhattan), `occupiedBounds` (centerline ± t/2),
  `containsOpening` (`offset>0 && width>0 && offset+width<length` — ostra
  nierówność, brak styku z końcem), `overlaps`, `doorGeometry` (hinged tylko;
  `sliding→undefined`; orientacja skrzydła od **autorskiego kierunku a→b**),
  `doorApproachBounds` (głębokość = szerokość drzwi, obie strony),
  `doorSwingBounds` (bbox hinge/closed/open), `openingEndpoints` (offset od `a`).
- `PlanObject`: bounds z rotacją (90/270 swap), `clearanceBounds` rotowane,
  `collidesWith/clearanceOverlaps`.
- `StairOccurrence`: `obstructsDoorApproach`, `matchesCounterpart`
  (ten sam `run` + `sameBounds` — **bit-identyczne**, zero tolerancji),
  `isContainedBy`.
- `model.ts`: typy `Point/Bounds/Diagnostic/Wall/Room/Opening/ObjectBox/Stair/
  Void/Annotation/Dimension/Storey/Level/HousePlan/Resolved*/Envelope/Failure`.
- `schema.ts`: `GridCentimetre` (filtr `isInteger(v*10)`), 9 operacji w unii,
  `OperationListSchema = Array(Operation)` (JSON **array**, nie obiekt),
  `decodeOperations`, `operationJsonSchema`. `variant` to **wolny string**;
  `hinge/swing` opcjonalne bez walidacji krzyżowej; `rotation` zamknięte do
  `0|90|180|270`; `room.type` wolny string.

### 6. Survey vs report (`survey.ts`, 292 linie)

- `surveyPlan` (`283-294`) nie waliduje ani nie modyfikuje; sort levels po `order`.
- `surveyStorey` (`158-267`): `faceId = "x,y,w,h"`, pokoje na face (strictly-inside,
  sort), `sideLabels` (`outside` / nazwy pokoi / `face:id`), `openingsTouching`
  przez `circulation.sidesOf`.
- `SurveyRoom`: `faceId|null`, wymiary/are (null gdy brak face), `exteriorDoors`,
  `windows`, `objects` (center w tym samym face).
- Agregaty: `faceAreaCm2` (każdy face raz = powierzchnia piętra),
  `roomClaimAreaCm2` (suma claimów — **podwójnie liczy** shared face),
  `connections` (door/passage z posortowanymi sides), `objectsOutsideRooms`,
  `stairs`, `voids`.

### 7. Render (`render-service.ts`, `svg-renderer.ts`, warstwy)

- `render-service.ts`: `assertNoDiagnostics` blokuje render przy **jakimkolwiek**
  error; `renderLevelToFile` (`36-46`) i `renderAllLevelsToDirectory` (`58-81`,
  `Promise.all` + `manifest.json`); błędy typowane `PlanValidationError` /
  `UnknownLevelError`.
- `svg-renderer.ts`: `svgY = -v` (inwersja Y), `escapeXml` (`&<>` tylko),
  ściany jako `<line stroke-width=thickness>`, otwory: biały cutout
  (`thickness+4`) + drzwi (liść/zawias/łuk) lub okno (2 linie ±t/4),
  labele pokoi `${name} ${area} m²` z halo i unikaniem kolizji (5 kandydatów,
  margines 15, inset 35), viewBox = bounds + padding 100/200, stała kolejność
  warstw; `<g id="rooms"></g>` **puste** (brak wypełnień pokoi); brak
  auto-wymiarów (tylko explicit `dimension.upsert`).
- `objects-layer.ts`: rotowana grupa (`rotate(-rotation)`), dashed clearance,
  rama + X + label. `circulation-layer.ts`: schody (obrys + 9 stopni + ↑/↓ run),
  void (hatch pattern + dashed).
- Determinizm: brak timestampów/losowości w SVG; kolejność = kolejność tablic.

### 8. Testy, przykłady, docs

- `tests/cli.test.ts` (570 linii): realny proces (`process.execPath` + `dist/bin.js`),
  `pnpm build` w `beforeAll`; koperta schema na stdout; błąd tylko stderr exit 2;
  `not_found` vs `revision_conflict`; single-line stderr; reference apply+render+
  conflict+reject-bez-zmian (furniture, access, stair approach); survey compact
  reading + niezmienność pliku; `commands` discovery.
- `tests/house-plan.test.ts`, `survey.test.ts`, `topology.test.ts`,
  `project.test.ts`: buildery ścian/powłok, asercje `toMatchObject` na kodach.
- `examples/reference-ground-floor-ops.json` (~850 linii): kompletny batch 2-level
  (ground 9×11 m, 10 pokoi, drzwi/okna, meble, schody+void; upper tylko void+stair).
- `docs/specs/2026-09-28-house-plan-cli-mvp.md`: 30 user stories, decyzje
  produktowe/techniczne, seams testowe. `docs/research/2026-09-28-2d-floorplan-tools.md`:
  research narzędzi 2D (Sweet Home 3D, Floorplanner, Schematex, BULC, DXF).
- `out/` zawiera eksperymenty (`usafb-40x30*`, `lshaped-230/`) i jest
  **nieignorowane** przez `.gitignore` (`git status` pokazuje `?? out/`).

## Code References

- `src/bin.ts:40-74` — `CommandError`, koperty stdout/stderr, mapowanie exitów
- `src/bin.ts:137-228` — `applyHandler` (dekodowanie, rewizja, podwójna walidacja, dry-run)
- `src/bin.ts:496-535` — wyciszenie `@effect/cli` prose, `catchAllCause` → koperta
- `src/modules/plan/mutation.ts:195-219` — transakcyjny `apply`, +1 rewizji
- `src/modules/plan/mutation.ts:12-27` — `named/replace/withId` (nazwa = klucz upsertu)
- `src/modules/filesystem/plan-file.ts:5-21` — `loadPlan` bez schematu, `savePlan` atomowy
- `src/modules/plan/geometry.ts:3-49` — siatka 0.1 cm i prymitywy; `:7,:10,:55` martwe eksporty
- `src/modules/plan/topology.ts:170-245` — `zoningExtensions` + `extractOrthogonalFaces`
- `src/modules/plan/topology.ts:297-330` — `DerivedTopology`
- `src/modules/plan/circulation.ts:40-65` — BFS od outside, `accesses()`
- `src/modules/plan/circulation.ts:71-86` — `sidesOf` (drzwi vs outside)
- `src/modules/plan/validation.ts:418-435` — agregacja i sort diagnostyk
- `src/modules/plan/domain-objects.ts:64-136` — geometria drzwi i końcówki otworów
- `src/modules/plan/schema.ts:133-157` — unia operacji, `decodeOperations`, JSON Schema
- `src/modules/plan/survey.ts:158-267` — `surveyStorey`, `faceAreaCm2` vs `roomClaimAreaCm2`
- `src/modules/render/render-service.ts:30-46` — bramka walidacyjna + zapis SVG
- `src/modules/render/svg-renderer.ts:121-129` — `renderSvg`, warstwy, viewBox
- `tests/cli.test.ts:12-30` — seam realnego executabla; `:141-423` reference E2E
- `examples/reference-ground-floor-ops.json` — kanoniczny kompletny batch
- `.agents/skills/house-plan-cli-dk/SKILL.md` — skill operacyjny + routing
- `.agents/skills/house-plan-cli-dk/references/cli-contract.md` — kontrakt wykonalny
- `.agents/skills/house-plan-cli-dk/references/operations.md` — kształty operacji
- `.agents/skills/house-plan-cli-dk/references/survey.md` — jak czytać survey
- `.agents/skills/house-plan-cli-dk/workflows/author-plan.md` — sekwencja authoringu
- `.agents/skills/house-plan-cli-dk/workflows/inspect-render.md` — diagnostyka i render

## Architecture Documentation

- **Effect na brzegach, czysta domena w środku**: `Effect.gen/tryPromise` tylko
  w `src/bin.ts`; `src/modules/plan/*` to funkcje synchroniczne i małe klasy
  domenowe; IO tylko w `plan-file.ts` i `render-service.ts`.
- **Nazwa jako klucz, id stabilne**: upserty identyfikują encje nazwą w kolekcji
  storeya; silnik generuje/utrzymuje UUID (nie deterministyczne — rozjazd z rekomendacją
  researchu „ID deterministyczne", ale stabilne między upsertami).
- **Derived, nie stored**: topologia/cyrkulacja/resolved liczone świeżo przy każdym
  `validate/resolve/survey/render`; ściany źródłowe nigdy nie mutowane; brak memoizacji.
- **Brak silent repair**: odrzut z diagnostyką zamiast clamp/snap; extension zoningu
  jawnie wyłączony z persist/render/barier.
- **Moduły**: `plan/` (12 plików: model, schema, geometry, topology, circulation,
  validation, mutation, resolution, survey, result, domain-objects, index),
  `render/` (4 pliki), `filesystem/` (1 plik). Brak `src/shared/` (zarezerwowane).
- **Konwencje**: cm 0.1 w publicznym JSON; X prawo, Y góra; SVG odwraca Y;
  `schemaVersion:1` w kopertach i planie; CLI `version:"0.1.0"`.

## Zalety (ocena na explicite życzenie)

1. **Kontrakt prawdziwie agent-first**: rozdział stdout/stderr, jedna koperta na
   wywołanie, stabilne `type`, `schemaVersion`, typowane błędy z `hint` i
   diagnostykami, discovery `commands`/`schema`, transakcyjność i dry-run.
   Testy pinują to na realnym procesie (`tests/cli.test.ts`).
2. **Determinizm**: sortowane diagnostyki i survey, deterministyczny SVG,
   brak timestampów w modelu; odrzucone mutacje zostawiają plik bajt-w-bajt
   (`cli.test.ts` to weryfikuje).
3. **Uczciwe granice**: brak generatora/autofixa; błędy zamiast clampa;
   jawne „to nie jest certyfikat budowlany" w README, skillu i kodzie.
4. **Token-ekonomia odczytu**: `survey` (kompakt) vs `report` (pełny) vs
   `validate` (tylko diagnostyka) — agent nie musi rekonstruować planu z surowego JSON.
5. **Bogata walidacja domenowa**: ~25 kodów, cyrkulacja z fizycznymi przerwami,
   kolizje drzwi-meble, podejścia do drzwi vs schody, parowanie schodów + void.
6. **Atomowe zapisy i optymistyczna współbieżność**: temp+rename, `expectedRevision`,
   dokładnie +1 na batch.
7. **Domenowe obiekty zamiast anemicznego modelu**: `WallSegment`, `PlanObject`,
   `StairOccurrence` posiadają zachowania; zgodne z `AGENTS.md`.
8. **Skill wierny executablowi**: reguła `version_drift`, jawna lista
   niezaimplementowanego, lekcje z praktyki (orientacja skrzydeł, sliding do garażu).

## Luki (ocena na explicite życzenie)

Poważne (blokują lub mylą agenta):

1. **Brak delete** — tylko upserty. Błędnej ściany/pokoju/levelu nie da się usunąć;
   eksploracja zostawia śmieci. Obejście (nadpisanie geometrii) nie zawsze istnieje.
2. **Cyrkulacja per-storey; schody nie łączą grafu** — piętro z pokojami i bez
   drzwi zewnętrznych jest zawsze `ROOM_NOT_REACHABLE_FROM_ENTRY`. Reference
   przechodzi tylko dlatego, że upper nie ma pokoi. To blokuje sensowne domy piętrowe.
3. **Tylko prostokątne faces** — L/T/poligony nieobsługiwane; pokój L to de facto
   2 faces; `zoningExtensions` tylko dla pojedynczych interior stubów. `out/lshaped-230/`
   sugeruje, że autor już o to uderzył.
4. **Render blokowany przy jakimkolwiek error** — brak draft-renderu z markerami
   (research 4.2 to rekomendował). Agent nie może *zobaczyć* zepsutego planu.
5. **`loadPlan` bez walidacji schematu** (`plan-file.ts:5-6`) + patchy grid-check
   (seedy pokoi i bounds schodów/voidów bez kontroli siatki) — ręcznie popsuty plan
   ładuje się i psuje później w mniej jasny sposób. W połączeniu z brakiem delete
   może powstać stan nie do naprawy przez CLI.
6. **`init` nadpisuje bez ostrzeżenia** (`bin.ts:103-107`) — jeden zły `init` kasuje plan.
7. **`variant`/`hinge`/`swing`/`room.type` bez walidacji wartości** — schema przyjmuje
   dowolny string, walidacja nie sprawdza; literówka `singel` przechodzi cicho, a
   `sliding` + `hinge` nie zgłasza sprzeczności. Skill twierdzi węższą listę niż kod.

Średnie (tarcia, dług technologiczny):

8. **Spec obiecuje int-mm kernel; kod używa float-cm** z `isInteger(v*10)`.
   W praktyce dla 1 miejsca po przecinku `*10` jest dokładne (losowy test 2000
   wartości: 0 faili), ale architektura nie ma kanonicznej reprezentacji int,
   a midpointy w `sidesOf` produkują wartości spoza siatki. `canonicalCentimetre`
   istnieje, ale jest martwe.
9. **Podwójna walidacja** (`mutation.apply` + ponownie w `applyHandler`) —
   redundancja i ryzyko rozjazdu komunikatów.
10. **Złożoność `extractOrthogonalFaces` O(X²·Y²)** bez memoizacji, a `DerivedTopology`
    budowany wielokrotnie na jedno `validate`/`survey`/`render`. Dla domu OK, dla
    większych planów ryzyko spowolnień.
11. **Brak `measured` w diagnostykach** mimo pola w modelu — agent nie dostaje liczb
    (o ile za krótko, jaka przerwa), tylko prose + location.
12. **Brak kolizji door-door i door-swing vs ściany/schody** — user story 14 ze speca
    („door-leaf collisions") zrealizowane tylko vs obiekty.
13. **`OBJECT_COLLIDES` to warning** — przenikające meble dają `valid:true`. Decyzja
    draft-friendly, ale agent może to uznać za akceptowalne w finale.
14. **`NAME_DUPLICATE` globalny per storey** — ściana i pokój nie mogą dzielić nazwy,
    choć spec mówi o namespace'ach per kolekcja.
15. **Schody wymagają bit-identycznych bounds** (`sameBounds`, zero tolerancji) mimo
    „plan tolerance" w specu.
16. **Pusty `<g id="rooms">`, brak auto-wymiarów** — spec user story 20 obiecuje
    automatyczne wymiary; kod ma tylko ręczne `dimension.upsert` + labele z powierzchnią.
17. **Brak stdin, single-resource commands, `--format text`** — spec je obiecuje;
    agent zawsze musi pisać pliki pośrednie.
18. **`out/` nieignorowane** w `.gitignore`; martwe eksporty w `geometry.ts`;
    dualizm `pnpm cli` (bannery) vs `node dist/bin.js` (czysty JSON).

## Skill house-plan-cli-dk — ocena i usprawnienia

### Co skill robi dobrze (stan)

- `SKILL.md`: routing na 2 workflowe, `essential_principles` (rewizja przed zapisem,
  dry-run, `data.valid` nie exit, survey-first, `faceAreaCm2` nie `roomClaimAreaCm2`),
  `schema_facts` (wymagany `level`, offset od `a`, wolny `room.type`), 5 `lessons`
  z praktyki, weryfikowalne `success_criteria`.
- `references/cli-contract.md`: tabela komend/typów, koperta błędu, exity, reguła
  `version_drift` („ufaj executablowi").
- `references/operations.md`: 9 kształtów operacji, geometria/dostęp, minimalny batch.
- `references/survey.md`: semantyka pól, shared-face, door vs passage, jednostki.
- `workflows/author-plan.md` / `inspect-render.md`: konkretne sekwencje komend
  z preview→commit→validate→render.

### Proponowane usprawnienia (na explicite życzenie)

1. **Dodać `references/diagnostics.md` (tabela kod → przyczyna → fix)** — dziś agent
   dostaje `ROOM_FACE_NOT_FOUND` i zgaduje. Tabela dla ~25 kodów z 1-2 typowymi
   przyczynami i przykładowym JSON-em korekty (jak `diagnose.md` w dealwatch/snowtrex).
   Mapować też istniejące `lessons` na kody (np. „sealed zone" → `ROOM_NOT_REACHABLE_FROM_ENTRY`).
2. **Dodać `templates/`** — gotowe `ops.json`: minimalny prostokątny pokój z drzwiami,
   drzwi w ścianie (z poprawnym offset/width/hinge/swing), para schodów + void,
   obiekt z clearance. Obecny minimalny przykład (sam level) jest za ubogi do kopiowania.
3. **Dopisać pełną tabelę orientacji skrzydeł 4×2** — lessons pokrywają ściany
   L→R i B→T; brakuje R→L i T→B. To najczęstszy błąd; tabela: kierunek a→b × in/out
   → strona otwarcia + ASCII diagram offsetu od `a`.
4. **Ostrzec o pułapce piętra bez drzwi zewnętrznych** — skill musi explicite
   powiedzieć: schody nie dają reachability; pokoje na piętrze bez exterior door
   będą invalid; podać workaround/decyzję (projektować parter-first; piętro jako
   draft z jawną listą błędów; nie „dolepiać" fikcyjnych drzwi zewnętrznych).
5. **Dodać `references/limits.md`** — twarde limity na wierzchu: tylko prostokąty,
   L = 2 faces, brak delete, brak tolerancji w schodach, `containsOpening` ostra
   nierówność (offset+width < length, brak styku z końcem), globalny NAME_DUPLICATE.
   Agent nie powinien odkrywać ich przez odrzuty.
6. **Dodać konwencję nazewniczą** — kebab-case, prefiksy per typ
   (`w-`, `d-`, `r-`?) albo domenowe (`bedroom1-east`), żeby unikać `NAME_DUPLICATE`
   i `OPENING_WALL_NOT_FOUND`. Spójne z reference fixture.
7. **Ujednolicić inwokację** — `quick_start` miesza `pnpm cli` i `node dist/bin.js`;
   workflows używają `node dist/bin.js`. Zostawić `pnpm build` + `node dist/bin.js`
   jako kanoniczne, dopisać `pnpm --silent cli` jako alternatywę (wzór: dealwatch).
8. **Dodać przykład survey dla planu invalid** — dziś tylko valid. Pokazać `faceId:null`,
   shared-face z 3 pokojami, `connections: []` przy sealed zone, `objectsOutsideRooms`.
9. **Doprecyzować `variant`** — skill mówi 4 wartości, spec więcej, kod akceptuje
   wszystko. Napisać prawdę: „przetestowane: single/sliding/fixed/casement; inne
   przechodzą schema, ale walidacja ich nie sprawdza, a render traktuje nie-sliding
   drzwi jako hinged". Docelowo: zamknąć enum w `schema.ts`.
10. **Dodać kryteria dla draftów** — `success_criteria` wymaga `valid:true`, ale agent
    iteruje przez drafty. Dodać: draft raportowany z kodami błędów, bez claimu renderu,
    z następnym krokiem.
11. **Dodać liczby token-ekonomii** — ile KB ma `survey` vs `report` dla reference planu;
    konkret zamiast „compact vs full".
12. **Wersjonować skill** — frontmatter `version:` + wymaganie, by `commands` zwracało
    `version` (CLI zna `0.1.0`, ale `commands` jej nie emituje). `version_drift` bez
    wersji jest nieegzekwowalny.
13. **Rozważyć `scripts/check-grid.py`** (wzór: snowtrex `scripts/`) — pre-check
    `ops.json` na siatkę 0.1 cm przed `apply`, żeby łapać literówki wymiarowe bez
    round-tripu przez CLI.

## Related Research

- `docs/research/2026-09-28-2d-floorplan-tools.md` w tym repo (narzędzia 2D, warstwy
  persistent/derived, diagnostyka jako język, determinism contract).
- Sibling skills o tym samym szkielecie: `dealwatch-cli-dk` (9 workflowów,
  `diagnose.md`, szablony raportów), `snowtrex-cli-dk` (`scripts/rank-offers.py`,
  `screenshot-parity`), `create-cli-dk` (kontrakt `agent-cli-contract.md`,
  `trustworthy-cli-pattern.md`).
- Sibling envelope/exit patterns: `dealwatch/src/cli/*` (tagged union + `EXIT_CODES`),
  `snowtrex-scraper/src/cli.ts` (`_tag` switch), `turistguide-maps/src/cli/main.ts`
  (`emitSuccess/emitError`, `commands`/`schema --command`, preview + `--confirm`).

## Open Questions

1. Czy piętro ma wymagać własnych drzwi zewnętrznych, czy schody mają łączyć graf
   reachability (decyzja produktowa blokująca domy piętrowe)?
2. Czy dodać `delete` (i w jakiej formie: `*.remove` operacje vs `apply --prune`)?
3. Czy zamknąć `variant`/`room.type` w enumy, czy zostawić wolne stringi z katalogiem
   rekomendowanych?
4. Czy `OBJECT_COLLIDES` ma zostać warningiem, czy stać się błędem dla planu finalnego
   (np. flaga `--strict`)?
5. Czy render ma dostać tryb draft (render mimo errorów, z markerami diagnostyk)?
6. Jaki jest docelowy limit rozmiaru planu dla `extractOrthogonalFaces` (pomiar perf
   dla 50/100/200 ścian)?
