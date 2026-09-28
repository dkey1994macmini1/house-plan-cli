/** Compatibility facade. New code imports the public feature/module APIs directly. */

export { loadPlan, savePlan } from "./modules/filesystem/plan-file.js";
export * from "./modules/plan/index.js";
export { renderSvg } from "./modules/render/svg-renderer.js";
