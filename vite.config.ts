import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import lightningcss from 'vite-plugin-lightningcss'
import path from 'path'
import { injectSourcePlugin } from './.optidev/inject-source.js'
import { visualEditorLoader } from './.optidev/visual-editor-loader.js'
import { errorOverlayPlugin } from './.optidev/error-overlay.js'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` (development, production, etc.)
  const env = loadEnv(mode, process.cwd(), '')

  const WORKSPACE_HOST = env.WORKSPACE_HOST?.trim()
  const hasPublicHost = !!WORKSPACE_HOST

  return {
    plugins: [
      // Inject data-source attributes in development for visual editing
      mode === 'development' ? injectSourcePlugin({
        exclude: ['node_modules', '.git', 'dist'],
        skipElements: ['html', 'body', 'head', 'meta', 'link', 'script', 'style', 'Fragment']
      }) : null,
      // Load visual editor client script in iframe
      visualEditorLoader({
        // CDN URL from env variable (or use plugin's default if not set)
        cdnUrl: env.VITE_VISUAL_EDITOR_CDN,
        enableInProduction: false
      }),
      // Error overlay with "Fix Issue" button in development
      mode === 'development' ? errorOverlayPlugin() : null,
      react(),
      lightningcss({
        browserslist: '>= 0.25%',
      }),
    ].filter(Boolean),

    // Path alias
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'date-fns',
        'axios',
        'recharts',
        'lucide-react',
        'clsx',
        'tailwind-merge'
      ],
      holdUntilCrawlEnd: true,
    },

    // Build optimizations
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['recharts', 'lucide-react'],
            'utils': ['date-fns', 'axios', 'clsx', 'tailwind-merge']
          }
        }
      }
    },

    // Server configuration
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      cors: true,
      headers: {
        'X-Frame-Options': 'ALLOWALL',
      },

      // Warmup frequently used modules
      warmup: {
        clientFiles: [
          './src/App.tsx',
          './src/main.tsx',
          './src/pages/Index.tsx'
        ]
      },

      // Watch configuration
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.cache/**', '**/.git/**']
      },

      allowedHosts: hasPublicHost ? [WORKSPACE_HOST!] : (true as const),

      ...(hasPublicHost
        ? {
            origin: `https://${WORKSPACE_HOST}`,
            hmr: {
              protocol: 'wss' as const,
              host: WORKSPACE_HOST!,
              clientPort: 443,
            },
          }
        : {}),
    },

    // Cache directory
    cacheDir: '.cache/vite',
  }
})
