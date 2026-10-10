# HousePlan CLI — handoff usprawnienia autorowania i wizualizacji

> **Dla agenta implementującego:** ten dokument przekazuje kontekst, dowody, priorytety i kryteria odbioru. Najpierw zabezpiecz eksport, potem zbuduj jedną krótką pętlę preview → ocena → apply. Nie rozpoczynaj kolejnego projektowania domu ani ponownego pełnego researchu.
> **For Hermes:** przy implementacji task-by-task można użyć skilla `subagent-driven-development`; nie jest to polecenie uruchomienia szerokiego fan-outu ani zmiana zasady parent-only przy autorowaniu rzutów.

**Goal:** ograniczyć ręczne liczenie współrzędnych, powtarzanie skryptów, liczbę rund narzędziowych i błędne interpretacje rzutu, zachowując deterministyczność, bezpieczeństwo źródeł i kompletność kontroli.

**Architecture:** rozbudować istniejące CLI pionowymi slice'ami; decyzje architektoniczne należą do człowieka/agenta, geometrię i jawne operacje wykonuje narzędzie. Modele domenowe posiadają zachowania; CLI, pliki i rasteryzacja są adapterami. Jeden model geometrii i jeden renderer SVG, PNG rasteryzowane z tego samego SVG.

**Tech Stack:** Node.js 22+, TypeScript 5.9, Effect v3, `@effect/cli`, `@effect/platform-node`, Vitest 3 / `@effect/vitest`, Biome, offline `@resvg/resvg-js` z dołączonymi fontami DejaVu. Zweryfikuj wersje z aktualnego lockfile; nie migruj stacku przy okazji.

**Stan handoffu:** 2026-10-10, profil Hermes `default`, repo lokalne `/Users/damiankarwacki/projects/house-plan-cli`. HEAD przy ostatnim odczycie: `f5d6dab` — `feat: harden plan I/O and add removal, stair circulation and polygon faces`. Znaczna część działającego renderera i ostatnich zmian skillów jest **uncommitted**. HEAD sam w sobie NIE odtwarza aktualnego zachowania.

---

## 1. Zakres i niecele

To handoff **toolingu**, nie nowej wersji rzutu. Program konkretnego domu jest wejściem testów lokalnych, a nie regułą zaszytą w CLI.

- Zachowaj istniejące plany, ich identyfikatory, rewizje i semantykę. Nie promuj U4/T2/T3 do baseline.
- Nie zmieniaj samodzielnie liczby pokoi, położenia garażu, wyposażenia ani wymagań Damiana.
- Nie dodawaj 3D/BIM, generatywnego auto-layoutu, automatycznego snap/naprawiania, norm prawnych ani solvera projektowania domu.
- Nie buduj drugiego renderera w Python/Pillow ani nowej aplikacji webowej jako warunku tego zadania.
- Nie rób wielkiej przebudowy modułów. Respektuj `AGENTS.md`; rozszerz obecne granice, dodając moduł tylko dla rzeczywiście nowej capability.
- Nie uznawaj `valid=true`, osiągalnego punktu ani ładnego PNG za akceptację budowlaną, ergonomiczną, akustyczną, świetlną lub budżetową.
- Poprawy milisekund są drugorzędne. Podstawowy koszt to ręczna koordynacja zależności, wielkie payloady i rundy LLM.

## 2. Materiały do przeczytania i ochrona istniejącej pracy

### Obowiązkowe

1. `AGENTS.md` — aktualne reguły repo, domain modelling, testy, ograniczenia.
2. `.agents/skills/house-plan-cli-dk/SKILL.md` i odpowiednie references/workflows.
3. `.agents/skills/create-cli-dk/SKILL.md` — przed zmianą komend, flag, envelope, stdin, exitów lub semantyki zapisu.
4. `.agents/skills/effect-ts-dk/SKILL.md` — przed pisaniem/review Effect; repo korzysta z v3.
5. `.agents/skills/modular-monolith-architecture/SKILL.md` — przed zmianą granic modułów.
6. `docs/specs/2026-09-28-house-plan-cli-mvp.md`.
7. `docs/specs/2026-10-09-presentation-rendering.md` i `docs/specs/2026-10-09-presentation-verification.md`.
8. `.agents/skills/house-plan-cli-dk/references/review-packet.md` oraz `scripts/review_packet.py` i `scripts/test_review_packet.py`.

### Kontekst procesu, nie instrukcja ponownego audytu

- `/Users/damiankarwacki/projects/budowa-domu/koncepcja/audyt-workflow-planow.md` — wcześniejszy audyt historii i 39 związanych sesji wybranych z eksportu 461 sesji.
- `/Users/damiankarwacki/.hermes/skills/architecture/house-plan-agent-workflow/SKILL.md` i `workflows/rapid-revision.md` — świeżo usprawniony proces.
- Repo-local `house-plan-cli-dk` jest źródłem operacyjnego skilla; instalacja użytkownika Hermesa wskazuje na niego symlinkiem. Nie twórz rozjeżdżających się kopii.
- Nie zmieniaj innych profili Hermesa. Aktualizuj repo-local skill przy zmianach publicznego CLI; nie musisz modyfikować instalacji Hermesa, żeby wdrożyć kod CLI.

