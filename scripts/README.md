# Route Scanner for React + Vite Projects

This directory contains a TypeScript utility to automatically extract all route paths from your React + Vite application.

## Features

- **Automatic Detection**: Detects both manual routing (App.tsx, routes.tsx) and file-based routing (src/pages)
- **Smart Extraction**: Parses React Router `<Route>` components from JSX
- **Dynamic Routes**: Converts `[id].tsx` to `:id` format
- **Clean Output**: Returns sorted, deduplicated JSON array of paths

## Usage

### Command Line

Run the script directly to output routes to console:

```bash
pnpm routes
```

**Output:**
```
✓ Detected manual routing in App.tsx

📍 Available Routes:
[
  "/",
  "/product"
]
```

### API Endpoint

The routes are also available via HTTP during development:

1. Start the dev server:
   ```bash
   pnpm dev
   ```

2. Access the endpoint:
   ```bash
   curl http://localhost:5173/api/routes
   ```

**Response:**
```json
[
  "/",
  "/product"
]
```

### Programmatic Usage

Import and use in your own scripts:

```typescript
import { getAllRoutes } from './scripts/getRoutes';

const routes = getAllRoutes();
console.log(routes); // ["/", "/product"]
```

## How It Works

### Manual Routing Detection

The script scans `App.tsx` or `routes.tsx` for React Router `<Route>` components:

```tsx
<Route path="/" element={<HomePage />} />
<Route path="/product" element={<ProductDetailPage />} />
```

Extracts: `["/", "/product"]`

### File-Based Routing Detection

If manual routes aren't found, it scans `src/pages/` directory:

```
src/pages/
  ├── index.tsx        → /
  ├── about.tsx        → /about
  ├── [id].tsx         → /:id
  └── nested/
      └── page.tsx     → /nested/page
```

**Naming Conventions:**
- `index.tsx` → Root path (`/`)
- `[param].tsx` → Dynamic route (`:param`)
- `_layout.tsx` → Ignored (layout files)
- `_error.tsx` → Ignored (error pages)

## Configuration

### Vite Integration

The `/api/routes` endpoint is configured in `vite.config.ts`:

```typescript
import { getAllRoutes } from './scripts/getRoutes'

export default defineConfig({
  server: {
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/routes') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(getAllRoutes(), null, 2));
        } else {
          next();
        }
      });
    }
  }
})
```

### Package.json Script

The script is registered in `package.json`:

```json
{
  "scripts": {
    "routes": "tsx scripts/getRoutes.ts"
  }
}
```

## Example Output

For this project (Mercedes Showcase), the detected routes are:

```json
[
  "/",
  "/product"
]
```

**Route Details:**
- `/` - Home page with hero video and product card
- `/product` - Product detail page with image gallery and trim selector

## Extending the Scanner

### Adding Custom Route Patterns

Edit `scripts/getRoutes.ts` to support additional routing patterns:

```typescript
// Example: Support catch-all routes
const routeName = name
  .replace(/\[\.\.\.(.+?)\]/g, '*')  // [...slug] → *
  .replace(/\[(.+?)\]/g, ':$1');     // [id] → :id
```

### Supporting Route Objects

If your project uses route objects instead of JSX:

```typescript
const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/product', element: <ProductDetailPage /> }
];

// Add to getRoutes.ts:
function extractRoutesFromObjects(routes: any[]): string[] {
  return routes.flatMap(route => [
    route.path,
    ...(route.children ? extractRoutesFromObjects(route.children) : [])
  ]);
}
```

## Troubleshooting

### No Routes Detected

1. Verify `src/App.tsx` contains `<Route>` components
2. Check `src/pages/` directory exists
3. Ensure files have `.tsx` or `.jsx` extensions

### Incorrect Route Paths

1. Check JSX formatting matches: `<Route path="/path" ... />`
2. Verify file naming follows conventions
3. Look for syntax errors in route definitions

## Dependencies

- `node:fs` - File system operations
- `node:path` - Path manipulation
- `tsx` - TypeScript execution (dev dependency)

## License

Part of the Mercedes Showcase kiosk template project.
