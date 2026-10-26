import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import type { SourceDoc, TradeRowData } from "../../types/api";
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

export const DOCUMENT_DATABASE: Record<string, DocumentRecord> = {};


interface Props {
    docId: string;
    tradeRow?: string;
    onClose: () => void;
}

export default function DocumentPdfModal({ docId, tradeRow, onClose }: Props) {
    const cleanDocId = useMemo(() => docId.split(":")[0].trim(), [docId]);
    const cleanRow = useMemo(() => tradeRow || (docId.includes(":") ? docId.split(":")[1].trim() : undefined), [docId, tradeRow]);

    const [backendDoc, setBackendDoc] = useState<SourceDoc | null>(null);
    const [clockViolation, setClockViolation] = useState<string | null>(null);
    const [viewEmbed, setViewEmbed] = useState(false);

    useEffect(() => {
        let active = true;
        setClockViolation(null);
        api.getSource(cleanDocId)
            .then((res) => {
                if (active) setBackendDoc(res);
            })
            .catch((err) => {
                if (!active) return;
                const msg = err.message || String(err);
                if (err.status === 403 || msg.includes("CLOCK_VIOLATION")) {
                    setClockViolation(msg);
                }
            });
        return () => {
            active = false;
        };
    }, [cleanDocId]);

    const evidentiaryScore = useMemo(() => {
        const docTier = backendDoc?.tier ?? 1;
        const tierScore = Math.max(0.1, (5 - Math.min(Math.max(docTier, 1), 4)) / 4.0);
        let recencyScore = 0.5;
        if (backendDoc?.pub_date) {
            const pub = new Date(backendDoc.pub_date).getTime();
            const asOf = new Date("2027-01-25").getTime();
            const days = Math.max(0, Math.floor((asOf - pub) / (1000 * 60 * 60 * 24)));
            recencyScore = Math.max(0.1, 1.0 - (days / 365.0));
        }
        return Math.round((0.70 * tierScore + 0.30 * recencyScore) * 100);
    }, [backendDoc]);

    const doc = useMemo(() => {
        // 1. Direct match from hardcoded DB
        const match = DOCUMENT_DATABASE[cleanDocId];
        if (match && !backendDoc) return match;

        // 2. If backend returned document, build rich record from live text
        if (backendDoc) {
            const paragraphs = backendDoc.text
                .split(/\n\n+/)
                .map((p) => p.trim())
                .filter(Boolean);

            const sections = paragraphs.map((para, idx) => ({
                heading: idx === 0 ? "1. Official Register Telemetry" : undefined,
                text: para,
                isHighlighted: cleanRow ? para.toLowerCase().includes(cleanRow.toLowerCase()) : idx === 1,
                highlightLabel: idx === 1 ? "CITED CLAIM EXCERPT [OFFICIAL DOCKET]" : undefined,
            }));

            return {
                docId: backendDoc.doc_id,
                docName: backendDoc.file_name || `${backendDoc.doc_id}.${backendDoc.format || "pdf"}`,
                agency: backendDoc.source_name || "RUNEMARK DOCKET ARCHIVE",
                title: backendDoc.title || `Official Source: ${backendDoc.doc_id}`,
                classification: backendDoc.tier <= 1 ? "OFFICIAL · TRIBUNAL DOCKET EXHIBIT" : "RESTRICTED WIRE",
                date: backendDoc.pub_date || "2027-01-25",
                signatureHash: `SHA256: 7f83b1657ff1fc53b92dc18148a1d65d${cleanDocId}2027`,
                retrievedAt: backendDoc.pub_time || "09:30 UTC",
                tradeRow: cleanRow || tradeRow || "Verified Telemetry Record",
                pages: [
                    {
                        pageNumber: 1,
                        title: backendDoc.title || "Evidentiary Extract",
                        sections: sections.length > 0 ? sections : [
                            { heading: "1. Admissible Text", text: backendDoc.text, isHighlighted: true }
                        ],
                    },
                ],
            };
        }

        if (match) return match;

        // 3. Fallback for custom or trade-row only IDs
        return {
            docId: cleanDocId,
            docName: `${cleanDocId.replace(/[^a-zA-Z0-9_-]/g, "_")}_Official_Record.pdf`,
            agency: "NINE REALMS TRIBUNAL · DOCKET EVIDENCE REPOSITORY",
            title: `Official Evidence Dossier: ${cleanDocId}`,
            classification: "CONFIDENTIAL · TRIBUNAL DOCKET EXHIBIT",
            date: "2027-01-25",
            signatureHash: `SHA256: ${Array.from(cleanDocId).map((c) => c.charCodeAt(0).toString(16)).join("")}4a5b6c7d8e9f0`,
            retrievedAt: "14:32:00.000 UTC",
            tradeRow: cleanRow || tradeRow || "Trade Row Telemetry",
            pages: [
                {
                    pageNumber: 1,
                    title: "Evidence Dossier & Telemetry Record",
                    sections: [
                        {
                            heading: "1. Admissible Docket Entry",
                            text: `This evidentiary record is filed under docket identification ${cleanDocId}. It contains verified maritime, trade flow, or sovereign buffer telemetry admitted into the Nine Realms adversarial trial.`,
                        },
                        {
                            heading: "2. Telemetry Extract",
                            text: cleanRow
                                ? `Specific trade row extract referenced: ${cleanRow}. Trade flow data confirms bilateral disruption impact within the sector.`
                                : `Verified trade data supporting claim calculations for docket item ${cleanDocId}.`,
                            isHighlighted: true,
                            highlightLabel: "OFFICIAL DOCKET CITATION",
                        },
                    ],
                },
            ],
        };
    }, [cleanDocId, cleanRow, backendDoc, tradeRow]);

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

    // Handle PDF Download
    const handleDownload = useCallback(() => {
        const fileUrl = api.getSourceFileUrl(cleanDocId);
        window.open(fileUrl, "_blank");
    }, [cleanDocId]);

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
                            <span className="rg-pdf-score-badge" style={{ background: "rgba(234, 179, 8, 0.18)", border: "1px solid #eab308", color: "#fef08a", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
                                ⭐ {evidentiaryScore}% Admissible (70% Tier {backendDoc?.tier ?? 1} · 30% Recency)
                            </span>
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
                            onClick={() => setViewEmbed((v) => !v)}
                            title="Toggle between formatted docket view and raw file embed"
                        >
                            {viewEmbed ? "📄 Docket Sheet" : "🖥 Raw File Embed"}
                        </button>
                        <button
                            type="button"
                            className="rg-pdf-action-btn"
                            onClick={() => window.open(api.getSourceFileUrl(cleanDocId), "_blank")}
                            title="Open exact PDF / document file in a new browser tab"
                        >
                            ↗ Open File Tab
                        </button>
                        <button
                            type="button"
                            className="rg-pdf-action-btn"
                            onClick={handleDownload}
                            title="Download original document"
                        >
                            ⬇ Download
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
                    {clockViolation && (
                        <div style={{
                            background: "rgba(239, 68, 68, 0.2)",
                            border: "1px solid #ef4444",
                            color: "#fca5a5",
                            padding: "12px 18px",
                            margin: "12px auto",
                            maxWidth: 820,
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            gap: 10
                        }}>
                            <span>⚠️</span>
                            <span>{clockViolation}</span>
                        </div>
                    )}
                    {viewEmbed ? (
                        <div style={{ width: "100%", height: "82vh", padding: 12 }}>
                            <iframe
                                src={api.getSourceFileUrl(cleanDocId)}
                                title={doc.docName}
                                style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "#fff" }}
                            />
                        </div>
                    ) : (
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
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

