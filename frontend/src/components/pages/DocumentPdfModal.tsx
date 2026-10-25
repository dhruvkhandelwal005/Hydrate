import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import "./document-pdf-modal.css";

export interface DocumentRecord {
    docId: string;
    docName: string;
    agency: string;
    title: string;
    classification: string;
    date: string;
    pages: {
        pageNumber: number;
        title: string;
        sections: {
            heading?: string;
            text: string;
            isHighlighted?: boolean;
            highlightLabel?: string;
        }[];
        tableData?: {
            headers: string[];
            rows: (string | number)[][];
            highlightRowIndex?: number;
        };
    }[];
    tradeRow?: string;
    signatureHash: string;
    retrievedAt?: string;
}

export const DOCUMENT_DATABASE: Record<string, DocumentRecord> = {
    "ORV-0412": {
        docId: "ORV-0412",
        docName: "Rotterdam_Berth_Manifest_Q3.pdf",
        agency: "PORT OF ROTTERDAM AUTHORITY · MARITIME LOGISTICS DIVISION",
        title: "Maasvlakte II Deep-Water Container Terminal Congestion & Demurrage Audit",
        classification: "RESTRICTED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-24",
        signatureHash: "SHA256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        retrievedAt: "14:32:08.412 UTC",
        tradeRow: "T-07 row 5",
        pages: [
            {
                pageNumber: 1,
                title: "Executive Assessment & Deep-Water Berth Telemetry",
                sections: [
                    {
                        heading: "1. Operational Status Overview",
                        text: "This emergency situational report documents maritime offload constraints at the Maasvlakte deep-water complex following North Sea traffic channel bypass diversions. Container vessel queuing has escalated significantly beyond standard operating thresholds.",
                    },
                    {
                        heading: "2. Demurrage Telemetry & Supply Chain Exposure",
                        text: "Vessel queuing currently exceeds 42 Ultra-Large Container Vessels (ULCVs) at Maasvlakte berths 12 through 18. Average vessel wait time has increased to 9.4 days (+310% over pre-event baseline). Inbound raw polymers, industrial monomers, and bulk chemical feedstocks face indefinite demurrage, exceeding regional plant buffer capacities.",
                        isHighlighted: true,
                        highlightLabel: "CITED CLAIM EXCERPT [THOR T-101 / EXPOSURE FR7.3]",
                    },
                    {
                        text: "Downstream manufacturing facilities across Belgium and the Netherlands report feedstock reserve depletion within 14 days without emergency alternative barge allocation. Aggregate chemical sector trade value disruption is estimated between 40% and 55%.",
                        isHighlighted: true,
                    },
                ],
                tableData: {
                    headers: ["Terminal", "Berth ID", "Vessels Waiting", "Avg Demurrage", "Commodity Focus"],
                    rows: [
                        ["Maasvlakte II", "Berth 12", "14 ULCVs", "9.4 Days", "Polymers & Liquid Chemicals"],
                        ["Maasvlakte II", "Berth 14", "11 ULCVs", "8.7 Days", "Bulk Industrial Monomers"],
                        ["Antwerp Gateway", "Berth 09", "17 ULCVs", "10.2 Days", "Petrochemical Resins"],
                    ],
                    highlightRowIndex: 0,
                },
            },
            {
                pageNumber: 2,
                title: "Trade Flow Matrix & Sector Demurrage Table",
                sections: [
                    {
                        heading: "3. Trade Row Annex (FR7.4 Telemetry)",
                        text: "Customs manifest telemetry indicates that physical cargo arrival has decoupled from vessel arrival due to berth saturation. The following trade telemetry row records bilateral trade volume drop projections:",
                    },
                ],
                tableData: {
                    headers: ["Table Ref", "Trade Sector", "Country Pair", "Pre-Event Vol", "Projected Exposure", "Status"],
                    rows: [
                        ["T-07 row 1", "Refined Petroleum", "NL → DE", "420,000 MT", "12% to 18%", "Active"],
                        ["T-07 row 3", "Industrial Nitrogen", "BE → FR", "115,000 MT", "20% to 28%", "Constrained"],
                        ["T-07 row 5", "Polymers & Synthetic Resins", "Country A (NL/BE)", "310,000 MT", "40% to 55%", "Severe Demurrage"],
                        ["T-07 row 8", "Basic Inorganics", "NL → UK", "85,000 MT", "15% to 22%", "Delayed"],
                    ],
                    highlightRowIndex: 2,
                },
            },
            {
                pageNumber: 3,
                title: "Technical Corridor Alternatives & Feeder Feasibility",
                sections: [
                    {
                        heading: "4. Secondary Transshipment Evaluation",
                        text: "Attempts to divert ULCV traffic to secondary feeder terminals at Dunkirk and Wilhelmshaven have encountered secondary draft bottlenecks. Maximum draft constraints of 14.2m at Dunkirk exclude 85% of laden container ships.",
                    },
                    {
                        heading: "5. Certification of Record",
                        text: "Certified by Port of Rotterdam Operations Directorate. Admitted into Nine Realms Tribunal Docket under Evidence Reference ORV-0412.",
                    },
                ],
            },
        ],
    },
    "ORV-0388": {
        docId: "ORV-0388",
        docName: "Microelectronics_Supply_Route_Audit.pdf",
        agency: "MINISTRY OF ECONOMIC AFFAIRS & TRADE CORRIDOR TASKFORCE",
        title: "Malacca Strait Bypass Route Audit & Semiconductor Lead Times",
        classification: "RESTRICTED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-23",
        signatureHash: "SHA256: 4e912a78b88d3c16f001928374a5e62f0192a83746b5c4d3e2f1a09876543210",
        retrievedAt: "14:32:15.388 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Critical Microelectronics Logistics Telemetry",
                sections: [
                    {
                        heading: "1. Executive Findings: Maritime Choke Point Disruption",
                        text: "Maritime transit diversions avoiding key maritime choke points have extended transit times between East Asian fabrication hubs and European assembly lines by 18 to 22 calendar days.",
                    },
                    {
                        heading: "2. Automotive OEM Buffer Depletion",
                        text: "Tier-2 semiconductor lead times have surged to 34 weeks (+12 weeks over standard baseline). Automotive OEM safety buffers are depleted within 12 days. Lead time inflation heavily impacts automotive microcontrollers (MCUs), while industrial programmable logic controllers (PLCs) retain distributor stocks.",
                        isHighlighted: true,
                        highlightLabel: "CITED CLAIM EXCERPT [THOR T-102 / ODIN RULING]",
                    },
                    {
                        text: "Exposure in automotive electronic components is projected between 25% and 42%. Dual-sourcing activation under ISO-9001 contracts provides partial mitigation.",
                        isHighlighted: true,
                    },
                ],
                tableData: {
                    headers: ["Component Category", "Transit Route", "Lead Time Baseline", "Current Lead Time", "OEM Buffer"],
                    rows: [
                        ["Automotive MCUs (28nm)", "Malacca Bypass (Cape)", "22 Weeks", "34 Weeks", "12 Days"],
                        ["Industrial PLCs", "Overland Rail", "16 Weeks", "20 Weeks", "38 Days"],
                        ["Power MOSFETs", "Air / Sea Combined", "14 Weeks", "18 Weeks", "24 Days"],
                    ],
                    highlightRowIndex: 0,
                },
            },
            {
                pageNumber: 2,
                title: "Commodity Trade Flows: Grain & Bulk Agro Corridors",
                sections: [
                    {
                        heading: "3. Bulk Agro Transport Diversion",
                        text: "Bulk grain carriers diverted to secondary rail and coastal corridors exhibit 10% to 18% expected trade volume drop. Seasonal silo reserves in Country A cushion initial shortfall.",
                        isHighlighted: true,
                        highlightLabel: "CITED GRAIN SECTOR EXPOSURE [FR7.3 SPEC]",
                    },
                ],
                tableData: {
                    headers: ["Sector", "Origin / Dest", "Pre-Event Vol", "Projected Exposure", "Mitigation"],
                    rows: [
                        ["Grain & Cereals", "Country A → Regional Mills", "850,000 MT", "10% to 18%", "Domestic Silo Reserves"],
                        ["Soybean Meal", "Country A → Feedlots", "320,000 MT", "15% to 24%", "Rail Freight Swaps"],
                    ],
                    highlightRowIndex: 0,
                },
            },
        ],
    },
    "ORV-0501": {
        docId: "ORV-0501",
        docName: "Trade_Table_Commodities_Index.pdf",
        agency: "EUROPEAN METAL & ALLOY EXCHANGES CLEARING CORPORATION",
        title: "Precision Titanium & Specialty Alloys Spot Price Index and Force Majeure Notices",
        classification: "CONFIDENTIAL · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-24",
        signatureHash: "SHA256: 9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
        retrievedAt: "14:32:22.501 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Specialty Alloys Spot Pricing & Bilateral Notices",
                sections: [
                    {
                        heading: "1. Spot Price Surge Index",
                        text: "Spot contracts for aerospace-grade titanium and specialty nickel alloys have spiked +44% on mercantile exchanges following raw sponge shipment delays.",
                    },
                    {
                        heading: "2. Force Majeure Declarations",
                        text: "Seven major precision casting and aerospace component suppliers have issued bilateral force majeure notices under ICC Article 79. Trade exposure is established at 38% to 48% (Country B / Germany).",
                        isHighlighted: true,
                        highlightLabel: "CITED CLAIM EXCERPT [THOR T-103 / ODIN ESTABLISHED]",
                    },
                ],
                tableData: {
                    headers: ["Material", "Exchange Spot Spike", "Force Majeure Status", "Exposure Range", "Region"],
                    rows: [
                        ["Titanium Ti-6Al-4V", "+44.2%", "Declared (7 Suppliers)", "38% to 48%", "Country B / Germany"],
                        ["Inconel 718", "+28.6%", "Under Review", "20% to 30%", "Central Europe"],
                        ["Specialty Stainless 316L", "+14.1%", "Standard Delivery", "10% to 16%", "Nordic Corridors"],
                    ],
                    highlightRowIndex: 0,
                },
            },
        ],
    },
    "ORV-0711": {
        docId: "ORV-0711",
        docName: "EU_Energy_And_Reserves_Directive.pdf",
        agency: "EUROPEAN COMMISSION · DIRECTORATE FOR STRATEGIC RESERVES",
        title: "Sovereign Strategic Petroleum & Petrochemical Feedstock Buffer Audit",
        classification: "RESTRICTED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-22",
        signatureHash: "SHA256: 3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b",
        retrievedAt: "14:32:30.711 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Sovereign Stockpile Availability & Buffer Cushion",
                sections: [
                    {
                        heading: "1. Mandated Sovereign Reserves Audit",
                        text: "Under Council Directive 2009/119/EC, sovereign member states maintain statutory petroleum and critical polymer feedstock reserves equal to 90 days of average daily consumption.",
                    },
                    {
                        heading: "2. Strategic Stockpile Buffer Cushion",
                        text: "Government-mandated reserves of critical polymers and diesel are fully primed at 94% statutory capacity. Sovereign release protocols ensure no industrial rationing is required before Day 45, limiting near-term exposure to 5% to 15%.",
                        isHighlighted: true,
                        highlightLabel: "CITED COUNTER-CLAIM EXCERPT [LOKI L-201 / ODIN ESTABLISHED]",
                    },
                ],
                tableData: {
                    headers: ["Stockpile Category", "Current Prime Level", "Autonomy Cushion", "Disruption Floor", "Legal Basis"],
                    rows: [
                        ["Polymer Resins", "94.2%", "60 Days", "5% to 15%", "Council Directive 2009/119/EC"],
                        ["Ultra-Low Sulfur Diesel", "96.1%", "75 Days", "3% to 8%", "Strategic Energy Reserve"],
                        ["Chemical Solvents", "88.4%", "45 Days", "10% to 18%", "Industrial Buffer Protocol"],
                    ],
                    highlightRowIndex: 0,
                },
            },
        ],
    },
    "ORV-0544": {
        docId: "ORV-0544",
        docName: "Master_Supplier_Agreements_Annex_C.pdf",
        agency: "INTERNATIONAL ELECTRONICS & MANUFACTURING STANDARDS AUTHORITY",
        title: "ISO-9001 Master Supplier Agreements: Dual-Sourcing & Failover SLAs",
        classification: "CONFIDENTIAL · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-21",
        signatureHash: "SHA256: 1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e",
        retrievedAt: "14:32:38.544 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Automated Dual-Sourcing Protocol Verification",
                sections: [
                    {
                        heading: "1. Failover Provisions & Legal SLAs",
                        text: "Master contracts under ISO-9001 Annex C mandate automated secondary supplier activation within 72 hours of primary shipping choke point declaration.",
                    },
                    {
                        heading: "2. Secondary Capacity Absorption",
                        text: "Alternative semiconductor fabrication corridors across Iberia and Turkey retain contracted capacity to absorb up to 60% of tier-1 microelectronics shortfalls, holding exposure between 10% and 22%.",
                        isHighlighted: true,
                        highlightLabel: "CITED DEFENSE EXCERPT [LOKI L-202 / ODIN ESTABLISHED]",
                    },
                ],
            },
        ],
    },
    "ORV-0622": {
        docId: "ORV-0622",
        docName: "Central_Eurasian_Rail_Throughput.pdf",
        agency: "CENTRAL EURASIAN INTERMODAL RAILWAY DIRECTORATE",
        title: "Intermodal Break-of-Gauge Telemetry & Polish Border Capacity Report",
        classification: "RESTRICTED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-23",
        signatureHash: "SHA256: 8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d",
        retrievedAt: "14:32:44.622 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Overland Rail Hub Congestion",
                sections: [
                    {
                        heading: "1. Gauge Capacity Telemetry",
                        text: "Overland freight hubs along Polish and Kazakh corridors are currently operating at 180% gauge capacity. Transshipment yards cannot fully absorb maritime diversions without 12-day rolling clearance queues.",
                        isHighlighted: true,
                        highlightLabel: "CITED CLAIM EXCERPT [THOR T-104 / ODIN CONTESTED]",
                    },
                ],
            },
        ],
    },
    "ORV-0490": {
        docId: "ORV-0490",
        docName: "Global_Air_Cargo_Availability_Matrix.pdf",
        agency: "INTERNATIONAL AIR TRANSPORT ASSOCIATION (IATA)",
        title: "Commercial Belly-Cargo Feasibility & Widebody Charter Rate Analysis",
        classification: "UNCLASSIFIED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-22",
        signatureHash: "SHA256: 2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
        retrievedAt: "14:32:50.490 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Air Bridge Commercial Analysis",
                sections: [
                    {
                        heading: "1. Feasibility Benchmark",
                        text: "Initial proposals for widebody passenger belly-cargo air bridges for microelectronics face extreme jet fuel surcharge inflation (+210%), rendering mass air bridge transportation commercially unviable for volume production.",
                        isHighlighted: true,
                        highlightLabel: "CITED ATTACK EXCERPT [LOKI L-203 CONCEDED]",
                    },
                ],
            },
        ],
    },
    "ORV-0680": {
        docId: "ORV-0680",
        docName: "Commodity_Exchange_Spot_Deliveries.pdf",
        agency: "ROTTERDAM MERCANTILE CLEARING & PHYSICAL DELIVERY LEDGER",
        title: "Bilateral Spot Cargo Inflows & Paper Speculation De-coupling Audit",
        classification: "RESTRICTED · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-24",
        signatureHash: "SHA256: 5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
        retrievedAt: "14:32:56.680 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Physical Delivery vs Futures Panic",
                sections: [
                    {
                        heading: "1. Physical Customs Clearances",
                        text: "Commodity customs manifests confirm steady bilateral physical deliveries across Rotterdam inland waterways. Price spikes are identified primarily as paper futures speculation rather than physical cargo stoppage.",
                        isHighlighted: true,
                        highlightLabel: "CITED DEFENSE EXCERPT [LOKI L-204 / ODIN CONTESTED]",
                    },
                ],
            },
        ],
    },
    "ORV-0899": {
        docId: "ORV-0899",
        docName: "Rhine_Barge_Low_Water_Draft_Advisory.pdf",
        agency: "CENTRAL COMMISSION FOR NAVIGATION ON THE RHINE (CCNR)",
        title: "Secondary Feeder Draft Depths & Barge Transshipment Advisory",
        classification: "OFFICIAL · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-24",
        signatureHash: "SHA256: 7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c",
        retrievedAt: "14:33:02.899 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Rhine Low-Water Draft Constraints",
                sections: [
                    {
                        heading: "1. Draft Telemetry Constraints",
                        text: "Secondary feeder drafts at Rhine terminals cannot accommodate deep-water container diversion. ULCV bulk resin polymers cannot be transshipped via shallow river barges.",
                        isHighlighted: true,
                        highlightLabel: "CITED REBUTTAL EXCERPT [THOR REBUTTAL TO LOKI ATTACK]",
                    },
                ],
            },
        ],
    },
    "ORV-0771": {
        docId: "ORV-0771",
        docName: "IATA_Fuel_Surcharge_Matrix_2026.pdf",
        agency: "INTERNATIONAL AIR TRANSPORT ASSOCIATION (IATA)",
        title: "Global Aviation Fuel Surcharges & Commercial Air Freight Viability Index",
        classification: "OFFICIAL · TRIBUNAL DOCKET EXHIBIT",
        date: "2026-10-23",
        signatureHash: "SHA256: 4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
        retrievedAt: "14:33:09.771 UTC",
        pages: [
            {
                pageNumber: 1,
                title: "Fuel Surcharge Cost Escalation",
                sections: [
                    {
                        heading: "1. Fuel Surcharge Benchmark",
                        text: "Verified aviation fuel surcharges of +210% exceed economic feasibility margins for tier-2 bulk automotive components. Air bridge commercial non-viability upheld.",
                        isHighlighted: true,
                        highlightLabel: "CITED ATTACK EVIDENCE [THOR ATTACK ON LOKI L-203]",
                    },
                ],
            },
        ],
    },
};

