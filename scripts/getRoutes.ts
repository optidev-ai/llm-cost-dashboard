import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts route paths from a React Router Routes JSX string
 * Handles both single-line and multi-line Route components
 */
function extractRoutesFromJSX(jsxContent: string): string[] {
  const routes: string[] = [];

  // Match <Route path="..." /> or <Route path="..." element={...} />
  const routeRegex = /<Route\s+path=["']([^"']+)["']\s+(?:element=\{[^}]+\})?[^>]*\/?>/g;

  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(jsxContent)) !== null) {
    routes.push(match[1]);
  }

  return routes;
}

/**
 * Scans file-based routing structure (src/pages)
 */
function scanFileBasedRoutes(dir: string, base = ""): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      return scanFileBasedRoutes(fullPath, `${base}/${file}`);
    }

    // Only process React files
    if (!file.match(/\.(tsx|jsx)$/)) {
      return [];
    }

    const name = file.replace(/\.(tsx|jsx)$/, "");

    // Skip layout and error pages
    if (name.startsWith("_")) {
      return [];
    }

    // Convert filename to route path
    let route: string;
    if (name === "index") {
      route = base || "/";
    } else {
      // Handle dynamic routes: [id].tsx → :id
      const routeName = name.replace(/\[(.+?)\]/g, ":$1");
      route = `${base}/${routeName}`;
    }

    return [route];
  });
}

/**
 * Scans manual route definitions from App.tsx or routes file
 */
function scanManualRoutes(appFilePath: string): string[] {
  if (!fs.existsSync(appFilePath)) {
    return [];
  }

  const content = fs.readFileSync(appFilePath, "utf-8");
  return extractRoutesFromJSX(content);
}

/**
 * Main function to detect and extract all routes
 */
export function getAllRoutes(): string[] {
  const projectRoot = path.resolve(__dirname, "..");
  const appFilePath = path.join(projectRoot, "src", "App.tsx");
  const routesFilePath = path.join(projectRoot, "src", "routes.tsx");
  const pagesDir = path.join(projectRoot, "src", "pages");

  let routes: string[] = [];

  // Try manual routes first (App.tsx or routes.tsx)
  if (fs.existsSync(appFilePath)) {
    const manualRoutes = scanManualRoutes(appFilePath);
    if (manualRoutes.length > 0) {
      routes = manualRoutes;
      console.log("✓ Detected manual routing in App.tsx");
    }
  } else if (fs.existsSync(routesFilePath)) {
    const manualRoutes = scanManualRoutes(routesFilePath);
    if (manualRoutes.length > 0) {
      routes = manualRoutes;
      console.log("✓ Detected manual routing in routes.tsx");
    }
  }

  // Fallback to file-based routing
  if (routes.length === 0 && fs.existsSync(pagesDir)) {
    routes = scanFileBasedRoutes(pagesDir);
    if (routes.length > 0) {
      console.log("✓ Detected file-based routing in src/pages");
    }
  }

  // Remove duplicates and sort
  return [...new Set(routes)].sort();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const routes = getAllRoutes();
  console.log("\n📍 Available Routes:");
  console.log(JSON.stringify(routes, null, 2));
}
