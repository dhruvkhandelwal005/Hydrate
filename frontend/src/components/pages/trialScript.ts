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
                title: "Rotterdam & Antwerp Deep-Water Berth Gridlock",
                body: "Vessel queuing exceeds 42 container ships. Inbound raw polymers face indefinite demurrage, exceeding plant storage buffers.",
                docId: "ORV-0412",
                docName: "Rotterdam_Berth_Manifest_Q3.pdf",
                confidence: 94,
                estimateLow: 40,
                estimateHigh: 55,
                nature: "fact",
                status: "asserted",
                attack: {
                    attacker: "Loki",
                    weaknessType: "ignored substitution",
                    critique: "Thor assumes fixed port routing; ignores barge and feeder transshipment via Wilhelmshaven and Dunkirk terminals.",
                },
                rebuttal: {
                    type: "DEFEND",
                    reason: "Secondary feeder drafts at Dunkirk cannot accommodate ultra-large container vessels (ULCVs) carrying bulk resin polymers.",
                    newDocId: "ORV-0899",
                    newDocName: "Rhine_Barge_Low_Water_Draft_Advisory.pdf",
                },
            },
            {
                id: "T-102",
                title: "Tier-2 Semiconductor Lead Times Surge to 34 Weeks",
                body: "Disruption at Malacca Strait bypasses adds 18 transit days. Automotive OEM safety buffers depleted within 12 days.",
                docId: "ORV-0388",
                docName: "Microelectronics_Supply_Route_Audit.docx",
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
                docId: "ORV-0501",
                docName: "Trade_Table_Commodities_Index.csv",
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
                text: '"port berth congestion Rotterdam Antwerp container wait times"',
            },
            {
                tag: "FILTERS",
                text: "country in [NL, BE], sector=Chemicals, date<=as_of",
            },
            {
                tag: "RETRIEVED",
                text: "Retrieved maritime terminal status records ORV-0412 and ORV-0388",
                docIds: ["ORV-0412", "ORV-0388"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-101: Rotterdam berth gridlock estimate 40% to 55%",
                docIds: ["ORV-0412"],
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
                text: "Retrieved commodity pricing index ORV-0501 and rail telemetry ORV-0622",
                docIds: ["ORV-0501", "ORV-0622"],
            },
            {
                tag: "CLAIM",
                text: "Asserted T-103: Spot alloy price inflation estimate 38% to 48%",
                docIds: ["ORV-0501"],
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
                text: "Retrieved IATA fuel surcharge matrix ORV-0771",
                docIds: ["ORV-0771"],
            },
            {
                tag: "ATTACK",
                text: "Attacked L-203: weakness=physical vs commercial (fuel surcharges +210% render bulk air bridge non-viable)",
                docIds: ["ORV-0771"],
            },
            {
                tag: "BLOCKED",
                text: 'Duplicate query blocked: "port berth congestion Rotterdam" violates no-repeat rule',
            },
            {
                tag: "REBUTTAL",
                text: "Evaluating Loki attack on T-101; fetching secondary barge telemetry ORV-0899",
                docIds: ["ORV-0899"],
            },
            {
                tag: "DEFEND",
                text: "Defended T-101: Draft depths at Rhine feeders prevent ULCV resin transshipment",
                docIds: ["ORV-0899"],
            },
        ],
    },
    loki: {
        claims: [
            {
                id: "L-201",
                title: "Sovereign Strategic Stockpiles Hold 60-Day Cushion",
                body: "Government-mandated reserves of critical polymers and diesel are fully primed. No industrial rationing required before Day 45.",
                docId: "ORV-0711",
                docName: "EU_Energy_And_Reserves_Directive.pdf",
                confidence: 92,
                estimateLow: 5,
                estimateHigh: 15,
                nature: "fact",
                status: "asserted",
            },
            {
                id: "L-202",
                title: "Automated Dual-Sourcing Clauses Active Under ISO-9001",
                body: "Contracts mandate automatic secondary supplier activation within 72 hours. Alternative Turkish & Iberian fabs absorb 60% of shortfall.",
                docId: "ORV-0544",
                docName: "Master_Supplier_Agreements_Annex_C.docx",
                confidence: 88,
                estimateLow: 10,
                estimateHigh: 22,
                nature: "fact",
                status: "asserted",
            },
            {
                id: "L-203",
                title: "Belly-Cargo Air Bridge Viable for High-Margin Electronics",
                body: "Lightweight chips and microcontrollers rerouted via chartered belly cargo with only a 1.2% final unit cost impact.",
                docId: "ORV-0490",
                docName: "Global_Air_Cargo_Availability_Matrix.xlsx",
                confidence: 85,
                estimateLow: 8,
                estimateHigh: 18,
                nature: "inference",
                status: "asserted",
                attack: {
                    attacker: "Thor",
                    weaknessType: "physical vs commercial",
                    critique: "Thor proves jet-A1 fuel surcharges and airframe shortages make widebody belly chartering commercially untenable for production runs.",
                },
                rebuttal: {
                    type: "CONCEDE",
                    reason: "Conceded: Verified aviation fuel surcharge spikes preclude commercial air bridge at tier-2 automotive scale.",
                },
            },
            {
                id: "L-204",
                title: "Paper Futures Panic Unwinds Once Spot Deliveries Arrive",
                body: "Commodity price spikes are speculative paper panics by futures desks. Physical customs manifests confirm continuous bilateral flow.",
                docId: "ORV-0680",
                docName: "Commodity_Exchange_Spot_Deliveries.txt",
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
                text: "Retrieved sovereign reserves filing ORV-0711",
                docIds: ["ORV-0711"],
            },
            {
                tag: "CLAIM",
                text: "Asserted L-201: Strategic stockpile buffer estimate 5% to 15%",
                docIds: ["ORV-0711"],
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
                text: '"physical spot delivery records Rotterdam customs manifests"',
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
                text: "Examining Thor claim T-101 (Rotterdam Port Chokepoint)",
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
                text: "Assessing Thor attack on L-203 regarding jet fuel surcharges ORV-0771",
                docIds: ["ORV-0771"],
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
                text: "Adjudicating T-101: Thor provided verified radar manifests ORV-0412 and defended against feeder substitution via ORV-0899",
                docIds: ["ORV-0412", "ORV-0899"],
            },
            {
                tag: "RULING",
                text: "Adjudicating L-201: Loki established sovereign reserve buffer via statutory directive ORV-0711",
                docIds: ["ORV-0711"],
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
                claimTitle: "Rotterdam & Antwerp Deep-Water Berth Gridlock",
                verdict: "Established",
                nature: "fact",
                decree: "Berth delays confirmed by Doc ORV-0412 radar manifests and defended by ORV-0899. Vessel queue exceeds 9.4 days; severe container demurrage upheld.",
                docId: "ORV-0412",
            },
            {
                claimId: "L-201",
                claimant: "Loki",
                claimTitle: "Sovereign Strategic Stockpiles Hold 60-Day Cushion",
                verdict: "Established",
                nature: "fact",
                decree: "Loki established statutory sovereign reserve buffers via Doc ORV-0711. Immediate industrial starvation claims are legally dispelled through Day 45.",
                docId: "ORV-0711",
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
                decree: "Trade index ORV-0501 confirms spot price spikes and bilateral force majeure declarations among precision metal alloys.",
                docId: "ORV-0501",
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
            "The Allfather has weighed Thor's alarm against Loki's counter-measures across 11 admissible docket documents. Maritime deep-water terminal paralysis at Rotterdam will severely stress tier-1 automotive logistics, but sovereign reserve buffers and contractual secondary corridors prevent a systemic industrial collapse before Day 45.",
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
