// Shapes the frontend expects from the FastAPI backend.
// Fully aligns with Ragnarok Trial of the Nine Realms specification.

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
    run_id?: string;
    question: string;
    as_of_date: string; // YYYY-MM-DD
    pack_id: string;
    countries: string[];
    sectors: string[];
    event_hypothesis?: string;
    event_id?: string;
    verification_status?: "VERIFIED" | "NOT_VERIFIED" | "INSUFFICIENT";
    verification_reason?: string;
    verification_doc_ids?: string[];
    retrieval_queries?: string[];
    verification_evidence?: Array<{
        source_id: string;
        title: string;
        reliability: number | string;
        snippet?: string;
        composite_score?: number;
        source_type?: string;
        country?: string;
        sector?: string;
    }>;
    contradictions?: Array<{
        contradiction_id: string;
        source_a: string;
        source_b: string;
        topic: string;
        explanation: string;
        severity: string;
    }>;
    excluded_count?: number;
    phase?: string;
    status: string;
}

export interface CreateCaseBody {
    question: string;
    as_of_date: string;
    pack_id: string;
}

export interface CaseLimits {
    runs_used: number;
    runs_max: number;
    rounds_used: number;
    rounds_max: number;
    searches_used: number;
    searches_max: number;
    tokens_used: number;
    tokens_max: number;
}

export interface ClaimCitation {
    kind: "document" | "trade_row";
    doc_id?: string;
    table_id?: string;
    row?: string | number;
    pub_date?: string;
    pub_time?: string;
    file_url?: string;
}

export interface Calculation {
    formula: string;
    inputs: Record<string, any>;
    result: number;
}

export interface AttackInfo {
    by: "thor" | "loki" | string;
    weakness_type: string;
    text: string;
}

export interface RebuttalInfo {
    kind: "defend" | "concede" | string;
    text: string;
    new_doc_ids?: string[];
}

export interface ClaimItem {
    claim_id: string;
    agent: "thor" | "loki" | string;
    run_id: string;
    version: number;
    country: string;
    sector: string;
    title: string;
    text: string;
    nature: "fact" | "inference";
    status: "asserted" | "attacked" | "defended" | "conceded";
    estimate_low: number | null;
    estimate_high: number | null;
    unit: string;
    period: string;
    confidence: number;
    assumptions: string[];
    citations: ClaimCitation[];
    calculation?: Calculation;
    attack?: AttackInfo;
    rebuttal?: RebuttalInfo;
    lineage: string[];
    file_url?: string;
}

export interface RulingItem {
    claim_id: string;
    verdict: "established" | "contested" | "conceded" | "rejected";
    nature: "fact" | "inference";
    reason: string;
    doc_ids: string[];
    source_weight: number;
}

export interface AgentHeader {
    agent: "thor" | "loki";
    thesis: string;
    severity_index: number;
    severity_formula: string;
    risk_label: string;
}

export interface CaseDetails {
    case_id: string;
    run_id: string;
    run_number: number;
    phase: string;
    status: string;
    case_file: any;
    limits: CaseLimits;
    claims: ClaimItem[];
    rulings: RulingItem[];
    headers?: {
        thor?: AgentHeader;
        loki?: AgentHeader;
    };
}

export interface OdinDecree {
    headline: string;
    exposure_low: number;
    exposure_high: number;
    unit: string;
    confidence: number;
}

export interface CaseRuling {
    decree: OdinDecree;
    determination: string;
    rulings: RulingItem[];
    dissent?: string;
    sufficiency: {
        state: "sufficient" | "research_required";
        gaps: Array<{ country?: string; sector?: string; missing?: string }>;
    };
    recommendations: string[];
}

export interface SourceDoc {
    doc_id: string;
    title: string;
    file_name: string;
    format: string;
    source_name: string;
    source_type: string;
    tier: number;
    pub_date: string;
    pub_time: string;
    country: string;
    sector: string;
    event_id: string;
    language: string;
    flags: {
        retracted: boolean;
        corrected_by: string | null;
        injection_suspected: boolean;
        partial: boolean;
        duplicate_of: string | null;
    };
    text: string;
    file_url?: string;
    spans?: Array<{ id: string; start: number; end: number; claim_ids: string[] }>;
}

export interface TradeRowData {
    table_id: string;
    row: number;
    header: {
        country_pair: string;
        sector: string;
        unit: string;
        period: string;
        event_id?: string;
    };
    columns: string[];
    values: any[];
    status: string;
    reason: string | null;
}

export interface ExposureTableRow {
    country: string;
    sector: string;
    thor: { low: number; high: number };
    loki: { low: number; high: number };
    odin: { low: number; high: number };
    confidence: number;
    coverage: {
        baseline: boolean;
        disruption: boolean;
        substitution: boolean;
    };
    evidence: Array<{ kind: "document" | "trade_row"; doc_id?: string; table_id?: string; row?: number }>;
    insufficient_evidence: boolean;
}

export interface ExposureTableResponse {
    unit: string;
    period: string;
    rows: ExposureTableRow[];
}

export interface BriefingFinding {
    claim_id: string;
    finding: string;
    nature: "fact" | "inference";
    doc_ids: string[];
}

export interface ExecutiveBriefingResponse {
    case_id: string;
    run_id: string;
    status: string;
    verification: {
        status: string;
        summary: string;
        doc_ids: string[];
    };
    executive_summary: string;
    established: BriefingFinding[];
    contested: BriefingFinding[];
    conceded: BriefingFinding[];
    exposure_table: any[];
    outlook: {
        base: { text: string; assumptions: string[] };
        upside: any;
        downside: any;
    };
    assumptions: string[];
    sources: Array<{ doc_id: string; title: string; pub_date: string; pub_time: string; tier: number }>;
}

export interface JudgeComplianceItem {
    id: string;
    label: string;
    ok: boolean;
    proof: string[];
}

export interface JudgeComplianceResponse {
    items: JudgeComplianceItem[];
}

export interface StreamEvent {
    id: string;
    case_id: string;
    run_id: string;
    agent: "heimdall" | "thor" | "loki" | "odin" | "system" | string;
    ts: string;
    type: string;
    payload: Record<string, any>;
}