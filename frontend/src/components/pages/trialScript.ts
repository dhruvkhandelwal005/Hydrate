// Trial script data model and execution engine.
// Can be swapped for an SSE stream at GET /api/v1/cases/{case_id}/stream without touching the UI.

export type ClaimNature = "fact" | "inference";
export type ClaimStatus = "asserted" | "attacked" | "defended" | "conceded";
export type RulingVerdict = "Established" | "Contested" | "Conceded" | "Rejected";

export interface Claim {
    id: string;
    title: string;
    body: string;
    docId: string;
    docName: string;
    country: string;
    sector: string;
    confidence: number;
    estimateLow: number;
    estimateHigh: number;
    nature: ClaimNature;
    status: ClaimStatus;
    attack?: {
        attacker: "Thor" | "Loki";
        weaknessType: string; // e.g. "ignored substitution", "stale source", "physical vs commercial"
        critique: string;
    };
    rebuttal?: {
        type: "DEFEND" | "CONCEDE";
        reason: string;
        newDocId?: string;
        newDocName?: string;
    };
}

export type LogEventTag =
    | "SEARCH"
    | "FILTERS"
    | "RETRIEVED"
    | "CLAIM"
    | "ATTACK"
    | "REBUTTAL"
    | "DEFEND"
    | "CONCEDE"
    | "RULING"
    | "BLOCKED"
    | "SANDBOX";

export interface LogLine {
    id: string;
    time: string; // HH:mm:ss.SSS
    tag: LogEventTag;
    text: string;
    docIds?: string[];
}

export interface OdinRuling {
    claimId: string;
    claimant: "Thor" | "Loki";
    claimTitle: string;
    verdict: RulingVerdict;
    nature: ClaimNature;
    decree: string;
    docId: string;
}

export interface ExecutiveDirective {
    id: string;
    title: string;
    detail: string;
}

export interface ExposureEvidenceItem {
    id: string; // e.g. "ORV-0024" or "T-07 row 5"
    docId?: string;
    tradeRow?: string;
    label: string;
    description?: string;
}

export interface ExposureMetric {
    display: string; // e.g. "55%", "20%", "28 to 42%", or "insufficient evidence"
    low?: number;
    high?: number;
    docId?: string;
    tradeRow?: string;
    isInsufficient?: boolean;
}

export interface ExposureRow {
    id: string;
    country: string;
    sector: string;
    thorHigh: ExposureMetric;
    lokiLow: ExposureMetric;
    odinFinal: ExposureMetric;
    evidence: ExposureEvidenceItem[];
    nextQuarterOutlook: {
        projectedRange: string;
        trajectory: "improving" | "stable" | "deteriorating" | "unquantified";
        assumptions: string;
    };
    category: "benchmark" | "trial";
}

export interface TrialScriptData {
    thor: {
        claims: Claim[];
        round1Log: Omit<LogLine, "id" | "time">[];
        round2Log: Omit<LogLine, "id" | "time">[];
    };
    loki: {
        claims: Claim[];
        round1Log: Omit<LogLine, "id" | "time">[];
        round2Log: Omit<LogLine, "id" | "time">[];
    };
    odin: {
        log: Omit<LogLine, "id" | "time">[];
        rulings: OdinRuling[];
        synthesis: string;
        riskScore: number;
        directives: ExecutiveDirective[];
    };
}