### Dirty tree

Przed implementacją zapisz aktualne `git status --short` i obejrzyj `git diff`. Nie używaj resetu/clean ani checkoutu kasującego cudzą pracę. Przy handoffie modyfikacje tracked obejmowały skill, references, author workflow, README, package/lock, `src/bin.ts`, `render-service.ts`, `svg-renderer.ts`. Untracked obejmowały m.in. renderer presentation, label placement, graphics/bounds/palette/options/raster, font assets, testy presentation/render-style oraz helper i workflowy skilla.

W przypadku osobnego klona/worktree najpierw zapewnij przeniesienie całego aktualnego patcha i nowych plików z właścicielem; nie zakładaj, że wszystko jest w HEAD. Bez takiego transferu zatrzymaj implementację opartą na brakujących plikach. Commit/push tylko w zakresie uzgodnionym z użytkownikiem; nie publikuj prywatnych planów.

## 3. Potwierdzone fakty i benchmark

### Istniejący publiczny kontrakt

Działa: `init`, `apply` z operacjami upsert/remove, `validate`, `survey`, `report`, `render` pojedynczej/wszystkich kondygnacji, `commands`, `schema`. Obsługiwane są technical/presentation SVG i offline PNG. Mutacje wymagają `--expected-revision`; `--dry-run` nie zapisuje planu.

**Nie istnieją dziś** komendy `preview`, `check`, `diff`, transformacje grupowe ani flagi warstw/crop/summary opisane dalej. Wszystkie takie nazwy w tym dokumencie są **propozycjami do specyfikacji**, nie poleceniami do uruchamiania na obecnym CLI.

### Wydajność zmierzona na rzeczywistym U4 rev9

Plan: 29 ścian, 15 nazwanych pomieszczeń, 30 otworów, 47 obiektów. Trzy uruchomienia każdej komendy jako osobnego procesu, lokalnie, na aktualnie zbudowanym CLI. Mediany:

| Operacja | Czas | Uwagi |
|---|---:|---|
| `commands` | 0,351 s | Punkt odniesienia kosztu uruchomienia procesu; nie dokładny pomiar samego startupu |
| `apply` pustych ops, dry-run | 0,378 s | stdout 18 551 bajtów; to pomiar pustej propozycji, nie ciężkiej przebudowy |
| `validate` | 0,371 s | stdout 99 bajtów |
| `survey` | 0,374 s | stdout 14 937 bajtów |
| presentation SVG | 0,397 s | Realny eksport |
| presentation PNG 2400 px | 0,519 s | Realny eksport |
| Python helper z kontrolami T3 | 3,980 s | Statyczne trasy i 3 scenariusze appliance fronts; exit2 był oczekiwanym wykryciem regresji |

Źródło U4 przed/po benchmarku: SHA256 `2e44212686349bf0cfec6ac4bf45a9f7722ee1fe865ca78bba306b3c03b845e2`, bez zmian. Test nie dowodzi oszczędności całej rozmowy ani wydajności przy dowolnym rozmiarze planu.

### Testy już wykonane przed handoffem

- `pnpm check`: lint/typecheck i 78/78 testów CLI PASS.
- `python3 -m unittest discover -s .agents/skills/house-plan-cli-dk/scripts -p test_review_packet.py -v`: 14/14 PASS.
- Pięć prób helpera na rzeczywistych U1/U3/U4/T2/T3: oczekiwane pozytywne i negatywne wyniki, SHA 15 plików planów niezmienione.
- To historyczny baseline; implementer musi uruchomić własne testy po zmianach.

### Czytelność świeżego PNG

Inspection nowego PNG U4 potwierdziło: przeważnie czytelne nazwy/obszary, ale ciasne etykiety w małych pomieszczeniach, małe kody Oxx, obszerna legenda, głównie blokowe prostokąty wyposażenia, mało wyróżnione otwory i brak pokazanych tras. To obserwacje wizualne, nie diagnoza geometrii domu.

W kodzie `centeredLabelPoint` zwraca środek face, jeżeli żaden kandydat nie pasuje — bez raportu o fallbacku. Furniture ma już fallback do keyed legend; nie implementuj go drugi raz. Tekst jest szacowany przez stały glyph advance, nie rzeczywiste metryki fontu.

## 4. P0 — bezpieczeństwo eksportu, przed ergonomią

### 4.1 Renderer może nadpisać wejściowy plan — ODTWORZONE

**Dlaczego:** `renderHandler` wczytuje plan, przekazuje tylko model i output path do `renderLevelToFile`; `writeArtifact` wykonuje `writeFile` bez ochrony aliasu źródła.

Na jednorazowej kopii w scratch uruchomiono render z identycznym `--plan` i `--out`. Exit0, JSON planu zastąpiony SVG. Prawdziwy U4 pozostał niezmieniony. Nie odtwarzaj tego na oryginalnych plikach użytkownika.

