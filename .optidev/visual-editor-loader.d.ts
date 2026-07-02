import type { Plugin } from "vite";
/**
 * Options for the visual editor loader plugin
 */
export interface VisualEditorLoaderOptions {
    /** CDN URL for production builds */
    cdnUrl?: string;
    /** Enable visual editor in production (default: false) */
    enableInProduction?: boolean;
}
/**
 * Vite plugin to load OptiDev Visual Editor
 *
 * In development:
 * - Loads from VITE_VISUAL_EDITOR_DEV env variable (e.g., http://localhost:7500/index.js)
 * - Falls back to CDN if not specified
 *
 * In production:
 * - Only loads if enableInProduction is true
 * - Always uses CDN URL
 *
 * CDN URL priority:
 * 1. VITE_VISUAL_EDITOR_CDN env variable
 * 2. cdnUrl option
 * 3. Default: https://cdn.optiedge.com/visual-editor/latest/index.js
 *
 * The script is injected into the HTML head and only initializes when running in an iframe
 * (detected by window.self !== window.parent)
 */
export declare function visualEditorLoader(options?: VisualEditorLoaderOptions): Plugin;
export default visualEditorLoader;
