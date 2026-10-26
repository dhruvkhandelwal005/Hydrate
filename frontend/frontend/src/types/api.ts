// Shapes the frontend expects from the FastAPI backend.
// If backend field names differ, change them here only.

export type DocStatus =
    | "VALID"
    | "PARTIAL"
    | "EMPTY"
    | "DAMAGED"
    | "DUPLICATE"
    | "MALFORMED"
    | "QUARANTINED";

export type PackState = "PENDING" | "INGESTING" | "READY" | "FAILED";

export interface PackFileReport {
    path: string;
    doc_id?: string | null;
    format: string; // pdf | docx | txt | trade_table | ...
    status: DocStatus;
    reason?: string | null;
}

export interface PackStatus {
    pack_id: string;
    name: string;
    state: PackState;
    created_at?: string;
    total_files: number;
    processed_files: number;
    counts: Partial<Record<DocStatus, number>>;
    trade_tables: number;
    hash_mismatches: number;
    pack_hash?: string | null;
    files?: PackFileReport[]; // present on GET /packs/{id}/status
}

export interface CaseSummary {
    case_id: string;
    question: string;
    as_of_date: string; // YYYY-MM-DD
    pack_id: string;
    countries: string[];
    sectors: string[];
    status: string;
}

export interface CreateCaseBody {
    question: string;
    as_of_date: string;
    pack_id: string;
}