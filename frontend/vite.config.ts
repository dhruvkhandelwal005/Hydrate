import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import http from "node:http";

// Cache backend health status for 3 seconds to avoid constant socket probing
let lastHealthCheck = 0;
let isBackendOnline = false;

async function probeBackend(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < 3000) {
    return isBackendOnline;
  }
  lastHealthCheck = now;
  isBackendOnline = await new Promise<boolean>((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: 8000, path: "/health", method: "GET", timeout: 300 },
      (res) => resolve(res.statusCode === 200)
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
  return isBackendOnline;
}

const DEMO_PACK = {
  pack_id: "pack-rotterdam-2026",
  name: "Rotterdam Disruption Dossier",
  state: "READY",
  total_files: 5,
  processed_files: 5,
  counts: {
    VALID: 5,
    PARTIAL: 0,
    EMPTY: 0,
    DAMAGED: 0,
    DUPLICATE: 0,
    MALFORMED: 0,
    QUARANTINED: 0,
  },
  trade_tables: 2,
  hash_mismatches: 0,
  pack_hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  created_at: "2026-10-24T12:00:00Z",
  files: [
    { doc_id: "ORV-0412", path: "Rotterdam_Berth_Manifest_Q3.pdf", format: "pdf", status: "VALID" },
    { doc_id: "ORV-0388", path: "Microelectronics_Supply_Route_Audit.pdf", format: "pdf", status: "VALID" },
    { doc_id: "ORV-0501", path: "Trade_Table_Commodities_Index.pdf", format: "pdf", status: "VALID" },
    { doc_id: "ORV-0711", path: "EU_Energy_And_Reserves_Directive.pdf", format: "pdf", status: "VALID" },
    { doc_id: "ORV-0544", path: "Master_Supplier_Agreements_Annex_C.pdf", format: "pdf", status: "VALID" },
  ],
};

// Dev mock fallback plugin: Serves mock API responses when FastAPI (:8000) is not running
function devApiFallbackPlugin(): Plugin {
  return {
    name: "dev-api-fallback",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) {
          return next();
        }

        // If backend on :8000 is running, pass to Vite proxy
        const isUp = await probeBackend();
        if (isUp) {
          return next();
        }

        // Otherwise supply mock data to prevent ECONNREFUSED terminal errors
        const url = req.url.replace(/^\/api/, "");
        res.setHeader("Content-Type", "application/json");

        if (url === "/v1/packs" || url.startsWith("/v1/packs?")) {
          res.statusCode = 200;
          return res.end(JSON.stringify([DEMO_PACK]));
        }

        if (url.startsWith("/v1/packs/") && url.endsWith("/status")) {
          res.statusCode = 200;
          return res.end(JSON.stringify(DEMO_PACK));
        }

        if (url === "/v1/packs/ingest") {
          res.statusCode = 200;
          return res.end(JSON.stringify({ pack_id: `pack-${Date.now().toString(36)}` }));
        }

        if (url === "/v1/cases" && req.method === "POST") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              case_id: `case-${Date.now().toString(36)}`,
              question: "Rotterdam supply chain exposure evaluation",
              as_of_date: new Date().toISOString().slice(0, 10),
              created_at: new Date().toISOString(),
              pack_id: DEMO_PACK.pack_id,
              countries: ["Netherlands", "Germany", "Taiwan"],
              sectors: ["Chemicals", "Semiconductors"],
              status: "active",
            })
          );
        }

        if (url.startsWith("/v1/cases/") && url.endsWith("/run")) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ run_id: `run-${Date.now().toString(36)}` }));
        }

        if (url === "/health" || url === "/api/health") {
          res.statusCode = 200;
          return res.end(JSON.stringify({ status: "ok", backend: "dev-fallback-mode" }));
        }

        res.statusCode = 200;
        return res.end(JSON.stringify({ status: "ok", mode: "dev-fallback" }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiFallbackPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            // Cleanly handle ECONNREFUSED without logging error trace in terminal
            if ("writeHead" in res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ detail: "Backend offline (FastAPI not running on :8000)" }));
            }
          });
        },
      },
    },
  },
});