interface Props {
    docId: string;
    tradeRow?: string;
    onClose: () => void;
}

export default function DocumentPdfModal({ docId, tradeRow, onClose }: Props) {
    const doc = useMemo(() => {
        // Direct match or lookup from DB
        const match = DOCUMENT_DATABASE[docId];
        if (match) return match;

        // Fallback for custom or trade-row only IDs
        return {
            docId,
            docName: `${docId.replace(/[^a-zA-Z0-9_-]/g, "_")}_Official_Record.pdf`,
            agency: "NINE REALMS TRIBUNAL · DOCKET EVIDENCE REPOSITORY",
            title: `Official Evidence Dossier: ${docId}`,
            classification: "CONFIDENTIAL · TRIBUNAL DOCKET EXHIBIT",
            date: "2026-10-24",
            signatureHash: `SHA256: ${Array.from(docId).map((c) => c.charCodeAt(0).toString(16)).join("")}4a5b6c7d8e9f0`,
            retrievedAt: "14:32:00.000 UTC",
            tradeRow: tradeRow || "Trade Row Telemetry",
            pages: [
                {
                    pageNumber: 1,
                    title: "Evidence Dossier & Telemetry Record",
                    sections: [
                        {
                            heading: "1. Admissible Docket Entry",
                            text: `This evidentiary record is filed under docket identification ${docId}. It contains verified maritime, trade flow, or sovereign buffer telemetry admitted into the Nine Realms adversarial trial.`,
                        },
                        {
                            heading: "2. Telemetry Extract",
                            text: tradeRow
                                ? `Specific trade row extract referenced: ${tradeRow}. Trade flow data confirms bilateral disruption impact within the sector.`
                                : `Verified trade data supporting claim calculations for docket item ${docId}.`,
                            isHighlighted: true,
                            highlightLabel: "OFFICIAL DOCKET CITATION",
                        },
                    ],
                },
            ],
        };
    }, [docId, tradeRow]);

    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(100);

    const totalPages = doc.pages.length;
    const pageData = doc.pages[currentPage - 1] || doc.pages[0];

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Handle PDF Download simulation
    const handleDownload = useCallback(() => {
        const content = `%PDF-1.4
%Nine Realms Evidence Record: ${doc.docId}
1 0 obj << /Title (${doc.title}) /Author (${doc.agency}) >> endobj
2 0 obj << /Type /Catalog /Pages 3 0 R >> endobj
trailer << /Root 2 0 R >>
%%EOF`;
        const blob = new Blob([content], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.docName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [doc]);

    return createPortal(
        <div
            className="rg-pdf-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rg-pdf-title"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="rg-pdf-viewer-window">
                {/* PDF Top Chrome Toolbar */}
                <header className="rg-pdf-toolbar">
                    <div className="rg-pdf-doc-meta">
                        <span className="rg-pdf-icon" aria-hidden="true">📄</span>
                        <div className="rg-pdf-meta-text">
                            <span className="rg-pdf-filename">{doc.docName}</span>
                            <span className="rg-pdf-docid-badge">{doc.docId}</span>
                            <span className="rg-pdf-verified-badge">✓ Heimdall Verified</span>
                        </div>
                    </div>

                    {/* Page & Zoom Navigation */}
                    <div className="rg-pdf-controls">
                        <div className="rg-pdf-page-nav">
                            <button
                                type="button"
                                className="rg-pdf-tool-btn"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                title="Previous Page"
                                aria-label="Previous Page"
                            >
                                ‹
                            </button>
                            <span className="rg-pdf-page-indicator">
                                Page <strong>{currentPage}</strong> of {totalPages}
                            </span>
                            <button
                                type="button"
                                className="rg-pdf-tool-btn"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                title="Next Page"
                                aria-label="Next Page"
                            >
                                ›
                            </button>
                        </div>

                        <div className="rg-pdf-zoom-nav">
                            <button
                                type="button"
                                className="rg-pdf-tool-btn"
                                onClick={() => setZoom((z) => Math.max(70, z - 10))}
                                title="Zoom Out"
                                aria-label="Zoom Out"
                            >
                                −
                            </button>
                            <span className="rg-pdf-zoom-level">{zoom}%</span>
                            <button
                                type="button"
                                className="rg-pdf-tool-btn"
                                onClick={() => setZoom((z) => Math.min(140, z + 10))}
                                title="Zoom In"
                                aria-label="Zoom In"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons & Close */}
                    <div className="rg-pdf-actions">
                        <button
                            type="button"
                            className="rg-pdf-action-btn"
                            onClick={handleDownload}
                            title="Download original PDF document"
                        >
                            ⬇ Download PDF
                        </button>
                        <button
                            type="button"
                            className="rg-pdf-action-btn print"
                            onClick={() => window.print()}
                            title="Print document"
                        >
                            🖨 Print
                        </button>
                        <button
                            type="button"
                            className="rg-pdf-close-btn"
                            onClick={onClose}
                            title="Close document viewer (Esc)"
                            aria-label="Close document viewer"
                        >
                            ×
                        </button>
                    </div>
                </header>

                {/* PDF Viewer Body & Rendered Paper Sheet */}
                <div className="rg-pdf-body-viewport">
                    <div
                        className="rg-pdf-paper-sheet"
                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
                    >
                        {/* Security Watermark */}
                        <div className="rg-pdf-watermark" aria-hidden="true">
                            RUNEMARK TRIBUNAL EVIDENCE · CONFIDENTIAL DOCKET
                        </div>

                        {/* Letterhead Header */}
                        <div className="rg-pdf-letterhead">
                            <div className="rg-pdf-crest">
                                <span className="crest-rune">ᚱ</span>
                                <div className="crest-lines">
                                    <span className="crest-agency">{doc.agency}</span>
                                    <span className="crest-sub">Official Maritime &amp; Supply Chain Disruption Audit</span>
                                </div>
                            </div>
                            <div className="rg-pdf-docket-stamp">
                                <div className="stamp-box">
                                    <span className="stamp-title">DOCKET EXHIBIT</span>
                                    <span className="stamp-id">{doc.docId}</span>
                                    <span className="stamp-date">{doc.date}</span>
                                </div>
                            </div>
                        </div>

                        {/* Document Title Header */}
                        <div className="rg-pdf-doc-header">
                            <span className="rg-pdf-classification">{doc.classification}</span>
                            <h2 id="rg-pdf-title" className="rg-pdf-main-title">{doc.title}</h2>
                            <div className="rg-pdf-meta-bar">
                                <span><strong>Document ID:</strong> {doc.docId}</span>
                                <span><strong>Filing Date:</strong> {doc.date}</span>
                                <span><strong>Docket Hash:</strong> <code>{doc.signatureHash.slice(0, 24)}...</code></span>
                                {tradeRow && <span><strong>Referenced Row:</strong> <mark className="ref-mark">{tradeRow}</mark></span>}
                            </div>
                        </div>

                        {/* Section Content */}
                        <div className="rg-pdf-content">
                            <h3 className="rg-pdf-section-page-title">{pageData.title}</h3>

                            {pageData.sections.map((sec, idx) => (
                                <div
                                    key={idx}
                                    className={`rg-pdf-section ${sec.isHighlighted ? "highlighted-citation" : ""}`}
                                >
                                    {sec.highlightLabel && (
                                        <div className="rg-pdf-highlight-banner">
                                            <span className="banner-icon">🔍</span>
                                            <strong>{sec.highlightLabel}</strong>
                                        </div>
                                    )}
                                    {sec.heading && <h4 className="rg-pdf-sec-heading">{sec.heading}</h4>}
                                    <p className="rg-pdf-sec-text">{sec.text}</p>
                                </div>
                            ))}

                            {/* Telemetry Table */}
                            {pageData.tableData && (
                                <div className="rg-pdf-table-wrap">
                                    <table className="rg-pdf-table">
                                        <thead>
                                            <tr>
                                                {pageData.tableData.headers.map((h, i) => (
                                                    <th key={i}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageData.tableData.rows.map((row, rIdx) => {
                                                const isHighlighted = pageData.tableData?.highlightRowIndex === rIdx;
                                                return (
                                                    <tr key={rIdx} className={isHighlighted ? "highlighted-row" : ""}>
                                                        {row.map((cell, cIdx) => (
                                                            <td key={cIdx}>{cell}</td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Sheet Footer */}
                        <div className="rg-pdf-sheet-footer">
                            <div className="rg-pdf-footer-left">
                                <span className="rg-pdf-seal-badge">🛡️ Heimdall Cryptographic Attestation</span>
                                <span className="rg-pdf-sig-hash">SHA-256 Digest: {doc.signatureHash}</span>
                            </div>
                            <div className="rg-pdf-footer-right">
                                <span>Page {currentPage} of {totalPages}</span>
                                <span className="rg-pdf-barcode">||||| | |||| ||| |||||| || |</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

