import type { Plugin } from 'vite';
/**
 * Options for the error overlay plugin
 */
export interface ErrorOverlayOptions {
    /** Text to display on the fix button (default: 'Fix Issue') */
    buttonText?: string;
    /** Custom styles to apply to the button */
    buttonStyles?: Record<string, string>;
}
/**
 * Vite plugin to enhance Vite's error overlay with a "Fix Issue" button
 *
 * When an error occurs in development:
 * - Watches for Vite's error overlay to appear
 * - Extracts error information (message, file, stack trace)
 * - Adds a "Fix Issue" button that sends error to parent window
 * - Parent window (OptiDev Power Mode) can then handle the fix
 *
 * Only works when running in an iframe (preview context).
 *
 * @example
 * ```typescript
 * import { errorOverlayPlugin } from '@optidev/vite-plugins';
 *
 * export default defineConfig({
 *   plugins: [
 *     react(),
 *     errorOverlayPlugin({
 *       buttonText: 'Fix with AI',
 *       buttonStyles: {
 *         backgroundColor: '#6366f1'
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export declare function errorOverlayPlugin(options?: ErrorOverlayOptions): Plugin;
export default errorOverlayPlugin;