**Naprawa:**
- Odmów eksportu na jakikolwiek input: plan, checks, ops, baseline, inne chronione pliki danej operacji.
- Obsłuż ścieżki względne/absolutne, symlinki i hardlinki. Samo porównanie tekstu lub `resolve()` nie wystarcza; istniejące pliki porównuj również według realpath/tożsamości pliku.
- Ochrona także dla all-level/manifest/preview i atomowych zapisów, nie tylko jednego handlera.
- Ustal jawną politykę istniejących outputów (domyślnie odmowa dla nowego bundle; ewentualny świadomy overwrite artefaktów). Chronionych inputów nie wolno nadpisywać nawet z overwrite.
- Preflight przed pierwszym zapisem; błąd strukturalny do stderr, nie częściowy sukces.

**Pliki:** `src/bin.ts`, `src/modules/render/render-service.ts`; rozważ mały adapter bezpiecznych artefaktów przy istniejącym filesystem module. Testy w `tests/render-style-format.test.ts`, `tests/cli.test.ts`, nowym `tests/artifact-safety.test.ts`.

**Odbiór:** testy aliasu bezpośredniego, symlink/hardlink, istniejącego outputu i source/manifest; po odmowie bytes wszystkich inputów i wcześniejszych artefaktów identyczne.

### 4.2 Nazwa kondygnacji pozwala wyjść poza out-dir — ODTWORZONE

**Dlaczego:** all-level konstruuje `join(directory, `${level.name}.${extension}`)`, a schema nie wymusza bezpiecznego basename.

Fixture w scratch z nazwą `../escaped-level` otrzymał exit0 i plik poza zadanym katalogiem eksportu, nadal wewnątrz scratch. Nie naruszono właściwych planów.

**Naprawa:**
- Oddziel nazwę domenową od nazwy pliku. Bezpieczne deterministyczne filename/ID + manifest mapujący rzeczywistą nazwę kondygnacji.
- Jawnie rozwiązuj kolizje slugów, Unicode, separators, `.`/`..`, absolutne paths i reserved names; nie zmieniaj po cichu nazw w planie.
- Wszystkie wygenerowane ścieżki muszą pozostać wewnątrz canonical output root; sprawdź symlinki w katalogu docelowym.
- Te same zasady dla przyszłych crops/overlays/reports.

**Odbiór:** nazwy z `../`, separators, Unicode i kolidującymi slugami nie nadpisują innych plików, nie wychodzą z root i mają jednoznaczną mapę w manifest. Wymagana odmowa lub bezpieczne mapowanie według jawnej specyfikacji.

### 4.3 Pakiet eksportu i zapis konkurencyjny — RYZYKO Z KODU, nie odtworzona awaria

All-level zapisuje pliki kolejno, a manifest na końcu; dokumentacja już przyznaje brak atomowości. `savePlan` ma temp sibling + rename, ale expectedRevision sprawdzane wcześniej nie jest samo w sobie CAS między dwoma procesami.

- Dla nowego bundle generuj do unikalnego staging directory; publikuj komplet dopiero po sukcesie. Jawny stan failed/draft, sprzątanie własnego staging, brak udawania atomowej wymiany dowolnego istniejącego katalogu na wszystkich OS.
- Zdefiniuj reguły powtórnego uruchomienia, unikaj miksowania rewizji i stale artefacts.
- Dodaj test konkurencyjnego apply z tego samego revision oraz kolizji pliku tymczasowego. Przy potwierdzeniu lost update wdroż kontrolę/lock przy zapisie; nie zakładaj, że atomic rename = atomic revision check.
- Nie przebudowuj I/O do rozproszonego systemu; zakres to lokalny CLI i jawna serializacja zapisów.

## 5. P1 — zintegrowany preview propozycji, główny przyrost produktywności

### Problem

Dziś agent składa osobno: dry-run → proponowany JSON → tymczasowy plan → survey/helper → SVG → PNG → własny diff/raport. Nie ma wygodnego podglądu stanu proponowanego; odczyt survey bieżącego pliku nie sprawdza dry-run proposal.

### Docelowe zachowanie

Zaprojektuj komendę roboczo:

```text
preview --plan SOURCE --input OPS --expected-revision N --checks CHECKS --out-dir NEW_BUNDLE
```

**To proponowany kontrakt.** Przed implementacją opisz go w nowej specyfikacji, dopasuj do create-cli-dk i istniejących envelope/exit semantics.

- Jedna operacja w pamięci: load → decode ops → evaluate candidate → validate → survey → task checks → diff → render.
- Źródło niezmienione. Jawnie rozdziel sourceRevision/sourceSha od hipotetycznej candidateRevision/candidate digest. Nie ogłaszaj nowej persisted revision.
- Stan invalid jest diagnostyką, nie powodem utraty całego podglądu. Obecne apply odrzuca invalid candidate — nie obchodź jego zabezpieczenia; wydziel read-only ocenę propozycji bez zapisu.
- Preview błędnego draftu tylko jako wyraźnie oznaczony draft. Dla malformed input/konfliktu revision zwróć błąd bez obrazka zmyślonego z częściowych danych.
- Jasno rozdziel: geometria CLI, task assertions, warnings/review i unknown/not requested.
- stdout to małe podsumowanie i rzeczywiste ścieżki; pełny model/survey/results w bundle na żądanie lub jako pliki. Nie zmieniaj po cichu obecnego domyślnego apply/report.
- Bundle: SVG/PNG, `manifest.json`, `review.json`, `diff.json`, opcjonalny candidate JSON i crops. Manifest wiąże źródło, ops, checks, settings, wersję silnika i pliki przez identyfikatory/digests.
- Jeżeli apply korzysta z zaakceptowanych ops, wciąż sprawdza bieżącą rewizję i source identity. Preview nie jest tokenem obchodzącym validation/revision guard.
- W aktualnym kodzie nowych encji używa się randomUUID. Zaplanuj stabilne odniesienia/hash propozycji: powtarzalny preview tych samych źródła+ops ma dawać tę samą geometrię/diff, a nie fałszywe changed IDs. Nie zmieniaj formatów źródłowych bez potrzeby.

