# Spec — Artifact and Export Safety (P0, handoff 2026-10-10)

Status: zaimplementowane w tym slice'ie. Źródło wymagań: `docs/plans/2026-10-10-house-plan-tooling-handoff.md` §4 oraz §15 (Definition of Done).

## Problem

Dwie odtworzone luki (verify na disposable scratch copies, oryginalny U4 nietknięty):

1. **§4.1 Render nadpisuje wejściowy plan.** `render --plan X --out X` → exit 0, JSON planu zastąpiony SVG. `writeArtifact` pisał `writeFile` bez ochrony aliasu.
2. **§4.2 Nazwa kondygnacji wydostaje się z out-dir.** all-levels konstruował `join(dir, `${level.name}.${ext}`)`; nazwa `../escaped-level` zapisywała plik poza katalogiem eksportu.

Ryzyko z kodu (§4.3): all-levels zapisywał pliki kolejno + manifest na końcu bez atomowości; fail w pół zapisu zostawiał częściowy bundle.

## Decyzje

- **Adapter bezpiecznych artefaktów** (`src/modules/render/artifact-fs.ts`), nie god-handler w `bin.ts`. Granica filesystem dla render module.
- **Alias detection** przez `resolve()` equality OR realpath equality OR `(dev, ino)` identity **na stat follow-symlinks**. `lstat` nie wykrywa symlink-out→plan (pisze przez link); `resolve()` sam nie wykrywa hardlink ani symlink.
- **Polityka istniejących outputów (default odmowa):** nowy bundle/arteftakt → odmowa gdy target istnieje (albo dir nie-pusty); `--overwrite` = świadoma wymiana wygenerowanych artefaktów. **Chronione inputy pozostają chronione nawet z `--overwrite`.**
- **Level name ≠ filename:** `safeLevelSlug` dekoduje separator-paths deterministycznie (`a\b` → `a--b`, `.` → `_`), **odmawia** całości-segment `..` (escape attempt nie jest cicho remapowany), neutralizuje control chars i Windows reserved names, rozwiązuje kolizje `-2`/`-3`. Plan zachowuje authored nazwę; manifest mapuje filename→real name.
- **Preflight przed pierwszą mutacją FS:** wszystkie filename'y derivowane i walidowane przed `mkdir(out-dir)` — odmowa zostawia dysk nietknięty.
- **Staging + publish:** all-levels bundle renderuje się do świeżego `.staging-*`, publikacja (rename per plik) dopiero po sukcesie wszystkich artefaktów; fail → staging usunięty, zero częściowej publikacji. Nie udaje atomic directory swap — publikacja jest per-file na spokojnym katalogu (zamiana istniejącego bundle wymaga `--overwrite`; miksowanie starych i nowych artefaktów nie zachodzi bo odmowa nie-pustego dir).
- **Envelope:** `ArtifactSafetyError` → `invalid_input`, exit 2, message+hint (create-cli-dk zasada: błędy uczą recovery).

## Świadome granice (nieDone)

- CAS między dwoma współbieżącymi `savePlan` (apply) — poza tym slice'em (§4.3 test konkurencyjnego apply = osobny ticket; wymagany pomiar lost-update przed lock).
- Symlink wewnątrz out-dir wskazujący na zewnątrz — obsłużone pośrednio (slug + confinedJoin), pełny symlink-dir audit = przyszły slice.
- `writeArtifact` single-level z poziomu innej aplikacji (API bez CLI) — ochrona `protectedInputs` jest parametrem; render service wymusza ją z handlera CLI.