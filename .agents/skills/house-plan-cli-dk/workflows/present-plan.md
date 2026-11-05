# Workflow: Present a validated plan as PNG

<required_reading>
Read `references/cli-contract.md` and `references/survey.md`. After layout changes, complete `workflows/furniture-review.md`; presentation rendering is not a replacement for functional review.
</required_reading>

<process>
1. Work from the owning CLI repo; reuse a verified build for plan-only edits, run `pnpm build` if missing/stale after source changes. Inspect `node dist/bin.js commands` and `node dist/bin.js render --help` after upgrades; use the installed executable's contract, not remembered flags.
2. Read the actual revision and validate: `node dist/bin.js validate --plan FILE`. Require `data.valid === true`; report warnings. Keep source and output separate and record a source checksum when proving rendering is non-mutating.
3. Render the presentation SVG from the same model: `node dist/bin.js render --plan FILE --level LEVEL --style presentation [--area-mode axis|net] --out OUTPUT.svg`. Use `--area-mode net` when presenting net floor areas in the clear of walls (e.g. catalog comparisons). No inferred geometry: prose annotations do not create terraces, cabinet elevations, openings or routing arrows — author exterior terraces, porches, driveways, eaves, columns and entry arrows explicitly with `site.upsert`.
4. Render PNG through the CLI's offline SVG rasterization adapter: `node dist/bin.js render --plan FILE --level LEVEL --style presentation [--area-mode axis|net] --format png --width 2400 [--visualize-out <store-root>/visualizations/<slug>.html] --out OUTPUT.png`. Resolve actual paths and level names; never run placeholders literally. Format is explicit, not inferred from extension. `--width` is PNG-only and must pass the current pixel/height bounds. In Cursor IDE, pass `--visualize-out <store-root>/visualizations/<slug>.html` so the CLI writes the normalized `0 0 W H` viewBox SVG fragment directly to disk in <5 ms (never re-emit 35 KB of raw SVG through the LLM `Write` tool), then emit `<cursor-content kind="visualization" src="visualizations/<slug>.html"></cursor-content>` in the chat response. Both styles support all-level exports via `--all-levels --out-dir DIR`.
5. Read the returned revision, paths and PNG dimensions; verify the artifact opens. Inspect the fresh PNG visually. Check header/scale separation, Polish glyphs, long room labels, notes, and whether small furniture labels fit. Oversized furniture descriptions use O-number keys and a legend; this prevents text from pretending to fit a narrow fixture. Also verify outer framing: exterior walls, the entry door and wall-hugging rooms nearest the image boundary must be fully inside the raster (a margin clip can swallow an edge room's label), and the sliding garage door must be distinguishable from a plain opening.
6. If the visual gate fails, correct the rendering or explicitly label a draft. Do not move walls/furniture or duplicate door/rotation calculations in a presentation script to make a picture attractive. Verify the plan checksum did not change. The legacy technical style is the default; presentation changes only appearance.
7. Deliver the actual PNG (Telegram: `MEDIA:/absolute/path/OUTPUT.png`), optionally SVG, and limitations. Explain wall-axis/model areas versus clear-room dimensions whenever users compare numbers. A named design variant and the JSON transaction revision are different identifiers. Cabinet-front/elevation sketches are separate illustrations, not products of this floor-plan renderer.
</process>

<success_criteria>
- Real built CLI generated the delivered PNG; SVG and PNG share one geometry source.
- Validity/diagnostics, revision, artifact paths and source preservation are backed by actual reads.
- Visual inspection passed or remaining presentation defects are explicitly disclosed.
- No claims of legal usable area, building-code compliance, daylight simulation or completed furniture review are inferred from a pretty image.
</success_criteria>