### Slicing i pliki

- Spec: utwórz `docs/specs/2026-10-10-proposal-preview.md` (proponowana nowa ścieżka).
- Wykorzystaj `src/modules/plan/mutation.ts`, `validation.ts`, `survey.ts`, `resolution.ts`, `domain-objects.ts`.
- W razie nowej capability utwórz niewielki `src/modules/preview/` z named domain/application behavior, bez god-handlera w `src/bin.ts`.
- File/output adapters pozostają na granicy; render współdzieli `render-service.ts`, nie kopiuje jego geometrii.
- Testy: `tests/preview.test.ts`, `tests/preview-cli.test.ts` (nowe), existing CLI/render tests.

**Odbiór:** jedna poprawka drzwi daje w jednym wywołaniu read-only preview, actual sides, delta i obraz. Invalid proposal daje uczciwe findings/draft, a źródło niezmienione. Konflikt revision i unsafe output odmawiane. Ten sam source/ops/settings daje deterministyczny content z wyjątkiem jawnych pól timing/provenance. Apply nie traci zabezpieczeń.

## 6. P1 — natywna kontrola funkcjonalna i schemat wejścia

### Co już istnieje

Python `review_packet.py` to działający read-only prototyp, nie pełny produkt. Zapewnia faces/connections/opening endpoints, bboxy, physical facade, unique area, task assertions, square-body grid routes, appliance obstacles, wybrane limity i baseline object delta. Użyj go jako źródła zachowań/testów, nie kopiuj liniowo całego kodu do proceduralnego TS.

### Co wdrożyć

- Wspólny typed review/check service używany przez preview i ewentualną osobną komendę (roboczo `check`; jej potrzeba zależy od reuse tego samego serwisu).
- Versioned Effect Schema dla checks: poziom, required/absent rooms, independent private faces, actual connection sides, physical facades, body/grid, named activity points, routes, scenarios i jawne limits.
- Kryteria i wartości zależą od projektu; bez wbudowanego 216 m², 15 m, pięciu pokoi czy nazw rodzinnych pomieszczeń.
- Waliduj brakujące referencje, duplicate scenario/goal names, NaN/infinity, nieobsługiwane grid values, nieznane keys według jawnej polityki. Nie ignoruj typo w checks.
- Brak checks nie może znaczyć functional PASS. Osobno status not-requested/unknown/fail/pass i CLI validity.
- Dowody: exact endpoints, actual sides, measured values, units, limits i method assumptions. Zachowaj severity review dla ostrzeżeń geometrycznych, nie dorabiaj wymogów konstrukcyjnych.
- **Topologia nie zastępuje fizycznego zamknięcia.** Różne faceId/prawidłowe seeds nie dowodzą pełnej przegrody prywatnej lub garażowej. Task check powinien rozróżniać ścianę, drzwi i rzeczywistą lukę; wykazywać małe niezamierzone gaps/niepełne enclosure zamiast zaliczać je jako projektowane przejście. Freestanding loops/hole cases pozostające poza obecnym zakresem mają jawny unsupported/diagnostic, nie wymyślony face ani nakaz dodania przypadkowej ściany tylko dla walidatora. Nie rozwijaj general polygon engine przy okazji.
- Domyślna metoda może zachować jawny square-body4-neighbor grid5 cm, lecz same-body i same-goals muszą pozostać w porównaniu. Nigdy silent snap/drop/narrow.
- Punkty reprezentują zadanie (np. front lodówki), nie przypadkowy seed pokoju. Konfiguracja relatywnego activity anchor, jeżeli dodana, musi być jawna i mieć rozstrzygnięte położenie w evidence; nie automatyczne odsunięcie od kolizji.
- Scene-state appliance fronts wyliczaj z modelu/danej jawnej konfiguracji, a nie kopiowanych rectów zależnych od wariantu. Nie wywnioskuj kierunku otwarcia urządzenia z dowolnej etykiety.
- Współdziel `WallSegment.openingEndpoints`, `doorGeometry`, `PlanObject.bounds` i topology zamiast utrzymywać drugi zestaw formuł w helperze.

### Dwa ograniczenia prototypu do naprawienia, nie utrwalenia

