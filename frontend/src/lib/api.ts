import type {
    CaseSummary,
    CreateCaseBody,
    PackStatus,
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
    try {
        res = await fetch(`${BASE}${path}`, init);
    } catch {
        throw new ApiError(0, "Cannot reach the backend. Check that FastAPI is running.");
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
    // Packs
    listPacks: () => request<PackStatus[]>("/api/v1/packs"), // add this endpoint on backend
    getPackStatus: (packId: string) =>
        request<PackStatus>(`/api/v1/packs/${encodeURIComponent(packId)}/status`),
    ingestPack: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<{ pack_id: string }>("/api/v1/packs/ingest", {
            method: "POST",
            body: form,
        });
    },

    // Cases
    createCase: (body: CreateCaseBody) =>
        request<CaseSummary>("/api/v1/cases", json(body)),
    runCase: (caseId: string) =>
        request<{ run_id?: string }>(
            `/api/v1/cases/${encodeURIComponent(caseId)}/run`,
            { method: "POST" },
        ),
};