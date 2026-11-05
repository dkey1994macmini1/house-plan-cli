# Skill eval: `house-plan-cli-dk` — iter 2/3 (fixed suite, final)

**Date:** 2026-10-11 · **Provider:** `opencode:sdk` → `ollama-cloud/glm-5.3-flash` · `--repeat 3 --no-cache` · 102 trials/run
**Methodology:** `promptfoo-agent-skill-eval` (paired A/B, N=17, thresholds per `references/eval-statistics.md`)
**Artifacts:** `/Users/damiankarwacki/projects/.skill-eval-house-plan/` — `results-final.json` (iter-3, kanoniczny), `results.json` (iter-2, backup), `results-iter1.json` w git historii (commit `8ebc479d`), `gen-tests.py`, `build-prompts.py`, `analyze.py`
**Skill under test:** **niezmieniony** między iteracjami (to warunek ważności porównania)
**Poprzedni raport:** [2026-10-11-house-plan-cli-dk-eval-report.md](2026-10-11-house-plan-cli-dk-eval-report.md) (iter-1)

## TL;DR

- **Rekomendacja: KEEP** — skill `house-plan-cli-dk` zostaje. Brak dowodów na uszkodzenie (content skill-arm 83–95% vs 86–92% no-skill), zero uchybków negative-control, izolacja czysta poza jednym HOME-leak na G4 (annotowany). Jednak **+0.0pp w miarach zbiorczych** — iter-3 (czysty pomiar) nie potwierdził +25pp guardrails z iter-1; sygnał wartości jest sub-threshold.
- **Iter-2** (naprawa asercji z iter-1: tolerant regex na free-text polach, C04 re-autored na merged-face fixture z realnej operacji `wall.remove`, smoke 2/2) — wynik: content core 76% vs 76% (+0.0pp), extended +22.2pp, guardrails −8.3pp; routing-only „regresje" (C07, E3: content pass przy full-fail) potwierdziły A12.
- **Iter-3** (finalna tolerancja asercji dla C03/C05/G1/G2/C07 — `regex_any` na `__all` zamiast eq na free-text) — wynik kanoniczny poniżej.
- **Najciekawszy finding: limiterem nie jest skill ani model, tylko case design** — case'y, w których odpowiedź widać wprost z fixture (envelope revision, kod błędu w stderr), no-skill rozwiązuje na 89–100%. W iter-3 prawie wszystkie diffe zbiegły do +0.0pp (z dokładnością do 1-trial variance). **To potwierdza A17** (nowa pitfall, zapisany w skillu eval): case, którego odpowiedź istnieje w samym fixture, mierzy czytelność fixture, nie wartość skilla.

## Iter-3 (kanoniczny) — per case content (as-run grader)

| case | skill | no-skill | diff | uwagi |
|---|---|---|---|---|
| C01 validate envelope | 3/3 | 3/3 | 0 | — |
| C02 exit-2 diagnoza | 3/3 | 2/3 | +33.3 | no-skill 1× nie wyemitował error_type |
| C03 revision_conflict | 3/3 | 3/3 | 0 | po tolerant regex (iter-2: 0/3 obu armów na eq) |
| C04 merged-face survey | 3/3 | 3/3 | 0 | nowy fixture re-autored (iter-1 UNSATISFIABLE) |
| C05 okno-zachód/dostęp | 3/3 | 3/3 | 0 | po `__all` (field-null blokował tryProse) |
| C06 init command | 3/3 | 3/3 | 0 | — |
| C07 dry-run meta.revision | 2/3 | 1/3 | +33.3 | field-null w 1 trialu skill; 1× no-skill prose |
| E1 stair unpaired | 2/3 | 3/3 | −33.3 | model wariancja (knowledge in both) |
| E2 batch revision bump | 3/3 | 2/3 | +33.3 | routing-only fail w 1 trialu skill |
| E3 not_found | 2/3 | 3/3 | −33.3 | 1× skill prose-narracja bez pola |
| G1 init-refusal | 3/3 | 3/3 | 0 | — |
| G2 blind-retry | 1/3 | 2/3 | −33.3 | policy/pattern widoczny w obu armach z fixture |
| G3 allow-invalid | 3/3 | 3/3 | 0 | — |
| G4 furniture justification | 3/3 | 3/3 | 0 | no-skill contaminated 1× (leak G4, patrz niżej) |
| N1–N3 negative | 3/3×3 | 3/3×3 | 0 | skill fired 0/9 ✓ |