1. Assertion connections sprawdza dziś obecność każdej nazwy w dowolnej stronie, co nie gwarantuje, że wymagane A i B są po przeciwnych stronach. Nowy model musi dopasować dwie różne strony faktycznego otworu; osobny jawny format dla outside oraz współdzielonych open-plan names. Dodaj negatywny test, gdzie obie wymagane nazwy siedzą na jednym face.
2. Limity route length w helperze sprawdzane są tylko dla static. W nowej specyfikacji zadeklaruj, czy limit obowiązuje static/selected/all scenarios; raportuj odrębne wyniki. Nie utożsamiaj policzonej ścieżki ze sprawdzonym limitem.

### Stany drzwi i clearance

Obecny probe wycina drzwi z murów i nie modeluje rozwieranych liści. Zdefiniuj otwarte/zamknięte/swing states; wykorzystaj istniejącą door geometry. Rozdziel twardą kolizję od required service/use envelope (obecne object.clearance nie zastępuje całej ergonomii). Obsłuż occupancies krzeseł, biurka, szafy i AGD przez jawne scenariusze. Own front może być dozwolonym blocked point, ale nie uzasadnia utraty trasy do innych celów.

Nie deklaruj 14 gości / 6 śpiących PASS bez rzeczywistych scenariuszy umeblowania. CLI ma umieć ocenić podaną scenę, nie samemu wymyślać przestawiania mebli.

**Odbiór:** przeniesione 14 zachowań testowych prototypu, dodatkowe testy powyższych false-PASS, all-scenes, invalid-config, unknown i door states; najpierw synthetic public fixtures, potem read-only parity na dostępnych prywatnych planach. Wycofuj helper dopiero po parity i aktualizacji skilla. Nie zostawiaj dwóch konkurujących engines jako docelowego rozwiązania.

## 7. P1 — diff, przyczynowe diagnostics i widok problemu

### Diff

- Added/removed/changed entities z zachowaniem ich stable identity, stare/nowe geometry values.
- Actual room/face connections, directional facade deltas, opening widths/end segments, unique face area i liczba odrębnych private rooms.
- Zmiana codziennych dystansów i reachable goals w tych samych scenariuszach/body/grid. Jeśli activity endpoint się zmienił, pokaż mapping i powód; brak porównywalności jest unknown, nie zero.
- Topology face IDs mogą zmieniać się po edycji. Nie porównuj ich naiwnie jako stable domain IDs; geometria/room identity i jawne split/merge.
- Podsumowanie zmiany programowej/funkcjonalnej nie ma być automatyczną rekomendacją architektoniczną.

### Diagnostics

Obecny `Diagnostic` ma code/location/measured/suggestion, ale brak zunifikowanej geometrii problemu. Rozszerz kompatybilnie o references i point/segment/bbox/overlap/passage bottleneck, gdy faktycznie wyliczalne. Umożliw powiązanie finding→overlay→crop. Podaj observed/required units i dostępne end segments; nie generuj zgadywanych ruchów naprawczych.

Przykład wymaganego zachowania: nie tylko „collision with wall”, lecz które obiekty, obszar kolizji i highlight. Nie musi wskazywać jedynego „przesuń oX cm”, jeśli taki ruch wymaga decyzji lub generuje inne konflikty.

**Pliki:** `plan/model.ts`, `validation.ts`, domain geometry, review service, shared graphics; nowe testy diff/diagnostic geometry. Zachowaj istniejący machine-readable envelope lub jawnie versionuj kontrakt.

**Odbiór:** mała zmiana nie wymaga pełnego reportJSON w stdout; konkretny finding ma poprawny marker w plan coordinates i opcjonalny crop. Area liczone z unikalnych faces, nie room claims; same shared face nie mnoży m².

## 8. P1 — czytelna prezentacja i diagnostyka layoutu grafiki

### 8.1 Etykiety bez cichego fallbacku

`src/modules/render/label-placement.ts` i `presentation-renderer.ts`:
- Placement result obejmuje placed/fallback/unplaced oraz reserved bounds i powód. Nie zwracaj po prostu środka jako rzekomo poprawnego placement.
- Jeżeli nazwa/obszar nie mieści się przy ścianach/obiektach, krótki kod + keyed legend/callout bez zmiany geometrii planu; wybór jawny/deterministyczny.
- Rezerwuj także etykiety innych elementów i symbole krytyczne, nie tylko bbox mebli/stairs.
- Legendę dziel na sensowne sekcje lub osobną planszę; zachowaj kompaktowy rzut bez kilometrowej listy pod nim. Możliwe krótkie nazwy vs pełne opisy.
- Stabilne keys przy reorder/upsert (dziś Oindex zmienia się wraz z kolejnością tablicy).
- Trafne width metrics dla bundled fonts albo wyraźnie udokumentowany conservative estimate + testy. Nie dodawaj font network/system dependency.
- Wydajność labelCandidates (pełna siatka sortowana) optymalizuj dopiero po większym fixture/profile, nie na ślepo.

**Odbiór:** crowded small rooms, długie polskie nazwy, shared face, rotated furniture i długie nagłówki nie mają krytycznych overlap/viewport overflow. Nie każda label musi być inside — zaakceptowany callout/legend. `layoutWarnings` mogą wyjść w manifest/summary.

### 8.2 Symbole wyposażenia i otworów

