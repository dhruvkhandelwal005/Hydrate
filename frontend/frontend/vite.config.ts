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

        if ((url === "/v1/cases" || url.startsWith("/v1/cases?")) && req.method === "GET") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify([
              {
                case_id: "case-rotterdam-001",
                run_id: "run_1",
                question: "Rotterdam critical terminal outage and northern rail rerouting evaluation",
                as_of_date: "2027-01-25",
                pack_id: DEMO_PACK.pack_id,
                countries: ["Netherlands", "Germany", "Belgium"],
                sectors: ["Maritime", "Chemicals", "Bulk Grain"],
                event_hypothesis: "Critical freight congestion at Maasvlakte II terminal",
                event_id: "evt-rotterdam-01",
                verification_status: "VERIFIED",
                verification_reason: "Cross-verified with berth manifests and port authority bulletins.",
                verification_doc_ids: ["ORV-0412", "ORV-0388"],
                excluded_count: 0,
                phase: "complete",
                status: "CLOSED",
              },
            ])
          );
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

        if (url.startsWith("/v1/cases/") && url.endsWith("/logs") && req.method === "DELETE") {
          const caseId = url.split("/")[3];
          res.statusCode = 200;
          return res.end(JSON.stringify({ status: "ok", message: `Logs cleared for case ${caseId}`, case_id: caseId }));
        }

        if (url.startsWith("/v1/cases/") && req.method === "DELETE") {
          const caseId = url.split("/")[3];
          res.statusCode = 200;
          return res.end(JSON.stringify({ status: "ok", message: `Case ${caseId} deleted`, case_id: caseId }));
        }

        if (url.startsWith("/v1/cases/") && url.endsWith("/logs") && req.method === "GET") {
          const caseId = url.split("/")[3];
          res.statusCode = 200;
          return res.end(JSON.stringify({ case_id: caseId, total_events: 0, events: [] }));
        }

        if (url.startsWith("/v1/cases/") && url.endsWith("/dossier") && req.method === "GET") {
          const caseId = url.split("/")[3];
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              case_id: caseId,
              question: "Rotterdam critical terminal outage and northern rail rerouting evaluation",
              as_of_date: "2027-01-25",
              pack_id: DEMO_PACK.pack_id,
              verification_status: "VERIFIED",
              verification_reason: "Cross-verified with berth manifests and port authority bulletins.",
              event_hypothesis: "Critical freight congestion at Maasvlakte II terminal",
              countries: ["Netherlands", "Germany", "Belgium"],
              sectors: ["Maritime", "Chemicals"],
              claims_count: 2,
              claims: [
                {
                  claim_id: "CLM-001",
                  agent: "thor",
                  country: "Netherlands",
                  sector: "Maritime",
                  low_estimate: 25,
                  high_estimate: 45,
                  claim: "Port throughput capacity drops significantly due to vessel congestion."
                },
                {
                  claim_id: "CLM-002",
                  agent: "loki",
                  country: "Germany",
                  sector: "Chemicals",
                  low_estimate: 10,
                  high_estimate: 20,
                  claim: "Rhine barge rerouting dampens net supply disruption."
                }
              ],
              challenges_count: 1,
              challenges: [],
              rulings_count: 2,
              rulings: [
                {
                  claim_id: "CLM-001",
                  verdict: "sustained",
                  justification: "Supported by Rotterdam berth manifest evidence."
                },
                {
                  claim_id: "CLM-002",
                  verdict: "modified",
                  justification: "Rail capacity constraints limit substitution."
                }
              ],
              events_count: 2,
              events: [
                {
                  trace_id: "trc-01",
                  timestamp: new Date().toISOString(),
                  agent: "thor",
                  event_type: "CLAIM_ASSERTED",
                  payload: { claim_id: "CLM-001", text: "Port throughput capacity drop" }
                },
                {
                  trace_id: "trc-02",
                  timestamp: new Date().toISOString(),
                  agent: "odin",
                  event_type: "JUDICIAL_RULING",
                  payload: { claim_id: "CLM-001", verdict: "SUSTAINED" }
                }
              ]
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
