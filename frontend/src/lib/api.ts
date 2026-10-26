import type {
    CaseDetails,
    CaseRuling,
    CaseSummary,
    CreateCaseBody,
    ExecutiveBriefingResponse,
    ExposureTableResponse,
    JudgeComplianceResponse,
    PackStatus,
    SourceDoc,
    StreamEvent,
    TradeRowData,
} from "../types/api";

// Empty base = same origin. Vite dev proxy forwards /api to FastAPI.
// Override with VITE_API_URL=http://localhost:8000 if not using proxy.
const BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    const reqHeaders: Record<string, string> = {
        "X-Request-ID": "req_" + Math.random().toString(36).slice(2, 10),
    };

    if (init?.headers) {
        Object.assign(reqHeaders, init.headers);
    }

    try {
        res = await fetch(`${BASE}${path}`, {
            ...init,
            headers: reqHeaders,
        });
    } catch {
        throw new ApiError(0, "Cannot reach the backend. Check that FastAPI is running on http://localhost:8000.");
    }

    if (!res.ok) {
        let detail = res.statusText;
        try {
            const body = await res.json();
            if (typeof body?.detail === "string") detail = body.detail;
            else if (body?.detail) detail = JSON.stringify(body.detail);
        } catch {
            /* body was not JSON */
        }
        throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

export const api = {
    // 1. Pack Hub
    listPacks: () => request<PackStatus[]>("/api/v1/packs"),
    getPackStatus: (packId: string) =>
        request<PackStatus>(`/api/v1/packs/${encodeURIComponent(packId)}/status`),
    ingestPack: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<{ pack_id: string; total_files?: number }>("/api/v1/packs/ingest", {
            method: "POST",
            body: form,
        });
    },
    addPackDocuments: (packId: string, files: File[]) => {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        return request<{ accepted: string[]; rejected: Array<{ file: string; reason: string }> }>(
            `/api/v1/packs/${encodeURIComponent(packId)}/documents`,
            {
                method: "POST",
                body: form,
            }
        );
    },

    // 2. Cases
    createCase: (body: CreateCaseBody) =>
        request<CaseSummary>("/api/v1/cases", json(body)),
    listCases: async (): Promise<CaseSummary[]> => {
        try {
            const res = await request<CaseSummary[]>("/api/v1/cases");
            if (Array.isArray(res)) return res;
            if (Array.isArray((res as any)?.cases)) return (res as any).cases;
            return [];
        } catch (err) {
            console.warn("Failed to load cases list:", err);
            return [];
        }
    },
    getCase: (caseId: string) =>
        request<CaseDetails>(`/api/v1/cases/${encodeURIComponent(caseId)}`),
    deleteCaseLogs: (caseId: string) =>
        request<{ status: string; message: string; case_id: string }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/logs`,
            { method: "DELETE" }
        ),
    deleteCase: (caseId: string) =>
        request<{ status: string; message: string; case_id: string }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}`,
            { method: "DELETE" }
        ),
    runCase: (caseId: string, mode: "step" | "auto" = "step", force = false) =>
        request<{ case_id: string; run_id: string; phase: string; status: string }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/run`,
            json({ mode, force })
        ),
    advanceCase: (caseId: string, to: "round1" | "round2" | "judge" | "run", force = false) =>
        request<{ case_id: string; run_id: string; phase: string }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/advance`,
            json({ to, force })
        ),
    resetCase: (caseId: string) =>
        request<CaseSummary>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/reset`,
            { method: "POST" }
        ),
    getCaseRuns: (caseId: string) =>
        request<any[]>(`/api/v1/cases/${encodeURIComponent(caseId)}/runs`),
    getCaseFeed: (caseId: string, speed = 5) =>
        request<any[]>(`/api/v1/cases/${encodeURIComponent(caseId)}/feed?speed=${speed}`),
    getCaseExposure: (caseId: string) =>
        request<ExposureTableResponse>(`/api/v1/cases/${encodeURIComponent(caseId)}/exposure`),
    getCaseRuling: (caseId: string) =>
        request<CaseRuling>(`/api/v1/cases/${encodeURIComponent(caseId)}/ruling`),
    getCaseBriefing: (caseId: string) =>
        request<ExecutiveBriefingResponse>(`/api/v1/cases/${encodeURIComponent(caseId)}/briefing`),
    getCaseJudge: (caseId: string) =>
        request<JudgeComplianceResponse>(`/api/v1/cases/${encodeURIComponent(caseId)}/judge`),
    getCaseTrace: (caseId: string, filters?: { agent?: string; type?: string; run_id?: string }) => {
        const q = new URLSearchParams(filters as any).toString();
        return request<{ case_id: string; events: any[] }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/trace${q ? `?${q}` : ""}`
        );
    },
    getCaseMemoryEvents: (caseId: string) =>
        request<any[]>(`/api/v1/cases/${encodeURIComponent(caseId)}/memory-events`),
    getCaseLogs: (caseId: string) =>
        request<{ case_id: string; total_events: number; events: any[] }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/logs`
        ),
    getCaseDossier: (caseId: string) =>
        request<any>(`/api/v1/cases/${encodeURIComponent(caseId)}/dossier`),
    getExportUrl: (caseId: string) =>
        `${BASE}/api/v1/cases/${encodeURIComponent(caseId)}/export`,

    // 3. Sources & Trade Tables
    getSource: (docId: string, asOf?: string) => {
        const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
        return request<SourceDoc>(`/api/v1/sources/${encodeURIComponent(docId)}${q}`);
    },
    getSourceFileUrl: (docId: string) =>
        `${BASE}/api/v1/sources/${encodeURIComponent(docId)}/file`,
    getTradeTable: (tableId: string) =>
        request<any>(`/api/v1/trade/${encodeURIComponent(tableId)}`),
    getTradeRow: (tableId: string, rowId: string | number) =>
        request<TradeRowData>(
            `/api/v1/trade/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(String(rowId))}`
        ),

    // 4. Live Stream (SSE)
    subscribeStream: (
        caseId: string,
        onEvent: (event: StreamEvent) => void,
        onError?: (err: any) => void,
        replay = false
    ) => {
        const url = `${BASE}/api/v1/cases/${encodeURIComponent(caseId)}/stream${replay ? "?replay=true" : ""}`;
        const es = new EventSource(url);

        es.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data) as StreamEvent;
                onEvent(data);
            } catch (e) {
                console.warn("SSE parse error:", e);
            }
        };

        es.onerror = (e) => {
            console.warn("SSE stream error", e);
            if (onError) onError(e);
        };

        return () => es.close();
    },
};