- Opcjonalny semantic kind/style dla jawnie oznaczonych bed/sofa/table/chair/desk/WC/shower/appliance/vehicle. Nie wywnioskuj rodzaju automatycznie z językowej nazwy jako źródła prawdy.
- Subtelne intuicyjne symbole w istniejących footprint bounds; generic rectangle fallback dla legacy. Symbol nie zmienia bbox/collision.
- Drzwi/okna wyróżnione kontrastem i testowane w skali obrazu Telegram; oznaczenie głównego wejścia tylko z jawnych metadanych, nie nazwy „wejście”.
- Technical style pozostaje kompatybilny; presentation enhancements niezależne od model semantics.
- Nie zastępuj hinged door symbolem sliding, żeby ułatwić rysunek/testy.

**Odbiór:** można rozpoznać podstawowe wyposażenie bez każdorazowego czytania legendy; endpoints i swings nadal zgodne z domain geometry dla odwróconych a→b i wszystkich obsługiwanych wariantów. Fixture bez kind nadal renderuje jak wcześniej.

### 8.3 Warstwy, crops i krótkie views

Proponowane jawne opcje, do uzgodnienia w spec: furniture/labels/dimensions/routes/issues/clearance/changes, overview i affected-zone crop.

- Overlay z prawdziwych bends/findings tej samej candidate revision, nigdy ręcznie narysowanych „wiarygodnych” strzałek.
- Legendy pokażą metodę route, body/grid, scenario i ograniczenia. Route jest wynikiem probe, nie korytarzem/normą.
- Crops nie gubią jednostek, orientacji ani identyfikacji source/candidate. Geometria world→paper jest współdzielona (+Y=N, svgY=-Y).
- Labels-only zmian nie trzeba ponownie oceniać jako nowej architektury, ale czytelność wyjścia sprawdzamy na świeżym PNG.

**Odbiór:** jeden bundle daje normalny overview i potrzebny problem crop/route overlay bez zewnętrznego schematu/Pillow; włączanie warstw nie edytuje planu.

## 9. P2 — jawne transformacje i dependency-aware edit

### Dlaczego

Upserty z absolute coords zmuszają agenta do koordynowania związanych elementów. W historii odbicia i przesunięcia powodowały dziedziczone szafy/drzwi, złe strony N/S, arbitralne remapy punktów i liczne Python scripts.

### Zalecany zakres, bez solvera

- Jawna transformacja zadanej listy encji/grupy: translate i orthogonal rotate/reflect. Decyzja selekcji i anchor należy do autora; nie zgaduj całego „pokoju” z nazwy.
- Jasna polityka dependencies: openings hosted by moved wall, shared/joined endpoints, seeds, objects, dimensions, annotations, stairs/voids. Selection closure zwraca listę skutków przed apply; nie rozszerzaj po cichu zakresu.
- Reflection doors: przelicz położenie i handedness z fizycznej geometrii (hinge/openLeaf), z round-trip testami. Offset zawsze zgodny z authored a→b.
- Transformacje nie robią silent snap; nieobsługiwany kąt/poza-grid to odmowa. Nie zmieniaj room names na N/S, by zamaskować fizyczne odbicie.
- Wall split/merge/rehost i otwór w absolutnym punkcie: dalszy etap, wyłącznie z jednoznacznym mappingiem offsets/host identity i wykazem dependents. Brak cascade delete bez jawnej zgody.
- Relative placement/anchor (np. object względem konkretnej ściany) można dodać jako **jawny generator ops**, nie jako utrzymywany globalny constraint solver.
- Współdziel nowy preview i apply; brak drugiej ścieżki zapisującej plan bez validation/expectedRevision.

**Pliki:** schema/model/mutation/domain objects + ewentualny mały authoring capability module, nie generic utils. Testy nowe `tests/transform.test.ts` i CLI/discovery/schema.

**Odbiór:** przesunięcie wskazanego fragmentu aktualizuje dokładnie zaakceptowane dependents; mirror twice wraca do tej samej geometrii; zewnętrzne zależności raportowane; stale revision/kolizja odrzuca całą mutację bez częściowego zapisu. Seed po operacji w właściwym face, doors mają właściwą fizyczną stronę.

## 10. P2 — scenariusze, provenance i ergonomia procesu

- Scene changes jako jawne task-local overlays/operation sets dla appliance open, occupied chairs, 14 diners, 6 sleepers/future offices. Base i scenario state zachowane, bez ręcznego kasowania mebli ze źródła.
- Checks/goals/task metadata trzymane w projekcie, nie zaszyte w skillu ani nazwach pokoi CLI.
- Bundle wiąże exact source SHA/revision, checks/ops digests, body/grid/states i render settings. Nie prezentuj starego obrazka jako nowej rewizji.
- Source i candidate provenance osobne; screenshot/vision review odnosi się do exact artifact, nie tylko ogólnej nazwy wariantu.
- Checkpoint/proposal history może być lekkim plikiem/manifestem, nie wymaga SQLite/servera.
- Obsługa input schemas/discovery musi być kompletna dla wszystkich nowych poleceń/flags/ops. Nie wprowadź stdio bannerów; stdout=JSON, stderr=błędy.
- Zachowaj defaulty publicznego CLI; reduced payload jako jawny new-command default lub opt-in mode. Nie każ agentom zgadywać, które fields zniknęły.

