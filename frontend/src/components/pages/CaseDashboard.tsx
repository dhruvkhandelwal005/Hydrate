import { useMemo, useState } from "react";
import type { CaseSummary, PackStatus } from "../../types/api";
import type {
    Claim,
    ExecutiveDirective,
    LogLine,
    OdinRuling,
} from "./trialScript";
import ExposureTable from "./ExposureTable";
import DocumentPdfModal from "./DocumentPdfModal";
import "./case-dashboard.css";

type Props = {
    caseFile: CaseSummary | null;
    pack: PackStatus | null;
    claims: Claim[];
    logs: LogLine[];
    rulings: OdinRuling[];
    directives: ExecutiveDirective[];
    synthesis: string;
    riskScore: number;
    complete: boolean;
};

const VERDICTS = ["Established", "Contested", "Conceded", "Rejected"] as const;

export default function CaseDashboard({
    caseFile,
    pack,
    claims,
    logs,
    rulings,
    directives,
    synthesis,
    riskScore,
    complete,
}: Props) {
    const [sourceId, setSourceId] = useState<string | null>(null);
    const [selectedEvidenceDetail, setSelectedEvidenceDetail] = useState<{
        docId: string;
        tradeRow?: string;
        context?: string;
    } | null>(null);
    const sourceClaim = claims.find((claim) => claim.docId === sourceId);
    const sourceFile = pack?.files?.find((file) => file.doc_id === sourceId);
    const sourceRetrievedAt = logs.find((line) => line.docIds?.includes(sourceId ?? ""))?.time;
    const activity = useMemo(() => [...logs].reverse(), [logs]);

    const groupedRulings = useMemo(
        () =>
            VERDICTS.map((verdict) => ({
                verdict,
                items: rulings.filter((ruling) => ruling.verdict === verdict),
            })),
        [rulings],
    );

    return (
        <section className="rg-dashboard" aria-label="Case evidence and briefing dashboard">
            <div className="rg-dashboard-heading">
                <div>
                    <span className="rg-dashboard-kicker">Runemark · Case dashboard</span>
                    <h2>Evidence, exposure &amp; briefing</h2>
                </div>
                <span className={`rg-dashboard-status${complete ? " complete" : ""}`}>
                    <i aria-hidden="true" />
                    {complete ? "Ruling complete" : "Trial in progress"}
                </span>
            </div>

            <div className="rg-dashboard-grid">
                <section className="rg-dashboard-panel rg-feed-panel" aria-labelledby="rg-feed-title">
                    <div className="rg-dashboard-panel-head">
                        <div>
                            <span className="rg-dashboard-kicker">Observability</span>
                            <h3 id="rg-feed-title">Live evidence &amp; trial feed</h3>
                        </div>
                        <span className="rg-feed-count">{logs.length} events</span>
                    </div>
                    {activity.length === 0 ? (
                        <p className="rg-dashboard-empty">
                            Feed events will appear as the agents search, retrieve documents, debate claims, and issue rulings.
                        </p>
                    ) : (
                        <ol className="rg-feed-list" aria-live="polite">
                            {activity.map((line) => (
                                <li className="rg-feed-item" key={line.id}>
                                    <time>{line.time}</time>
                                    <span className={`rg-feed-tag tag-${line.tag}`}>{line.tag}</span>
                                    <div>
                                        <p>{line.text}</p>
                                        {line.docIds && line.docIds.length > 0 && (
                                            <div className="rg-dashboard-citations">
                                                {line.docIds.map((docId) => (
                                                    <button key={docId} type="button" onClick={() => setSourceId(docId)}>
                                                        {docId}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <section className="rg-dashboard-panel rg-exposure-panel" aria-labelledby="rg-exposure-title">
                    <div className="rg-dashboard-panel-head">
                        <div>
                            <span className="rg-dashboard-kicker">Risk range · FR7.3</span>
                            <h3 id="rg-exposure-title">Exposure table by country &amp; sector</h3>
                        </div>
                        <span className="rg-dashboard-note">FR7.4 Click-through enabled</span>
                    </div>
                    <p className="rg-dashboard-note rg-exposure-disclaimer">
                        Exposure indicates expected trade value drop (%) versus pre-event baseline over Q+1. Thor high, Loki low, and Odin final ranges remain strictly separated. Click any metric or evidence chip to inspect citations.
                    </p>
                    <ExposureTable
                        onSelectSource={(docId, tradeRow, context) => {
                            setSelectedEvidenceDetail({ docId, tradeRow, context });
                            setSourceId(docId);
                        }}
                        complete={complete}
                        isBriefingVariant={false}
                    />
                </section>
            </div>

            <section className="rg-dashboard-panel rg-governance-panel" aria-labelledby="rg-governance-title">
                <div className="rg-dashboard-panel-head">
                    <div>
                        <span className="rg-dashboard-kicker">Case controls</span>
                        <h3 id="rg-governance-title">Verification, review &amp; agent memory</h3>
                    </div>
                    <span className="rg-dashboard-note">Backend status visibility</span>
                </div>
                <div className="rg-governance-grid">
                    <article>
                        <span className="rg-governance-state">{caseFile ? "Case created" : "Awaiting question"}</span>
                        <h4>Heimdall · Case verification</h4>
                        <p>
                            {caseFile
                                ? `Case ${caseFile.case_id} · as of ${caseFile.as_of_date}.`
                                : "The Case File and as-of date appear after case creation."}
                            {" "}Event confirmation, retractions, and contradiction checks are not returned by the current case API.
                        </p>
                    </article>
                    <article>
                        <span className="rg-governance-state">{complete ? "Ruling delivered" : "Trial pending"}</span>
                        <h4>Odin · Sufficiency &amp; return</h4>
                        <p>
                            The current trial response does not expose a sufficiency decision or a send-back reason, so a Heimdall re-search cannot be confirmed here.
                        </p>
                    </article>
                    <article>
                        <span className="rg-governance-state">{pack?.pack_id ? "Pack selected" : "No pack selected"}</span>
                        <h4>Run limits &amp; new evidence</h4>
                        <p>
                            Pack ingestion is available above. Run IDs, a two-run lifecycle, and confirmation of new evidence on a second run are not exposed by the current API.
                        </p>
                    </article>
                    <article>
                        <span className="rg-governance-state">Not exposed</span>
                        <h4>Private agent memory</h4>
                        <p>
                            Heimdall, Thor, Loki, and Odin remain separate trial roles. The current frontend API does not expose persistent per-agent memory or memory-use audit events.
                        </p>
                    </article>
                </div>
            </section>

            <section className="rg-dashboard-panel rg-briefing-panel" aria-labelledby="rg-briefing-title">
                <div className="rg-dashboard-panel-head">
                    <div>
                        <span className="rg-dashboard-kicker">Odin · Final briefing</span>
                        <h3 id="rg-briefing-title">Decision record</h3>
                    </div>
                    {complete && <span className="rg-dashboard-risk">{riskScore}% net risk index</span>}
                </div>
                {!complete ? (
                    <p className="rg-dashboard-empty">The briefing is assembled from Odin’s rulings after the trial is complete.</p>
                ) : (
                    <>
                        <div className="rg-dashboard-summary">
                            <strong>Executive summary</strong>
                            <p>{synthesis}</p>
                        </div>
                        <div className="rg-finding-grid">
                            {groupedRulings.map(({ verdict, items }) => (
                                <section className="rg-finding-group" key={verdict} aria-label={`${verdict} findings`}>
                                    <h4>
                                        {verdict}
                                        <span>{items.length}</span>
                                    </h4>
                                    {items.length === 0 ? (
                                        <p className="rg-dashboard-note">No findings in this category.</p>
                                    ) : (
                                        <ul>
                                            {items.map((ruling) => (
                                                <li key={ruling.claimId}>
                                                    <div>
                                                        <strong>{ruling.claimTitle}</strong>
                                                        <p>{ruling.decree}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="rg-dashboard-source-link"
                                                        onClick={() => setSourceId(ruling.docId)}
                                                    >
                                                        {ruling.docId}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            ))}
                        </div>
                        <div className="rg-outlook">
                            <div>
                                <span className="rg-dashboard-kicker">Next-quarter outlook</span>
                                <h4>Assumptions &amp; recommended actions</h4>
                                <p>
                                    The outlook depends on the assumptions in Odin’s directives below. The current API does not provide a separately quantified next-quarter forecast.
                                </p>
                            </div>
                            <ul>
                                {directives.map((directive) => (
                                    <li key={directive.id}>
                                        <strong>{directive.title}:</strong> {directive.detail}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {/* Briefing Exposure Grid & Next-Quarter Outlook (FR8.2) */}
                        <div className="rg-briefing-exposure-section">
                            <div className="rg-briefing-exposure-head">
                                <span className="rg-dashboard-kicker">Briefing exposure &amp; outlook · FR8.2</span>
                                <h4>Consolidated Exposure Grid &amp; Next-Quarter Forecast</h4>
                                <p>
                                    Odin’s final ruling ranges synthesized strictly from Established and Contested claims, accompanied by forward-looking next-quarter projections and key operational assumptions.
                                </p>
                            </div>
                            <ExposureTable
                                onSelectSource={(docId, tradeRow, context) => {
                                    setSelectedEvidenceDetail({ docId, tradeRow, context });
                                    setSourceId(docId);
                                }}
                                complete={complete}
                                isBriefingVariant={true}
                            />
                        </div>

                        <div className="rg-dashboard-source-note">
                            <strong>Source timestamps:</strong> citations open the Runemark document record. The current API supplies retrieval times in the feed, but not document publication timestamps.
                        </div>
                    </>
                )}
            </section>

            {sourceId && (
                <DocumentPdfModal
                    docId={sourceId}
                    tradeRow={selectedEvidenceDetail?.tradeRow}
                    onClose={() => {
                        setSourceId(null);
                        setSelectedEvidenceDetail(null);
                    }}
                />
            )}
        </section>
    );
}
