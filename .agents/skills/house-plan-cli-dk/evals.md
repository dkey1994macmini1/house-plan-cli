# Evals: house-plan-cli-dk

## Should trigger
1. "dodaj spiżarnię przy kuchni w plan-uA211-final i przesuń drzwi garażowe" (edycja istniejącego HousePlan przezCLI)
2. "przerysuj ten rzut katalogowy w naszym CLI — ściany mam z ekstrakcji, domknij pomieszczenia i drzwi" (raster skeleton → CLI)
3. "co jest nie tak, że survey pokazuje pokój 20 m² zamiast 5,94?" (diagnostyka faces/claims)

## Should not trigger
1. "który wariant lepszy — stodoła czy L?" → owner: `house-plan-agent-workflow` (decyzje projektowe, nie mechanika)
2. "zapisz do briefu, że kuchnia musi mieć wyjście do ogrodu" → owner: `create-house-brief-dk` (brief)

## Behavior 1: raster skeleton → pomieszczenia → drzwi (z błędów sesji 2026-10-19)
**Prompt:** "Ściany masz w JSON (11 pasów). Domknij 17 stref i daj drzwi/okna, plan ma być valid."
**Expect:**
- [ ] Buduje grid pomieszczeń NORMALIZED: wspólne krawędzie sąsiadów = DOKŁADNIE te same współrzędne (bez fuzzy-merge ≤30 cm)
- [ ] Po pierwszym apply porównuje PERR-ROOM areaCm2 vs karta (±0,5 m²), nie zatrzymuje się na total valid=true
- [ ] Wylicza offsety otworów z junction listy hostów po normalizacji (nigdy z draftu sprzed scalania ścian)
- [ ] Iteruje przez dry-run (cheap), nie przez commity i cofanie rewizji
- [ ] offset >0 i offset+width ≤ length hosta zanim wyśle batch

## Behavior 2: diagnostykaSurvey claims
**Prompt:** "Survey pokazuje valid=true ale Garderoba 18,15 m² zamiast 4,90 — co się stało?"
**Expect:**
- [ ] Rozpoznaje symptom sliver-face (rozjechane krawędzie boxów) po pierwszym spojrzeniu na survey
- [ ] Proponuje snap OBU sąsiadów do wspólnej współrzędnej, nie nudging jednej krawędzi

## Baseline (bez lekcji — sesja 2026-10-19)
- B1: **fail** — fuzzy merge (tolerancja ≤30 cm) na sąsiadów → szczelinowe faces; claims odsiadane na przesuniętych twarzach przy valid=true; hosty otworów rozstrzygane przed normalizacją → 21× OPENING fail w kolejnych dry-runach; 14 prób batchy zamiast 2 bramek.
- B2: **fail** — "valid=true" przyjęto jako sukces; delta per pokój wykryta dopiero gdy user odrzucił całość.

## Results (with skill)
| Eval | Baseline | With skill |
|---|---|---|
| B1: normalized grid bez sliverów | fail | pass (geometry-pitfalls L25) |
| B1: per-room claims vs karta po 1. survey | fail | pass (L25) |
| B1: hosty z finalnej ściany | fail | pass (L25) |
| B2: rozpoznaj sliver-face | fail | pass (L25) |
| Trigger: should-trigger 1 | n/a | do re-runu |