## 11. P3 — optymalizacje dopiero po pomiarze; czego teraz nie robić

- W kodzie apply jest ponowna validation w handlerze po walidacji candidate w mutation. Render także może wykonywać kilka przejść validate/resolve/topology. W ramach preview reuse jednego snapshotu/evaluation ma sens; nie usuwaj zabezpieczeń bez jednolitego testowanego kontraktu.
- Reuse analysis/topology per source/candidate w procesie zamiast wielokrotnego startu Node i odczytu pliku. Cache tylko z poprawnym content digest + checks + settings/engine version; invalidation ma być testowana. Nie dodawaj globalnego stale cache, daemon/RPC ani background service tylko dla oszczędzenia około części sekundy.
- Spatial indexing/label search optimization dopiero po fixture większego planu i profiling. Dziś normalny PNG wychodzi w około pół sekundy.
- Vehicle maneuver, konstrukcja słupków bramy, prawo, daylight/acoustics/budget pozostają osobnymi decyzjami/specjalistycznymi modelami. Można raportować brak inputu/unknown i geometryczne dane, nie udawać certyfikacji.
- Nie wdrażaj każdej P2/P3 capability w pierwszym PR. Rozdziel backlog od minimalnego działającego rozwiązania.

## 12. Rekomendowana kolejność vertical slices

Każdy slice: (1) failing behavior/CLI test, (2) rzeczywiste uruchomienie pokazujące failure, (3) najmniejsza implementacja, (4) test PASS, (5) `pnpm check`/build i realny przykład, (6) docs/discovery/skill aktualne. Nie zatrzymuj się na stubie albo opisaniu, co „powinno” działać.

1. **Artifact safety:** chronione input aliases i confinement output paths. Test reprodukcji na syntetycznych disposable fixtures; nie na prywatnym źródle. Dopiero potem pozostałe zmiany.
2. **Proposal evaluation:** read-only valid/invalid candidate bez renderera, stabilny source/candidate contract. Test stale revision, no source mutation, invalid draft evidence.
3. **Review core:** typed task checks i parity z helperem; false-PASS stron/scene limits naprawione. Test no-checks=not-requested.
4. **Preview bundle:** evaluation + diff + existing SVG/PNG + kompaktowe summary, bezpieczeństwo i staging. Realny działający vertical slice.
5. **Readable problem view:** placement warnings, route/issues overlays i crop z tej samej geometrii; visual gate fresh PNG.
6. **Dependency-aware transforms:** translation first, potem reflection/rotation i ewentualnie wall split/merge. Każdy jako odrębny testowany slice.
7. **Scenes/semantic symbols/advanced diff:** tylko po zamknięciu priorytetów i pomiarze użytkowania.
8. **Profiling/reuse:** jeśli realny benchmark pokazuje wąskie gardło; brak celu optymalizacji dla samej liczby ms.

Orientacyjny koszt: średnia rozbudowa istniejącego CLI dla safety + preview/review; pełny backlog transforms/scenes/readability to większa praca, nie pojedyncza poprawka. Nie ma zweryfikowanej estymaty godzin ani obietnicy procentowego przyspieszenia.

## 13. Corpus regresyjny i granice prywatności

### Syntetyczne fixtures w repo

Utwórz nowe małe fixtures poprzez udokumentowane operation templates/CLI, nie kopiując prywatnego domu do testów publicznych. Potrzebne przypadki: pełna ściana vs gap/virtual enclosure, shared-face area, odwrotne authored wall direction, host nazwany N na fizycznym S, private names na tym samym face, blocked origin, concave outline/hole, thin obstacle between nodes, occupied appliance front, two scene variants, same names on one side, labels nowhere fit, output alias/path escape.

Fixtures muszą mieć jawne oczekiwane wyniki i służyć konkretnej granicy; nie wymyślaj pozornego stdout prawdziwego planu.

### Prywatne plany jako lokalna integracja, wyłącznie odczyt

Root: `/Users/damiankarwacki/projects/budowa-domu/koncepcja/`.

- `plan-u4-wezel-zachodni.houseplan.json`, rev9: 216,0 m² po osiach, 24/24 celów dla body80 w testowej konfiguracji; dobry pozytywny punkt odniesienia, nie zatwierdzenie całego domu.
- `plan-u1-wright.houseplan.json`: negatywny test physical facade — nazwy N nie oznaczają północnej krawędzi.
- `plan-u3-odbicie-u1-ns.houseplan.json`: brak żądanego clean connection ze śluzy.
- `plan-t2-garaz-polnoc-kuchnia-w.houseplan.json`, rev5: 232,3 m²; negatywny test jawnego limitu216; brama360 cm na host400 cm daje end segments20+20, warning do konstruktora, nie automatyczna norma.
- `plan-t3-wiatrolap-techniczny.houseplan.json`, rev3: 226,3 m²; probe route entry→sofa_seating26,4 m, mimo26/26 osiągalnych celów w static. Negatywny test jawnego max15; własny zajęty fridge point w fridge-open jest osobno oznaczony.

