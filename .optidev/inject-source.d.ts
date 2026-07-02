import type { Plugin } from "vite";
/**
 * Options for the inject source plugin
 */
export interface InjectSourceOptions {
    /** File patterns to exclude from processing */
    exclude?: string[];
    /** JSX element names to skip */
    skipElements?: string[];
}
/**
 * Vite plugin to inject data-source & data-bind attributes into JSX for visual editing
 * Adds file:line:column + data binding path (like products[index].name)
 */
export declare function injectSourcePlugin(options?: InjectSourceOptions): Plugin;
export default injectSourcePlugin;