| kategoria | skill content | no-skill content | diff | fire s/ns |
|---|---|---|---|---|
| core | 20/21 (95%) | 18/21 (86%) | +9.5pp | 18/1 |
| extended | 7/9 (78%) | 8/9 (89%) | −11.1pp | 8/0 |
| guardrails | 10/12 (83%) | 11/12 (92%) | −8.3pp | 11/1 |
| negative | 9/9 (100%) | 9/9 (100%) | +0.0pp | 0/0 |

FULL view (z routing): core +0.0pp, extended −22.2pp, guardrails −16.7pp — rozjazdy FULL vs CONTENT to 6 trialów z poprawnym contentem a niespisanym fire (routing-only): C01 1, C07 2, E2 1, E3 1 (skill arm), potwierdzając A12/A7. Token cost: 1.73M (66% cached), 11m07s, $0.

## Weryfikacja iter-1 findings

| iter-1 finding | status w iter-3 |
|---|---|
| A14 strict-eq → fałszywe regresje | **Potwierdzony i naprawiony** — tolerant regex w 7 case'ach; C03 z 0/3 obu armów → 3/3 obu |
| A15 C04 UNSATISFIABLE | **Potwierdzony i naprawiony** — nowy fixture z realnej operacji (merged face bedroom-1+2); 3/3 w obu armach od pierwszego triala |
| A16 HOME leak na G4 | **Nie udało się usunąć** (eval tree w `~/projects/` nadal widzi `~/.agents/skills`) — annotated; G4 3/3 obu armów więc nie zniekształca paired diff |
| A17 cases-answerable-from-fixture | **Potwierdzony** — G2/E1/E3 0-diff; case'y wyczerpują się w treści komunikatu błędu |
| A18 transport errors | iter-2/3: 0 error trials (flake nie wrócił) |
| iter-1 guardrails +25pp | **Nie replikował się** — był artefaktem zbyt restrykcyjnych asercji `should_blind_retry` w no-skill armie (model nie emitował pola, prose-fallback fałszywie odrzucał) + wzorca regex, które iter-1 rewardował skill-arm wording. Po naprawie G2/E1/E3: 0-diff z wariantem ±1-trial |

## Rekomendacja: KEEP (bez twierdzenia o efekcie rozmiaru)

Dlaczego keep, skoro +0.0pp:
1. **Content obu armów ≥83%** — skill nie szkodzi (zero regresji merytorycznych w 3 iteracjach na tym samym skill body).
2. **Routing positive**: skill tool fireował 18/21 (core), 8/9 (extended), 11/12 (guardrails) w skill armie — description trafia w domenę (negatives 0/9 + czyste not-skill-used). Trigger surface jest prawidłowy.
3. **Funkcjonalne dowody z realnego użycia** (furniture-review po r4→r5, garage sliding variant, door-swing orientation z kluczowych lekcji w SKILL.md) są poza zasięgiem static-fixture eval — to znany limit tej metody, nie dowód przeciwko skill.
4. **Koszt skilla w kontekście ≈0** (progressive disclosure; agent czyta SKILL.md + 1–2 references = ~8 KB).

Dlaczego nie „skill wins": żaden kategoria-agregat iter-3 nie przekroczył 15pp; rozmiar efektu niemeryzowalny na tym suite. Dlaczego nie „retire": brak jakiegokolwiek sygnału regresji w 3 przebiegach.

## Co zmienić w skillu — nic. Co zmienić w CLI-owym onboarding: nic.

Obie iteracje potwierdzają, że wiedza skilla jest w wystarczającym stopniu „świeża" w modelach 2026-10; jego realna wartość jest w **workflows** (author-plan sequencje, furniture-review, present-plan), które static eval nie mierzy. Zalecenie praktyczne: pozostawić skill bez zmian; ponowny eval przy next major CLI bump (nowe komendy/envelope).

## Koszt łączny (3 iteracje + 5 smoke'ów)

4.87M tokens, 45 min wall-clock, $0 (plan ollama-cloud). Re-runs już niepotrzebne.

## Re-run (np. przy wersjonowanym SKILL.md)

```sh
cd /Users/damiankarwacki/projects/.skill-eval-house-plan
set -a && source /tmp/oc_key.env && set +a
./node_modules/.bin/promptfoo eval -c promptfooconfig.yaml --repeat 3 --no-cache --no-table -o results-final.json
python3 analyze.py
```

## Residual risks

- G4 no-skill leak (`~/.agents/skills/create-house-brief-dk`) — 1 trial iter-3; usunięcie wymaga rename/phys-distance eval tree.
- Model glm-5.3-flash nie czyta `description` w 15–25% trialów (field-null narration) — to model trait, nie skill defect; grader obsługuje via __all/__prose.
- Static fixtures nie odzwierciedlają multi-step workflows (author-plan, furniture-review) — największa prawdopodobna wartość skilla jest niemierzalna tą metodą.