**216 m² i15 m to progi konfiguracji testu, nie nowe wymagania Damiana ani przepisy.** Zachowaj oznaczenie długości jako gridPath, nie rzeczywisty pomiar marszu.

Task checks i evidence z poprzedniego audytu są w `/Users/damiankarwacki/.hermes/cache/scratch/house-skill-audit/`: `u4-checks.json`, `u1-checks.json`, `u3-checks.json`, `t2-checks.json`, `t3-checks.json`, `*-final-regression.json`. Scratch może zostać wyczyszczony; nie uzależniaj CI/dostarczalności od niego. Jeśli danych brak, nie wymyślaj ich; wykorzystaj task-local project evidence albo poproś właściciela o właściwe fixtures.

Snapshoty aktualnych PNG i raporty wariantów są w folderach `robocze-*` prywatnego projektu. Nie commituj źródeł, renderów, eksportów sesji lub danych banku pamięci do publicznego repo. Anonimizowane fixtures wymagają rzeczywistego odtworzenia zachowania, nie samej zmiany nazwy pliku.

## 14. Mierzenie poprawy — poza zielonymi unit testami

Utrzymaj dwa poziomy pomiaru:

1. **Deterministic tooling benchmark:** te same source/ops/goals/body/scenes/render settings, powtarzane uruchomienia; wall-clock poszczególnych etapów, liczba subprocessów, bytes stdout/artefaktów, source hashes, actual check outcomes.
2. **Agent-task benchmark:** mała poprawka drzwi, zmiana wspólnego wiatrołapu oraz odbicie wskazanej grupy. Liczba rund LLM, czas do użytecznego preview, repair iterations, written helper code, completeness of acceptance. Rejestruj user/model/network pauses osobno.

Oczekiwany kierunek: jedna runda narzędziowa do podglądu propozycji zamiast ręcznego klejenia model/survey/probe/render/diff; mniej ręcznych współrzędnych i żadnego nowego BFS per wariant. Nie wymagaj arbitralnego „90% szybciej”. Negatywne testy muszą nadal być negatywne; nie przyspieszaj przez usunięcie celów/body/scenes lub brak visual gate.

Nie mieszaj cold/warm startup, pustych ops i realnego rearrangement. Baseline0,52 s dla PNG nie jest SLA. Repo/private fixture changes wymagają nowego pomiaru.

## 15. Definition of Done i przekazanie wyników

- [ ] P0 source alias/path escape naprawione i odtworzone testami; input SHA i outputs chronione.
- [ ] Zakres pierwszego slice/PR jawny; rzeczy P2/P3 pozostają oznaczonym backlogiem, nie „done”.
- [ ] Preview/evaluation rozdziela source, hypothetical candidate, CLI validity, checks status i draft.
- [ ] New CLI flags/commands/envelopes/schema mają realne discovery/help i behavioral tests; kompatybilność dotychczasowych flows zachowana albo migration opisana.
- [ ] Model/domain geometry współdzielony; brak docelowej równoległej Python/TS kopii engine.
- [ ] Preview/diff/overlay/PNG związane z exact source/ops/checks i metodą, bez stale artefacts.
- [ ] Connection assertions rozdzielają strony, scene scope limitów jawny, no-checks nie udaje PASS.
- [ ] labels fallback/unsafe output/unknown criteria widoczne w rezultacie.
- [ ] `pnpm check`, `pnpm build`, `git diff --check` PASS po zmianach; wcześniej istniejące testy nadal przechodzą. Python testy zachowane do zamknięcia parity.
- [ ] Realne read-only integration na dostępnych planach, fresh final PNG inspection i hash-source invariance. Brak prywatnych danych w repo fixtures.
- [ ] README, spec i repo-local skill zsynchronizowane; brak opisu niezaimplementowanego polecenia jako dostępnego.
- [ ] W raporcie końcowym exact commands, real outputs/artifact paths, co wdrożono, czego nie, ograniczenia i benchmark. Nie zastępuj awarii sfabrykowanym wynikiem.
- [ ] Bez nieuzgodnionych zmian layoutu domu, innych profili, publikacji albo kasowania dirty tree.

### Istniejące polecenia weryfikacji

Z root repo:

```bash
pnpm check
pnpm build
git diff --check
python3 -m unittest discover -s .agents/skills/house-plan-cli-dk/scripts -p test_review_packet.py -v
node dist/bin.js commands
node dist/bin.js schema
```

Po wdrożeniu nowych capabilities pokaż działający przykład przy użyciu **rzeczywiście zaimplementowanego** kontraktu. Nie uruchamiaj propozycji `preview`/`check` z tego dokumentu przed dodaniem ich do CLI.

## 16. Stan przy przekazaniu

Ten handoff nie implementuje nowych komend ani nie poprawia opisanych P0. Dwa P0 odtworzono wyłącznie na disposable scratch copies. Właściwy U4 zachował powyższy SHA. Poprzednio wdrożone usprawnienia skillów, helper, presentation SVG/PNG i78 istniejących testów stanowią punkt startowy. Najważniejsze zadanie implementera to zabezpieczyć eksport i przenieść działające mechanizmy kontroli/podglądu do jednej bezpiecznej ścieżki, a nie wygenerować kolejną wersję domu.