export const TRIAL_SCRIPT: TrialScriptData = {
    thor: {
        claims: [
            {
                id: "T-101",
                title: "Orvan Deep Harbor & Bulk Pier Transit Gridlock",
                body: "Vessel queuing exceeds 42 bulk grain freighters. Inbound grain and agricultural feedstock face indefinite demurrage, exceeding silo storage buffers.",
                docId: "ORV-0002",
                docName: "Orvan_Corridor_Transit_Manifest.pdf",
                country: "Midgard / Tolan",
                sector: "Wheat & Grain",
                confidence: 94,
                estimateLow: 40,
                estimateHigh: 55,
                nature: "fact",
                status: "asserted",
                attack: {
                    attacker: "Loki",
                    weaknessType: "ignored substitution",
                    critique: "Thor assumes fixed port routing; ignores Ravik rail transshipment and Vanir maritime terminals.",
                },
                rebuttal: {
                    type: "DEFEND",
                    reason: "Secondary rail gauge transshipment at Ravik border terminals lacks bulk grain hoppers to match maritime bulk capacity.",
                    newDocId: "ORV-0021",
                    newDocName: "Ravik_Rail_Throughput_Audit.pdf",
                },
            },
            {
                id: "T-102",
                title: "Maize & Feedstock Inflow Lead Times Surge Across Tolan",
                body: "Disruption at Orvan corridor checkpoints adds 18 transit days. Tolan agricultural feed safety buffers depleted within 14 days.",
                docId: "ORV-0009",
                docName: "Agricultural_Feedstock_Trade_Telemetry.txt",
                country: "Tolan",
                sector: "Maize & Feedstock",
                confidence: 89,
                estimateLow: 25,
                estimateHigh: 42,
                nature: "inference",
                status: "asserted",
            },
            {
                id: "T-103",
                title: "Spot Titanium & Specialty Alloys Surge +44%",
                body: "Spot contracts triggering force majeure notices across 7 major aerospace and precision manufacturing suppliers.",
                docId: "ORV-0017",
                docName: "Trade_Table_Commodities_Index.csv",
                country: "Germany",
                sector: "Specialty alloys",
                confidence: 91,
                estimateLow: 38,
                estimateHigh: 48,
                nature: "fact",
                status: "asserted",
            },
            {
                id: "T-104",
                title: "Overland Freight Hubs Operating at 180% Gauge Capacity",
                body: "Transshipment terminals along Polish and Kazakh corridors cannot absorb maritime container diversion.",
                docId: "ORV-0622",
                docName: "Central_Eurasian_Rail_Throughput.txt",
                country: "Poland",
                sector: "Port logistics",
                confidence: 86,
                estimateLow: 15,
                estimateHigh: 30,
                nature: "inference",
                status: "asserted",
            },
        ],
        round1Log: [
            {
                tag: "SANDBOX",
                text: "Blind docket mode active: Loki claims masked from evaluation context",
            },
            {
                tag: "SEARCH",
                text: '"port berth congestion Orvan Ravik Port container wait times"',
            },
            {
                tag: "FILTERS",
                text: "country in [NL, BE], sector=Chemicals, date<=as_of",
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved maritime terminal status records ORV-0024 and ORV-0388",
                docIds: ["ORV-0024", "ORV-0388"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-101: Orvan berth gridlock estimate 40% to 55%",
                docIds: ["ORV-0024"],
            },
            {
                tag: "SEARCH",
                text: '"semiconductor wafer transit delay Malacca Strait automotive"',
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved supply chain audit log ORV-0388",
                docIds: ["ORV-0388"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-102: Tier-2 semiconductor lead time estimate 25% to 42%",
                docIds: ["ORV-0388"],
            },
            {
                tag: "SEARCH",
                text: '"specialty alloys titanium spot contracts force majeure"',
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved commodity pricing index ORV-0017 and rail telemetry ORV-0622",
                docIds: ["ORV-0017", "ORV-0622"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-103: Spot alloy price inflation estimate 38% to 48%",
                docIds: ["ORV-0017"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-104: Overland transshipment bottleneck estimate 15% to 30%",
                docIds: ["ORV-0622"],
            },
        ],
        round2Log: [
            {
                tag: "ATTACK",
                text: "Examining Loki claim L-203 (Belly-Cargo Air Bridge Feasibility)",
            },
            {
                tag: "SEARCH",
                text: '"air freight widebody belly capacity jet-A1 fuel surcharge 2026"',
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved IATA fuel surcharge matrix ORV-0034",
                docIds: ["ORV-0034"],
            },
            {
                tag: "ATTACK",
                text: "Attacked L-203: weakness=physical vs commercial (fuel surcharges +210% render bulk air bridge non-viable)",
                docIds: ["ORV-0034"],
            },
            {
                tag: "BLOCKED",
                text: 'Duplicate query blocked: "port berth congestion Orvan" violates no-repeat rule',
            },
            {
                tag: "REBUTTAL",
                text: "Evaluating Loki attack on T-101; fetching secondary barge telemetry ORV-0047",
                docIds: ["ORV-0047"],
            },
            {
                tag: "DEFEND",
                text: "Defended T-101: Draft depths at regional feeder links prevent ULCV resin transshipment",
                docIds: ["ORV-0047"],
            },
        ],
    },
    loki: {
        claims: [
            {
                id: "L-201",
                title: "Sovereign Strategic Grain Stockpiles Hold 60-Day Buffer",
                body: "Government-mandated grain and wheat reserves across Midgard and Tolan are fully stocked. No domestic rationing required before Day 60.",
                docId: "ORV-0012",
                docName: "Realm_Strategic_Grain_Reserves_Directive.pdf",
                country: "Midgard / Tolan",
                sector: "Wheat & Grain",
                confidence: 92,
                estimateLow: 5,
                estimateHigh: 15,
                nature: "fact",
                status: "asserted",
            },
            {
                id: "L-202",
                title: "Ravik Overland Rail Rerouting Clauses Active",
                body: "Contracts mandate automatic secondary overland routing through Ravik within 72 hours. Alternative rail routes absorb 45% of grain shortfall.",
                docId: "ORV-0035",
                docName: "Ravik_Overland_Transit_Treaty.docx",
                country: "Ravik",
                sector: "Logistics & Grain",
                confidence: 88,
                estimateLow: 10,
                estimateHigh: 22,
                nature: "fact",
                status: "asserted",
            },
            {
                id: "L-203",
                title: "Emergency Air Cargo Lift Viable for Critical Seeds & Maize",
                body: "High-value agricultural seeds and specialized maize cultivars rerouted via chartered cargo with minimal net landed cost impact.",
                docId: "ORV-0042",
                docName: "Vanir_Air_Cargo_Telemetry.txt",
                country: "Vanir",
                sector: "Maize & Agricultural",
                confidence: 85,
                estimateLow: 8,
                estimateHigh: 18,
                nature: "inference",
                status: "asserted",
                attack: {
                    attacker: "Thor",
                    weaknessType: "physical vs commercial",
                    critique: "Thor proves bulk aviation fuel surcharges and payload constraints make air freight commercially untenable for bulk grain.",
                },
                rebuttal: {
                    type: "CONCEDE",
                    reason: "Conceded: Verified aviation fuel surcharge spikes preclude commercial air lift at bulk agricultural scale.",
                },
            },
            {
                id: "L-204",
                title: "Paper Futures Panic Unwinds Once Spot Deliveries Arrive",
                body: "Grain price spikes are speculative paper panics by futures traders. Physical customs manifests confirm continuous bilateral overland deliveries.",
                docId: "ORV-0021",
                docName: "Realm_Mercantile_Customs_Deliveries.txt",
                country: "Midgard",
                sector: "Wheat & Commodities",
                confidence: 90,
                estimateLow: 12,
                estimateHigh: 20,
                nature: "inference",
                status: "asserted",
            },
        ],
        round1Log: [
            {
                tag: "SANDBOX",
                text: "Blind docket mode active: Thor claims masked from evaluation context",
            },
            {
                tag: "SEARCH",
                text: '"strategic petroleum reserves chemical feedstocks mandated buffer"',
            },
            {
                tag: "FILTERS",
                text: "scope=European Union, commodity=Polymer/Diesel, date<=as_of",
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved sovereign reserves filing ORV-0012",
                docIds: ["ORV-0012"],
            },
            {
                tag: "CLAIM",
                text: "Asserted L-201: Strategic stockpile buffer estimate 5% to 15%",
                docIds: ["ORV-0012"],
            },
            {
                tag: "SEARCH",
                text: '"secondary supplier SLA master agreement clauses ISO-9001"',
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved supplier framework ORV-0544 and air cargo register ORV-0490",
                docIds: ["ORV-0544", "ORV-0490"],
            },
            {
                tag: "CLAIM",
                text: "Asserted L-202: Automated secondary sourcing estimate 10% to 22%",
                docIds: ["ORV-0544"],
            },
            {
                tag: "CLAIM",
                text: "Asserted L-203: Belly-cargo air bridge estimate 8% to 18%",
                docIds: ["ORV-0490"],
            },
            {
                tag: "SEARCH",
                text: '"physical spot delivery records Orvan customs manifests"',
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved commodity spot delivery ledger ORV-0680",
                docIds: ["ORV-0680"],
            },
            {
                tag: "CLAIM",
                text: "Asserted L-204: Futures speculation unwinding estimate 12% to 20%",
                docIds: ["ORV-0680"],
            },
        ],
        round2Log: [
            {
                tag: "ATTACK",
                text: "Examining Thor claim T-101 (Orvan Port Chokepoint)",
            },
            {
                tag: "SEARCH",
                text: '"Wilhelmshaven feeder barge diversion container capacity"',
            },
            {
                tag: "ATTACK",
                text: "Attacked T-101: weakness=ignored substitution (overlooks secondary feeder ports in northern corridor)",
            },
            {
                tag: "REBUTTAL",
                text: "Assessing Thor attack on L-203 regarding jet fuel surcharges ORV-0034",
                docIds: ["ORV-0034"],
            },
            {
                tag: "CONCEDE",
                text: "Conceded L-203: Commercial air freight margins cannot offset maritime bulk volumes",
            },
        ],
    },
    odin: {
        log: [
            {
                tag: "RULING",
                text: "Allfather court in session: Auditing 8 claims across 11 admissible docket documents",
            },
            {
                tag: "FILTERS",
                text: "Enforcing chronological cutoff date; discarding all intelligence after as_of",
            },
            {
                tag: "RULING",
                text: "Adjudicating T-101: Thor provided verified radar manifests ORV-0024 and defended against feeder substitution via ORV-0047",
                docIds: ["ORV-0024", "ORV-0047"],
            },
            {
                tag: "RULING",
                text: "Adjudicating L-201: Loki established sovereign reserve buffer via statutory directive ORV-0012",
                docIds: ["ORV-0012"],
            },
            {
                tag: "RULING",
                text: "Adjudicating L-203: Concession noted on the record; air bridge hypothesis struck down",
            },
            {
                tag: "RULING",
                text: "Final synthesis compiled: Moderate exposure ruled (58% net risk index)",
            },
        ],
        rulings: [
            {
                claimId: "T-101",
                claimant: "Thor",
                claimTitle: "Orvan Corridor & Maritime Port Deep-Water Berth Gridlock",
                verdict: "Established",
                nature: "fact",
                decree: "Berth delays confirmed by Doc ORV-0024 radar manifests and defended by ORV-0047. Vessel queue exceeds 9.4 days; severe container demurrage upheld.",
                docId: "ORV-0024",
            },
            {
                claimId: "L-201",
                claimant: "Loki",
                claimTitle: "Sovereign Strategic Stockpiles Hold 60-Day Cushion",
                verdict: "Established",
                nature: "fact",
                decree: "Loki established statutory sovereign reserve buffers via Doc ORV-0012. Immediate industrial starvation claims are legally dispelled through Day 45.",
                docId: "ORV-0012",
            },
            {
                claimId: "T-102",
                claimant: "Thor",
                claimTitle: "Tier-2 Semiconductor Lead Times Surge to 34 Weeks",
                verdict: "Contested",
                nature: "inference",
                decree: "Lead time inflation confirmed in Doc ORV-0388, but localized to automotive MCUs; industrial process control PLCs retain standard distributor inventory.",
                docId: "ORV-0388",
            },
            {
                claimId: "L-202",
                claimant: "Loki",
                claimTitle: "Automated Dual-Sourcing Clauses Active Under ISO-9001",
                verdict: "Established",
                nature: "fact",
                decree: "Document ORV-0544 verifies enforceable secondary supplier SLAs. Iberian manufacturing facilities can absorb up to 45% of tier-1 components.",
                docId: "ORV-0544",
            },
            {
                claimId: "T-103",
                claimant: "Thor",
                claimTitle: "Spot Titanium & Specialty Alloys Surge +44%",
                verdict: "Established",
                nature: "fact",
                decree: "Trade index ORV-0017 confirms spot price spikes and bilateral force majeure declarations among precision metal alloys.",
                docId: "ORV-0017",
            },
            {
                claimId: "L-203",
                claimant: "Loki",
                claimTitle: "Belly-Cargo Air Bridge Viable for High-Margin Electronics",
                verdict: "Conceded",
                nature: "inference",
                decree: "Conceded during Round 2 cross-examination. Jet fuel surcharges and widebody airframe shortages render air bridge commercially non-viable.",
                docId: "ORV-0490",
            },
            {
                claimId: "T-104",
                claimant: "Thor",
                claimTitle: "Overland Freight Hubs Operating at 180% Gauge Capacity",
                verdict: "Contested",
                nature: "inference",
                decree: "Transshipment telemetry in ORV-0622 confirms break-of-gauge delays, but alternative southern routes retain 30% uncommitted capacity.",
                docId: "ORV-0622",
            },
            {
                claimId: "L-204",
                claimant: "Loki",
                claimTitle: "Paper Futures Panic Unwinds Once Spot Deliveries Arrive",
                verdict: "Contested",
                nature: "inference",
                decree: "Customs manifests in ORV-0680 indicate physical delivery stabilization, but risk premiums remain elevated until maritime bottlenecks clear.",
                docId: "ORV-0680",
            },
        ],
        synthesis:
            "The Allfather has weighed Thor's alarm against Loki's counter-measures across 11 admissible docket documents. Maritime deep-water terminal paralysis at Orvan will severely stress tier-1 automotive logistics, but sovereign reserve buffers and contractual secondary corridors prevent a systemic industrial collapse before Day 45.",
        riskScore: 58,
        directives: [
            {
                id: "DIR-1",
                title: "Corridor Activation",
                detail: "Trigger contractual secondary supplier agreements across Iberian and Turkish rail logistics within 48 hours.",
            },
            {
                id: "DIR-2",
                title: "Strategic Buffer Release",
                detail: "Authorize release of 15% strategic chemical polymer reserves to dampen spot market speculative bidding.",
            },
            {
                id: "DIR-3",
                title: "Customs Demurrage Waiver",
                detail: "Order expedited green-lane clearance and waive demurrage penalties for containers carrying essential automotive microcontrollers.",
            },
        ],
    },
};

// Helper: Format real timestamps as HH:mm:ss.SSS
export function formatLogTime(d: Date = new Date()): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const ms = pad(d.getMilliseconds(), 3);
    return `${h}:${m}:${s}.${ms}`;
}

// Function to run a trial step (can be wired to SSE stream later)
export async function runTrialStep(step: "round1"): Promise<{
    thorLog: Omit<LogLine, "id" | "time">[];
    thorClaims: Claim[];
    lokiLog: Omit<LogLine, "id" | "time">[];
    lokiClaims: Claim[];
}>;
export async function runTrialStep(step: "round2"): Promise<{
    thorLog: Omit<LogLine, "id" | "time">[];
    lokiLog: Omit<LogLine, "id" | "time">[];
    attacks: {
        thorAttacks: string;
        lokiAttacks: string;
    };
}>;
export async function runTrialStep(step: "odin"): Promise<{
    odinLog: Omit<LogLine, "id" | "time">[];
    rulings: OdinRuling[];
    synthesis: string;
    riskScore: number;
    directives: ExecutiveDirective[];
}>;
export async function runTrialStep(step: "round1" | "round2" | "odin") {
    switch (step) {
        case "round1":
            return {
                thorLog: TRIAL_SCRIPT.thor.round1Log,
                thorClaims: TRIAL_SCRIPT.thor.claims,
                lokiLog: TRIAL_SCRIPT.loki.round1Log,
                lokiClaims: TRIAL_SCRIPT.loki.claims,
            };
        case "round2":
            return {
                thorLog: TRIAL_SCRIPT.thor.round2Log,
                lokiLog: TRIAL_SCRIPT.loki.round2Log,
                attacks: {
                    thorAttacks: "L-203",
                    lokiAttacks: "T-101",
                },
            };
        case "odin":
            return {
                odinLog: TRIAL_SCRIPT.odin.log,
                rulings: TRIAL_SCRIPT.odin.rulings,
                synthesis: TRIAL_SCRIPT.odin.synthesis,
                riskScore: TRIAL_SCRIPT.odin.riskScore,
                directives: TRIAL_SCRIPT.odin.directives,
            };
    }
}

export const EXPOSURE_ROWS: ExposureRow[] = [
    {
        id: "exp-1",
        country: "Country A",
        sector: "Chemicals",
        thorHigh: {
            display: "55%",
            low: 40,
            high: 55,
            docId: "ORV-0024",
            tradeRow: "T-07 row 5",
        },
        lokiLow: {
            display: "20%",
            low: 20,
            high: 35,
            docId: "ORV-0012",
        },
        odinFinal: {
            display: "28 to 42%",
            low: 28,
            high: 42,
            docId: "ORV-0024",
        },
        evidence: [
            { id: "ORV-0024", docId: "ORV-0024", label: "ORV-0024", description: "Orvan Deep-Water Terminal Congestion Manifest" },
            { id: "T-07 row 5", docId: "ORV-0024", tradeRow: "T-07 row 5", label: "T-07 row 5", description: "Commodity Trade Flows — Polymer Feedstock Demurrage" },
        ],
        nextQuarterOutlook: {
            projectedRange: "14 to 22%",
            trajectory: "improving",
            assumptions: "Secondary feeder barges via Wilhelmshaven clear bulk monomer vessel queue within 45 days.",
        },
        category: "benchmark",
    },
    {
        id: "exp-2",
        country: "Country A",
        sector: "Grain",
        thorHigh: {
            display: "30%",
            low: 15,
            high: 30,
            docId: "ORV-0388",
        },
        lokiLow: {
            display: "5%",
            low: 5,
            high: 12,
            docId: "ORV-0544",
        },
        odinFinal: {
            display: "10 to 18%",
            low: 10,
            high: 18,
            docId: "ORV-0388",
        },
        evidence: [
            { id: "ORV-0388", docId: "ORV-0388", label: "ORV-0388", description: "Agro-Bulk Grain Corridor Routing Telemetry" },
        ],
        nextQuarterOutlook: {
            projectedRange: "4 to 9%",
            trajectory: "improving",
            assumptions: "Domestic rail grain reserves and Baltic land swaps normalize regional mill supply before next harvest.",
        },
        category: "benchmark",
    },
    {
        id: "exp-3",
        country: "Country B",
        sector: "Chemicals",
        thorHigh: {
            display: "40%",
            low: 25,
            high: 40,
            docId: "ORV-0017",
        },
        lokiLow: {
            display: "15%",
            low: 15,
            high: 24,
            docId: "ORV-0680",
        },
        odinFinal: {
            display: "20 to 30%",
            low: 20,
            high: 30,
            docId: "ORV-0017",
        },
        evidence: [
            { id: "ORV-0017", docId: "ORV-0017", label: "ORV-0017", description: "Specialty Chemicals Force Majeure Filings & Spot Index" },
        ],
        nextQuarterOutlook: {
            projectedRange: "12 to 20%",
            trajectory: "improving",
            assumptions: "Alternative Iberian & Turkish chemical synthesizers ramp production to fulfill bilateral supplier contracts.",
        },
        category: "benchmark",
    },
    {
        id: "exp-4",
        country: "Midgard",
        sector: "Wheat & Grain",
        thorHigh: {
            display: "55%",
            low: 40,
            high: 55,
            docId: "ORV-0002",
            tradeRow: "T-07 row 5",
        },
        lokiLow: {
            display: "15%",
            low: 5,
            high: 15,
            docId: "ORV-0012",
        },
        odinFinal: {
            display: "28 to 42%",
            low: 28,
            high: 42,
            docId: "ORV-0002",
        },
        evidence: [
            { id: "ORV-0002", docId: "ORV-0002", label: "ORV-0002", description: "Orvan Deep Harbor Transit Manifest & Demurrage Report" },
            { id: "T-07 row 5", docId: "ORV-0002", tradeRow: "T-07 row 5", label: "T-07 row 5", description: "Trade Matrix: Midgard Agricultural Grain Inflow" },
            { id: "ORV-0012", docId: "ORV-0012", label: "ORV-0012", description: "Realm Strategic Grain & Fertilizer Reserves Directive" },
        ],
        nextQuarterOutlook: {
            projectedRange: "14 to 22%",
            trajectory: "improving",
            assumptions: "Strategic reserve releases stabilize feedstock pricing while feeder vessels bypass deep-water bottlenecks.",
        },
        category: "trial",
    },
    {
        id: "exp-5",
        country: "Tolan",
        sector: "Maize & Agricultural",
        thorHigh: {
            display: "42%",
            low: 25,
            high: 42,
            docId: "ORV-0009",
        },
        lokiLow: {
            display: "10%",
            low: 10,
            high: 22,
            docId: "ORV-0035",
        },
        odinFinal: {
            display: "18 to 28%",
            low: 18,
            high: 28,
            docId: "ORV-0009",
        },
        evidence: [
            { id: "ORV-0009", docId: "ORV-0009", label: "ORV-0009", description: "Maize Supply Route & Lead Time Audit" },
            { id: "ORV-0035", docId: "ORV-0035", label: "ORV-0035", description: "Ravik Master Transit Treaty (Bilateral Overland Route)" },
        ],
        nextQuarterOutlook: {
            projectedRange: "8 to 15%",
            trajectory: "improving",
            assumptions: "Tolan grain milling operations switch 40% of agricultural procurement to overland rail corridors.",
        },
        category: "trial",
    },
    {
        id: "exp-6",
        country: "Vanir",
        sector: "Fertilizer & Chemicals",
        thorHigh: {
            display: "48%",
            low: 38,
            high: 48,
            docId: "ORV-0021",
        },
        lokiLow: {
            display: "12%",
            low: 12,
            high: 20,
            docId: "ORV-0042",
        },
        odinFinal: {
            display: "38 to 48%",
            low: 38,
            high: 48,
            docId: "ORV-0021",
        },
        evidence: [
            { id: "ORV-0017", docId: "ORV-0017", label: "ORV-0017", description: "Precision Titanium Spot Pricing Index & Force Majeure Notices" },
        ],
        nextQuarterOutlook: {
            projectedRange: "25 to 35%",
            trajectory: "stable",
            assumptions: "Limited smelter elasticity sustains elevated spot premiums; no counter-evidence found in docket.",
        },
        category: "trial",
    },
    {
        id: "exp-7",
        country: "Poland",
        sector: "Overland Rail & Intermodal Freight",
        thorHigh: {
            display: "30%",
            low: 15,
            high: 30,
            docId: "ORV-0622",
        },
        lokiLow: {
            display: "insufficient evidence",
            isInsufficient: true,
        },
        odinFinal: {
            display: "15 to 30%",
            low: 15,
            high: 30,
            docId: "ORV-0622",
        },
        evidence: [
            { id: "ORV-0622", docId: "ORV-0622", label: "ORV-0622", description: "Central Eurasian Rail Gauging and Bottleneck Telemetry" },
        ],
        nextQuarterOutlook: {
            projectedRange: "10 to 18%",
            trajectory: "improving",
            assumptions: "Expedited border customs throughput relieves 30% of transshipment yard backlog.",
        },
        category: "trial",
    },
    {
        id: "exp-8",
        country: "Norway",
        sector: "Renewable Power & Grid Equipment",
        thorHigh: {
            display: "insufficient evidence",
            isInsufficient: true,
        },
        lokiLow: {
            display: "insufficient evidence",
            isInsufficient: true,
        },
        odinFinal: {
            display: "insufficient evidence",
            isInsufficient: true,
        },
        evidence: [],
        nextQuarterOutlook: {
            projectedRange: "insufficient evidence",
            trajectory: "unquantified",
            assumptions: "No claims or trade telemetries submitted for Nordic hydro or power grid infrastructure.",
        },
        category: "trial",
    },
];
