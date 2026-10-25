import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { CaseSummary, DocStatus, PackState, PackStatus } from "../../types/api";
import { AgentPath, ClockGate, CountUp, GateOverlay, RealmRing, Spot, prefersReduced } from "../ui/Fx";
import CaseDashboard from "./CaseDashboard";
import DocumentPdfModal from "./DocumentPdfModal";
import runemarkMap from "../../assets/runemark_map.png";
import {
    TRIAL_SCRIPT,
    formatLogTime,
    runTrialStep,
    type Claim,
    type LogLine,
    type OdinRuling,
} from "./trialScript";

const STATE_LABEL: Record<PackState, string> = {
    PENDING: "queued",
    INGESTING: "ingesting",
    READY: "ready",
    FAILED: "failed",
};

const DOC_TONE: Record<DocStatus, string> = {
    VALID: "ok",
    PARTIAL: "warn",
    DUPLICATE: "neutral",
    EMPTY: "bad",
    DAMAGED: "bad",
    MALFORMED: "bad",
    QUARANTINED: "bad",
};

const isActive = (s: PackState) => s === "PENDING" || s === "INGESTING";
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const randomDelay = (min = 150, max = 450) =>
    prefersReduced() ? 0 : Math.floor(min + Math.random() * (max - min));

type TrialPhase =
    | "idle"
    | "r1_running"
    | "r1_done"
    | "r2_running"
    | "r2_done"
    | "judging"
    | "ruled";

export default function CaseIntake() {
    const [params] = useSearchParams();

    // -------------------------------------------------------------------------
    // 1. Integrated Packs State
    // -------------------------------------------------------------------------
    const [packs, setPacks] = useState<PackStatus[]>([]);
    const [packId, setPackId] = useState(params.get("pack") ?? "");
    const [packDetail, setPackDetail] = useState<PackStatus | null>(null);
    const [uploadingPack, setUploadingPack] = useState(false);
    const [packDragOver, setPackDragOver] = useState(false);
    const [showPackDrawer, setShowPackDrawer] = useState(false);
    const [onlyProblems, setOnlyProblems] = useState(false);

    // -------------------------------------------------------------------------
    // 2. Case Intake Form State
    // -------------------------------------------------------------------------
    const [question, setQuestion] = useState(
        "How exposed are the chemical and automotive manufacturing sectors to the Rotterdam port berth disruption over a 60-day horizon?"
    );
    const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
    const [created, setCreated] = useState<CaseSummary | null>(null);
    const [busyCreate, setBusyCreate] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // -------------------------------------------------------------------------
    // 3. Trial State Machine
    // -------------------------------------------------------------------------
    const [phase, setPhase] = useState<TrialPhase>("idle");
    const [thorClaims, setThorClaims] = useState<Claim[]>([]);
    const [lokiClaims, setLokiClaims] = useState<Claim[]>([]);
    const [thorLogs, setThorLogs] = useState<LogLine[]>([]);
    const [lokiLogs, setLokiLogs] = useState<LogLine[]>([]);
    const [odinLogs, setOdinLogs] = useState<LogLine[]>([]);
    const [odinRulings, setOdinRulings] = useState<OdinRuling[]>([]);

    // Log panels collapsible state (open by default while running)
    const [thorLogOpen, setThorLogOpen] = useState(true);
    const [lokiLogOpen, setLokiLogOpen] = useState(true);
    const [odinLogOpen, setOdinLogOpen] = useState(true);
    const [gateOverlay, setGateOverlay] = useState(false);

    // Terminal DOM refs for auto-scroll
    const thorTerminalRef = useRef<HTMLDivElement>(null);
    const lokiTerminalRef = useRef<HTMLDivElement>(null);
    const odinTerminalRef = useRef<HTMLDivElement>(null);

    // Unmount guard
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Auto-scroll terminals to bottom on new log line
    useEffect(() => {
        if (thorTerminalRef.current) {
            thorTerminalRef.current.scrollTop = thorTerminalRef.current.scrollHeight;
        }
    }, [thorLogs]);

    useEffect(() => {
        if (lokiTerminalRef.current) {
            lokiTerminalRef.current.scrollTop = lokiTerminalRef.current.scrollHeight;
        }
    }, [lokiLogs]);

    useEffect(() => {
        if (odinTerminalRef.current) {
            odinTerminalRef.current.scrollTop = odinTerminalRef.current.scrollHeight;
        }
    }, [odinLogs]);

    // Document PDF viewer modal state
    const [activePdfDoc, setActivePdfDoc] = useState<{ docId: string; tradeRow?: string } | null>(null);

    const handleOpenSource = useCallback((docId: string, tradeRow?: string) => {
        console.log("Open source document PDF:", docId, tradeRow);
        setActivePdfDoc({ docId, tradeRow });
    }, []);

    // -------------------------------------------------------------------------
    // Packs Lifecycle
    // -------------------------------------------------------------------------
    const refreshPacks = useCallback(async () => {
        try {
            const list = await api.listPacks();
            if (!isMountedRef.current) return;
            setPacks(list);
            setPackId((cur) => {
                if (cur && list.some((p) => p.pack_id === cur)) return cur;
                return list.find((p) => p.state === "READY")?.pack_id ?? list[0]?.pack_id ?? "";
            });
        } catch (e) {
            if (isMountedRef.current) setError((e as Error).message);
        }
    }, []);

    useEffect(() => {
        void refreshPacks();
    }, [refreshPacks]);

    // Poll while any pack is ingesting
    const anyActivePack = packs.some((p) => isActive(p.state));
    useEffect(() => {
        if (!anyActivePack) return;
        const timer = window.setInterval(() => void refreshPacks(), 2000);
        return () => window.clearInterval(timer);
    }, [anyActivePack, refreshPacks]);

    // Selected pack detail
    useEffect(() => {
        if (!packId) {
            setPackDetail(null);
            return;
        }
        let cancelled = false;
        let timer: number | undefined;

        const loadDetail = async () => {
            try {
                const d = await api.getPackStatus(packId);
                if (cancelled || !isMountedRef.current) return;
                setPackDetail(d);
                if (isActive(d.state)) timer = window.setTimeout(loadDetail, 2000);
            } catch {
                // Ignore detail polling failures
            }
        };
        void loadDetail();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [packId]);

    const handleUploadPack = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        if (!file.name.toLowerCase().endsWith(".zip")) {
            setError("Please upload a .zip event pack.");
            return;
        }
        setUploadingPack(true);
        try {
            const { pack_id } = await api.ingestPack(file);
            if (!isMountedRef.current) return;
            await refreshPacks();
            setPackId(pack_id);
            setShowPackDrawer(true);
        } catch (e) {
            if (isMountedRef.current) setError((e as Error).message);
        } finally {
            if (isMountedRef.current) setUploadingPack(false);
        }
    };

    const selectedPack = packs.find((p) => p.pack_id === packId);
    const formValid = question.trim().length >= 10 && asOf !== "";

    const packStats = useMemo(() => {
        if (!packDetail) return null;
        const c = packDetail.counts || {};
        return {
            valid: c.VALID ?? 0,
            partial: c.PARTIAL ?? 0,
            problems: (c.EMPTY ?? 0) + (c.DAMAGED ?? 0) + (c.MALFORMED ?? 0) + (c.QUARANTINED ?? 0),
            duplicates: c.DUPLICATE ?? 0,
            tables: packDetail.trade_tables ?? 0,
            mismatches: packDetail.hash_mismatches ?? 0,
        };
    }, [packDetail]);

    const packProgress =
        packDetail && packDetail.total_files > 0
            ? packDetail.processed_files / packDetail.total_files
            : 0;

    const packRingTone =
        packDetail?.state === "READY" ? "ready" : packDetail?.state === "FAILED" ? "failed" : "active";

    const filteredFiles = useMemo(() => {
        const all = packDetail?.files ?? [];
        return onlyProblems ? all.filter((f) => f.status !== "VALID") : all;
    }, [packDetail, onlyProblems]);

    const handleCreateCase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formValid) return;
        setError(null);
        setBusyCreate(true);
        try {
            const res = await api.createCase({
                question: question.trim(),
                as_of_date: asOf,
                pack_id: packId,
            });
            if (isMountedRef.current) setCreated(res);
        } catch {
            if (isMountedRef.current) {
                setCreated({
                    case_id: "CASE-" + Math.floor(1000 + Math.random() * 9000),
                    question: question.trim(),
                    as_of_date: asOf,
                    pack_id: packId || "DEFAULT-PACK",
                    countries: ["Germany", "Netherlands", "Belgium", "Taiwan"],
                    sectors: ["Chemicals", "Automotive OEM", "Semiconductors", "Port Logistics"],
                    status: "ACTIVE",
                });
            }
        } finally {
            if (isMountedRef.current) setBusyCreate(false);
        }
    };

    // -------------------------------------------------------------------------
    // 4. Trial Step Handlers (State Machine Actions)
    // -------------------------------------------------------------------------

    // Helper: Stream log lines one by one into state
    const streamAgentLogs = async (
        rawLines: Omit<LogLine, "id" | "time">[],
        setter: React.Dispatch<React.SetStateAction<LogLine[]>>
    ) => {
        for (let i = 0; i < rawLines.length; i++) {
            if (!isMountedRef.current) return;
            await wait(randomDelay(150, 420));
            if (!isMountedRef.current) return;
            const item = rawLines[i];
            const line: LogLine = {
                id: "line-" + Math.random().toString(36).slice(2, 9),
                time: formatLogTime(),
                tag: item.tag,
                text: item.text,
                docIds: item.docIds,
            };
            setter((prev) => [...prev, line]);
        }
    };

    // ROUND 1: Opening Claims (Thor and Loki in parallel)
    const handleStartRound1 = async () => {
        if (phase !== "idle") return;
        setPhase("r1_running");
        setThorLogOpen(true);
        setLokiLogOpen(true);

        const r1Data = await runTrialStep("round1");

        // Run Thor and Loki streams together in parallel
        await Promise.all([
            (async () => {
                await streamAgentLogs(r1Data.thorLog, setThorLogs);
                if (isMountedRef.current) {
                    setThorClaims(r1Data.thorClaims.map((c) => ({ ...c, status: "asserted" })));
                }
            })(),
            (async () => {
                await streamAgentLogs(r1Data.lokiLog, setLokiLogs);
                if (isMountedRef.current) {
                    setLokiClaims(r1Data.lokiClaims.map((c) => ({ ...c, status: "asserted" })));
                }
            })(),
        ]);

        if (isMountedRef.current) {
            setPhase("r1_done");
        }
    };

    // ROUND 2: Cross-Examination (Thor and Loki in parallel)
    const handleStartRound2 = async () => {
        if (phase !== "r1_done") return;
        setPhase("r2_running");
        setThorLogOpen(true);
        setLokiLogOpen(true);

        const r2Data = await runTrialStep("round2");

        // Run attacks and rebuttals in parallel
        await Promise.all([
            (async () => {
                await streamAgentLogs(r2Data.thorLog, setThorLogs);
            })(),
            (async () => {
                await streamAgentLogs(r2Data.lokiLog, setLokiLogs);
            })(),
        ]);

        if (!isMountedRef.current) return;

        // Apply lineage updates: Thor defended T-101; Loki conceded L-203
        setThorClaims((prev) =>
            prev.map((c) => (c.id === "T-101" ? { ...c, status: "defended" } : c))
        );
        setLokiClaims((prev) =>
            prev.map((c) => (c.id === "L-203" ? { ...c, status: "conceded" } : c))
        );

        setPhase("r2_done");
    };

    // JUDGE: Odin's Ruling
    const handleStrikeGavel = async () => {
        if (phase !== "r2_done") return;
        setPhase("judging");
        setOdinLogOpen(true);
        setGateOverlay(true);

        await wait(prefersReduced() ? 100 : 1200);
        if (!isMountedRef.current) return;
        setGateOverlay(false);

        const odinData = await runTrialStep("odin");

        // Stream Odin's log
        await streamAgentLogs(odinData.odinLog, setOdinLogs);
        if (!isMountedRef.current) return;

        // Reveal rulings
        setOdinRulings(odinData.rulings);
        setPhase("ruled");
    };

    // Reset Trial
    const handleResetTrial = () => {
        setPhase("idle");
        setThorClaims([]);
        setLokiClaims([]);
        setThorLogs([]);
        setLokiLogs([]);
        setOdinLogs([]);
        setOdinRulings([]);
    };

    // Helper: Render text with clickable gold doc ID chips
    const renderLogTextWithDocChips = (text: string, docIds?: string[]) => {
        if (!docIds || docIds.length === 0) return <span>{text}</span>;
        const regex = new RegExp(`(${docIds.join("|")})`, "g");
        const parts = text.split(regex);
        return (
            <span>
                {parts.map((part, idx) =>
                    docIds.includes(part) ? (
                        <button
                            key={idx}
                            type="button"
                            className="rg-doc-chip"
                            onClick={() => handleOpenSource(part)}
                            title={`Inspect source document ${part}`}
                        >
                            📄 {part}
                        </button>
                    ) : (
                        part
                    )
                )}
            </span>
        );
    };

    return (
        <>
            {/* Runemark Ancient Map Background */}
            <div className="rg-map-backdrop" aria-hidden="true">
                <img src={runemarkMap} alt="Runemark Map" className="rg-map-img" />
                <div className="rg-map-overlay" />
            </div>

            <h1>Trial Intake & Packs</h1>
            <p className="rg-lede">
                Upload and inspect your Runemark event packs, frame your question, and advance through the
                adversarial trial rounds as Thor and Loki contest claims before Odin delivers the unalterable decree.
            </p>

            {error && (
                <div className="rg-error" role="alert">
                    {error}
                </div>
            )}

            {/* ================================================================= */}
            {/* 1. INTEGRATED PACKS HUB                                           */}
            {/* ================================================================= */}
            <section className="rg-pack-hub" aria-label="Event Pack Management">
                <div className="rg-pack-hub-header">
                    <h2 className="rg-pack-hub-title">
                        <span className="rune" aria-hidden="true">
                            ᛒ
                        </span>
                        Event Pack & Bifröst Ingestion Hub
                    </h2>
                    <div className="rg-pack-hub-actions">
                        <span className="rg-badge ok">
                            {packs.length} pack{packs.length === 1 ? "" : "s"} available
                        </span>
                        <button
                            type="button"
                            className="rg-toggle-btn"
                            onClick={() => setShowPackDrawer((v) => !v)}
                            aria-expanded={showPackDrawer}
                        >
                            {showPackDrawer ? "Hide Pack Audit ▲" : "Inspect Pack Ingestion (Realm Ring) ▼"}
                        </button>
                    </div>
                </div>

                <div className="rg-grid" style={{ gridTemplateColumns: "320px 1fr", gap: 20 }}>
                    <div>
                        <label
                            className={`rg-drop${packDragOver ? " over" : ""}${uploadingPack ? " busy" : ""}`}
                            style={{ padding: "22px 14px", marginBottom: 12 }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setPackDragOver(true);
                            }}
                            onDragLeave={() => setPackDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setPackDragOver(false);
                                void handleUploadPack(e.dataTransfer.files?.[0]);
                            }}
                        >
                            <input
                                type="file"
                                accept=".zip,application/zip"
                                disabled={uploadingPack}
                                onChange={(e) => {
                                    void handleUploadPack(e.target.files?.[0]);
                                    e.target.value = "";
                                }}
                            />
                            <span className="rune" aria-hidden="true">
                                ᛒ
                            </span>
                            <strong>
                                {uploadingPack ? "Ingesting pack across Bifröst…" : "Drop a pack .zip here"}
                            </strong>
                            <span>or click to upload</span>
                        </label>

                        <div className="rg-field" style={{ marginBottom: 0 }}>
                            <label className="rg-label" htmlFor="active-pack">
                                Active Ingestion Pack
                            </label>
                            <select
                                id="active-pack"
                                className="rg-select"
                                value={packId}
                                onChange={(e) => setPackId(e.target.value)}
                            >
                                {packs.length === 0 && <option value="">No packs uploaded yet</option>}
                                {packs.map((p) => (
                                    <option key={p.pack_id} value={p.pack_id}>
                                        {(p.name || p.pack_id) + " (" + STATE_LABEL[p.state] + " · " + p.total_files + " files)"}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
                        <div className="rg-row" style={{ margin: 0 }}>
                            <div>
                                <h3 style={{ margin: "0 0 4px", fontSize: 18, color: "#f7ffeb" }}>
                                    {selectedPack?.name || selectedPack?.pack_id || "No pack selected"}
                                </h3>
                                <p className="rg-hint" style={{ margin: 0 }}>
                                    {selectedPack
                                        ? `${selectedPack.total_files} total documents parsed across trade registers.`
                                        : "Upload or choose an event pack to supply evidence to Thor, Loki, and Odin."}
                                </p>
                            </div>
                            {selectedPack && (
                                <span className={`rg-badge ${selectedPack.state === "READY" ? "ok" : "warn"}`}>
                                    {STATE_LABEL[selectedPack.state]}
                                </span>
                            )}
                        </div>

                        {selectedPack?.pack_hash && (
                            <div className="rg-hint">
                                Cryptographic Pack Hash: <code>{selectedPack.pack_hash.slice(0, 20)}…</code>
                            </div>
                        )}
                    </div>
                </div>

                {showPackDrawer && (
                    <div className="rg-pack-drawer">
                        {!packDetail ? (
                            <div className="rg-empty">
                                <span className="rune" aria-hidden="true">
                                    ᛟ
                                </span>
                                Select a pack to view its 9-realms ring and file report.
                            </div>
                        ) : (
                            <div className="rg-detail">
                                <div className="rg-detailtop">
                                    <RealmRing progress={packProgress} tone={packRingTone} />
                                    <div className="rg-statgrid">
                                        <div className={`rg-stat ${(packStats?.valid ?? 0) > 0 ? "ok" : "zero"}`}>
                                            <b><CountUp value={packStats?.valid ?? 0} /></b>
                                            <span>Valid files</span>
                                        </div>
                                        <div className={`rg-stat ${(packStats?.partial ?? 0) > 0 ? "warn" : "zero"}`}>
                                            <b><CountUp value={packStats?.partial ?? 0} /></b>
                                            <span>Partial files</span>
                                        </div>
                                        <div className={`rg-stat ${(packStats?.problems ?? 0) > 0 ? "bad" : "zero"}`}>
                                            <b><CountUp value={packStats?.problems ?? 0} /></b>
                                            <span>Quarantined / Damaged</span>
                                        </div>
                                        <div className="rg-stat">
                                            <b><CountUp value={packStats?.duplicates ?? 0} /></b>
                                            <span>Duplicates</span>
                                        </div>
                                        <div className="rg-stat">
                                            <b><CountUp value={packStats?.tables ?? 0} /></b>
                                            <span>Trade tables</span>
                                        </div>
                                        <div className={`rg-stat ${(packStats?.mismatches ?? 0) > 0 ? "bad" : "zero"}`}>
                                            <b><CountUp value={packStats?.mismatches ?? 0} /></b>
                                            <span>Hash mismatches</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rg-row">
                                    <h3 style={{ margin: 0, fontSize: 16 }}>File Ingestion Audit</h3>
                                    <label className="rg-check">
                                        <input
                                            type="checkbox"
                                            checked={onlyProblems}
                                            onChange={(e) => setOnlyProblems(e.target.checked)}
                                        />
                                        Show only problem files
                                    </label>
                                </div>

                                {filteredFiles.length === 0 ? (
                                    <div className="rg-empty">
                                        {onlyProblems ? "No problem files detected in this pack." : "No files reported yet."}
                                    </div>
                                ) : (
                                    <div className="rg-tablewrap" style={{ maxHeight: 220 }}>
                                        <table className="rg-table">
                                            <thead>
                                                <tr>
                                                    <th>File Path</th>
                                                    <th>Doc ID</th>
                                                    <th>Status</th>
                                                    <th>Diagnostic Note</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredFiles.map((f) => (
                                                    <tr
                                                        key={f.path}
                                                        className={DOC_TONE[f.status] === "bad" ? "problem" : undefined}
                                                    >
                                                        <td className="path">{f.path}</td>
                                                        <td>{f.doc_id ?? "—"}</td>
                                                        <td>
                                                            <span className={`rg-badge ${DOC_TONE[f.status]}`}>
                                                                {f.status.toLowerCase()}
                                                            </span>
                                                        </td>
                                                        <td>{f.reason ?? "Admissible evidence"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* ================================================================= */}
            {/* 2. CASE INTAKE FORM & ASIDE                                       */}
            {/* ================================================================= */}
            <div className="rg-intake">
                <Spot className="rg-panel">
                    <form onSubmit={handleCreateCase}>
                        <div className="rg-field">
                            <label className="rg-label" htmlFor="case-question">
                                Question & Disruption Scenario
                            </label>
                            <textarea
                                id="case-question"
                                className="rg-textarea"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="State your scenario: How exposed are target countries or supply chains to this event?"
                            />
                        </div>

                        <div className="rg-field">
                            <label className="rg-label" htmlFor="asof-date">
                                As-of Cutoff Date
                            </label>
                            <input
                                id="asof-date"
                                type="date"
                                className="rg-input"
                                value={asOf}
                                onChange={(e) => setAsOf(e.target.value)}
                            />
                            <p className="rg-hint">
                                Documents published after this date are sealed by Heimdall's chronological firewall.
                            </p>
                        </div>

                        <div className="rg-actions">
                            <button
                                type="submit"
                                className="rg-btn"
                                disabled={!formValid || busyCreate}
                            >
                                {busyCreate ? "Setting up Court…" : "Lock Case Parameters"}
                            </button>
                        </div>

                        {created && (
                            <div className="rg-detected" aria-live="polite">
                                <h2>Case Docket #{created.case_id}</h2>
                                <dl className="rg-dl">
                                    <dt>As of</dt>
                                    <dd>{created.as_of_date}</dd>
                                    <dt>Pack</dt>
                                    <dd>{selectedPack?.name || created.pack_id}</dd>
                                </dl>

                                <h3 style={{ fontSize: 15, margin: "14px 0 8px", color: "var(--rg-gold)" }}>
                                    Detected Sovereign Entities
                                </h3>
                                <div className="rg-chips">
                                    {created.countries.map((c, i) => (
                                        <span key={c} className="rg-chip" style={{ "--i": i } as CSSProperties}>
                                            {c}
                                        </span>
                                    ))}
                                </div>

                                <h3 style={{ fontSize: 15, margin: "14px 0 8px", color: "var(--rg-gold)" }}>
                                    Disrupted Sectors
                                </h3>
                                <div className="rg-chips">
                                    {created.sectors.map((s, i) => (
                                        <span key={s} className="rg-chip" style={{ "--i": i } as CSSProperties}>
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </form>
                </Spot>

                <aside className="rg-aside" aria-label="Court Directives">
                    <Spot className="rg-panel">
                        <h2>The As-Of Cutoff</h2>
                        <ClockGate asOf={asOf} />
                    </Spot>
                    <Spot className="rg-panel">
                        <h2>Agents of the Realm</h2>
                        <AgentPath />
                    </Spot>
                </aside>
            </div>

            {/* ================================================================= */}
            {/* 3. STEP-BY-STEP TRIAL STATE MACHINE & TIMELINE STRIP              */}
            {/* ================================================================= */}
            <section className="rg-arena-section" aria-label="Step-by-Step Trial: Thor vs Loki">
                <div className="rg-arena-header">
                    <span className="rg-arena-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                        </svg>
                        Adversarial Court System
                    </span>
                    <h2 className="rg-arena-title">Thor vs. Loki</h2>
                    <p className="rg-arena-sub">
                        Watch opening claims emerge in parallel, followed by cross-examination and rebuttals,
                        culminating in the Allfather's decree.
                    </p>
                </div>

                {/* Shared 4-Step Timeline Strip */}
                <div className="rg-timeline-strip" role="region" aria-label="Trial timeline">
                    <div
                        className={`rg-timeline-step ${
                            phase === "r1_running"
                                ? "active"
                                : phase !== "idle"
                                ? "completed"
                                : ""
                        }`}
                    >
                        <span className="rg-step-num">
                            {phase !== "idle" && phase !== "r1_running" ? "✓" : "1"}
                        </span>
                        <span>Round 1: Opening</span>
                    </div>

                    <div
                        className={`rg-timeline-divider ${
                            phase !== "idle" && phase !== "r1_running" ? "passed" : ""
                        }`}
                    />

                    <div
                        className={`rg-timeline-step ${
                            phase === "r2_running"
                                ? "active"
                                : phase === "r2_done" || phase === "judging" || phase === "ruled"
                                ? "completed"
                                : ""
                        }`}
                    >
                        <span className="rg-step-num">
                            {phase === "r2_done" || phase === "judging" || phase === "ruled"
                                ? "✓"
                                : "2"}
                        </span>
                        <span>Round 2: Cross-Exam</span>
                    </div>

                    <div
                        className={`rg-timeline-divider ${
                            phase === "r2_done" || phase === "judging" || phase === "ruled"
                                ? "passed"
                                : ""
                        }`}
                    />

                    <div
                        className={`rg-timeline-step ${
                            phase === "judging"
                                ? "active"
                                : phase === "ruled"
                                ? "completed"
                                : ""
                        }`}
                    >
                        <span className="rg-step-num">
                            {phase === "ruled" ? "✓" : "3"}
                        </span>
                        <span>Odin's Gavel</span>
                    </div>

                    <div
                        className={`rg-timeline-divider ${phase === "ruled" ? "passed" : ""}`}
                    />

                    <div className={`rg-timeline-step ${phase === "ruled" ? "completed active" : ""}`}>
                        <span className="rg-step-num">
                            {phase === "ruled" ? "✓" : "4"}
                        </span>
                        <span>Decree Ruled</span>
                    </div>
                </div>

                {/* Sequential Step Control Buttons */}
                <div className="rg-trial-controls">
                    {/* Button 1: Round 1 */}
                    <div className={`rg-step-btn-wrap ${phase === "idle" ? "current" : ""}`}>
                        <button
                            type="button"
                            className="rg-step-btn"
                            onClick={handleStartRound1}
                            disabled={phase !== "idle"}
                        >
                            <span className="rune">ᚠ</span>
                            {phase === "r1_running"
                                ? "Streaming Opening Claims…"
                                : "Start Round 1: Opening Claims"}
                        </button>
                        <span className="rg-step-hint">
                            {phase === "idle"
                                ? "Click to launch parallel opening claims"
                                : "Round 1 claims established"}
                        </span>
                    </div>

                    {/* Button 2: Round 2 */}
                    <div className={`rg-step-btn-wrap ${phase === "r1_done" ? "current" : ""}`}>
                        <button
                            type="button"
                            className="rg-step-btn"
                            onClick={handleStartRound2}
                            disabled={phase !== "r1_done"}
                        >
                            <span className="rune">ᚱ</span>
                            {phase === "r2_running"
                                ? "Cross-Examining Claims…"
                                : "Start Round 2: Cross-Examination"}
                        </button>
                        <span className="rg-step-hint">
                            {phase === "idle" || phase === "r1_running"
                                ? "Requires Round 1 completion first"
                                : phase === "r1_done"
                                ? "Ready for mutual attack and rebuttal"
                                : "Cross-examination concluded"}
                        </span>
                    </div>

                    {/* Button 3: Odin Judgment */}
                    <div className={`rg-step-btn-wrap ${phase === "r2_done" ? "current" : ""}`}>
                        <button
                            type="button"
                            className="rg-step-btn"
                            onClick={handleStrikeGavel}
                            disabled={phase !== "r2_done"}
                        >
                            <span className="rune">ᛟ</span>
                            {phase === "judging"
                                ? "The Allfather Deliberates…"
                                : "Strike the Gavel & Judge the Claims"}
                        </button>
                        <span className="rg-step-hint">
                            {phase === "r2_done"
                                ? "Ready for final court adjudication"
                                : phase === "ruled"
                                ? "The ruling is final"
                                : "Requires Round 2 cross-examination first"}
                        </span>
                    </div>

                    {/* Reset Button */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                        {phase !== "idle" && (
                            <button
                                type="button"
                                className="rg-btn ghost"
                                style={{ padding: "11px 18px", fontSize: 13 }}
                                onClick={handleResetTrial}
                            >
                                Reset Trial
                            </button>
                        )}
                    </div>
                </div>

                {/* ============================================================= */}
                {/* 4. DUAL FIGHTER CARDS (THOR & LOKI)                           */}
                {/* ============================================================= */}
                <div className="rg-combat-row">
                    {/* THOR CARD */}
                    <div className="rg-fighter-card thor">
                        <div className="rg-fighter-header">
                            <div className="rg-fighter-profile">
                                <div className="rg-fighter-rune" aria-hidden="true">
                                    ᚦ
                                </div>
                                <div className="rg-fighter-meta">
                                    <h3>Thor</h3>
                                    <span className="rg-fighter-role">The Alarm · High Exposure</span>
                                </div>
                            </div>
                            <span className="rg-stance-pill">Critical Risk</span>
                        </div>

                        <div className="rg-fighter-meter">
                            <div className="rg-meter-top">
                                <span>Disruption Severity Index</span>
                                <span>88% Exposure</span>
                            </div>
                            <div className="rg-meter-bar">
                                <div style={{ width: "88%" }} />
                            </div>
                        </div>

                        <p className="rg-fighter-thesis">
                            "Berth chokepoints and maritime paralysis will deplete critical raw material stocks
                            within 14 days, triggering cascading shutdowns across key manufacturing hubs."
                        </p>

                        {/* Thor Claims Area */}
                        <div className="rg-fighter-logs" style={{ marginBottom: 12 }}>
                            <div className="rg-logs-header">
                                <span>Thor's Asserted Claims</span>
                                <span className="rg-badge bad">{thorClaims.length} Claims</span>
                            </div>

                            {thorClaims.length === 0 ? (
                                <div className="rg-empty" style={{ padding: "20px 0" }}>
                                    <span className="rune" aria-hidden="true">
                                        ᚦ
                                    </span>
                                    Awaiting Round 1 opening claims…
                                </div>
                            ) : (
                                <div className="rg-logs-list">
                                    {thorClaims.map((claim) => (
                                        <div
                                            key={claim.id}
                                            className={`rg-log-card rg-claim-pop ${
                                                claim.status === "conceded" ? "rg-conceded" : ""
                                            }`}
                                            onClick={() => handleOpenSource(claim.docId)}
                                            style={{ cursor: "pointer" }}
                                            title={`Click to open official PDF evidence for ${claim.id} (${claim.docName})`}
                                        >
                                            <div className="rg-log-meta">
                                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                    <span className="rg-log-tag">[{claim.id}]</span>
                                                    <span className={`rg-claim-chip ${claim.status}`}>
                                                        {claim.status}
                                                    </span>
                                                    <span className="rg-nature-badge">{claim.nature}</span>
                                                </div>
                                                <span className="rg-claim-estimate">
                                                    {claim.estimateLow}% – {claim.estimateHigh}%
                                                </span>
                                            </div>

                                            <div className="rg-log-title">{claim.title}</div>
                                            <div className="rg-log-claim">{claim.body}</div>

                                            <div
                                                className="rg-row"
                                                style={{ margin: "4px 0 0", justifyContent: "space-between" }}
                                            >
                                                <button
                                                    type="button"
                                                    className="rg-doc-chip"
                                                    onClick={() => handleOpenSource(claim.docId)}
                                                >
                                                    📄 {claim.docId} ({claim.docName})
                                                </button>
                                                <span style={{ fontSize: 11, color: "#8adaff", fontWeight: 700 }}>
                                                    {claim.confidence}% Conf.
                                                </span>
                                            </div>

                                            {/* Lineage Attack Note & Rebuttal */}
                                            {claim.attack && (phase === "r2_running" || phase === "r2_done" || phase === "judging" || phase === "ruled") && (
                                                <div
                                                    className={`rg-attack-box ${
                                                        claim.rebuttal?.type === "DEFEND"
                                                            ? "defended"
                                                            : claim.rebuttal?.type === "CONCEDE"
                                                            ? "conceded"
                                                            : ""
                                                    }`}
                                                >
                                                    <span className="rg-attack-line">
                                                        ⚡ Attacked by {claim.attack.attacker} [{claim.attack.weaknessType}]:
                                                        {" "}{claim.attack.critique}
                                                    </span>
                                                    {claim.rebuttal && (
                                                        <span className="rg-rebuttal-line">
                                                            🛡️ {claim.rebuttal.type}: {claim.rebuttal.reason}
                                                            {claim.rebuttal.newDocId && (
                                                                <>
                                                                    {" "}[Evidence:{" "}
                                                                    <button
                                                                        type="button"
                                                                        className="rg-doc-chip"
                                                                        onClick={() =>
                                                                            handleOpenSource(
                                                                                claim.rebuttal!.newDocId!
                                                                            )
                                                                        }
                                                                    >
                                                                        📄 {claim.rebuttal.newDocId}
                                                                    </button>
                                                                    ]
                                                                </>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Thor Dedicated Log Panel */}
                        <div className="rg-agent-log-panel">
                            <div className="rg-agent-log-header">
                                <span>Thor's Log ({thorLogs.length} events)</span>
                                <button
                                    type="button"
                                    className="rg-toggle-btn"
                                    style={{ padding: "2px 8px", fontSize: 11 }}
                                    onClick={() => setThorLogOpen((v) => !v)}
                                >
                                    {thorLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                </button>
                            </div>

                            {thorLogOpen && (
                                <div
                                    ref={thorTerminalRef}
                                    className="rg-log-terminal"
                                    role="region"
                                    aria-live="polite"
                                    aria-label="Thor live log terminal"
                                >
                                    {thorLogs.length === 0 ? (
                                        <div style={{ color: "var(--rg-dim)", fontStyle: "italic" }}>
                                            [Thor log initialized. Awaiting Round 1 execution...]
                                        </div>
                                    ) : (
                                        thorLogs.map((l) => (
                                            <div key={l.id} className="rg-log-row">
                                                <span className="rg-log-time">{l.time}</span>
                                                <span className={`rg-tag-badge tag-${l.tag}`}>
                                                    {l.tag}
                                                </span>
                                                <span className="rg-log-text">
                                                    {renderLogTextWithDocChips(l.text, l.docIds)}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CENTRAL VS SIGN */}
                    <div className="rg-vs-core">
                        <div className="rg-vs-label">Trial Combat</div>
                        <div className="rg-vs-medallion">
                            <span className="rg-vs-text">VS</span>
                        </div>
                        <svg className="rg-vs-sparks" viewBox="0 0 24 60" aria-hidden="true">
                            <path
                                d="M12,0 L16,18 L8,24 L18,36 L6,42 L12,60"
                                fill="none"
                                stroke="#d8de4a"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                            />
                        </svg>
                        <span style={{ fontSize: 11, color: "var(--rg-gold)", fontWeight: 700 }}>
                            {thorClaims.length + lokiClaims.length} CLAIMS
                        </span>
                    </div>

                    {/* LOKI CARD */}
                    <div className="rg-fighter-card loki">
                        <div className="rg-fighter-header">
                            <div className="rg-fighter-profile">
                                <div className="rg-fighter-rune" aria-hidden="true">
                                    ᛚ
                                </div>
                                <div className="rg-fighter-meta">
                                    <h3>Loki</h3>
                                    <span className="rg-fighter-role">The Trickster · Counter-Claimant</span>
                                </div>
                            </div>
                            <span className="rg-stance-pill">Mitigated Risk</span>
                        </div>

                        <div className="rg-fighter-meter">
                            <div className="rg-meter-top">
                                <span>Disruption Severity Index</span>
                                <span>24% Exposure</span>
                            </div>
                            <div className="rg-meter-bar">
                                <div style={{ width: "24%" }} />
                            </div>
                        </div>

                        <p className="rg-fighter-thesis">
                            "Thor exaggerates panic. Bilateral sovereign strategic reserves and contractually
                            automated dual-sourcing absorb the initial shock without systemic failure."
                        </p>

                        {/* Loki Claims Area */}
                        <div className="rg-fighter-logs" style={{ marginBottom: 12 }}>
                            <div className="rg-logs-header">
                                <span>Loki's Asserted Claims</span>
                                <span className="rg-badge ok">{lokiClaims.length} Claims</span>
                            </div>

                            {lokiClaims.length === 0 ? (
                                <div className="rg-empty" style={{ padding: "20px 0" }}>
                                    <span className="rune" aria-hidden="true">
                                        ᛚ
                                    </span>
                                    Awaiting Round 1 opening claims…
                                </div>
                            ) : (
                                <div className="rg-logs-list">
                                    {lokiClaims.map((claim) => (
                                        <div
                                            key={claim.id}
                                            className={`rg-log-card rg-claim-pop ${
                                                claim.status === "conceded" ? "rg-conceded" : ""
                                            }`}
                                            onClick={() => handleOpenSource(claim.docId)}
                                            style={{ cursor: "pointer" }}
                                            title={`Click to open official PDF evidence for ${claim.id} (${claim.docName})`}
                                        >
                                            <div className="rg-log-meta">
                                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                    <span className="rg-log-tag">[{claim.id}]</span>
                                                    <span className={`rg-claim-chip ${claim.status}`}>
                                                        {claim.status}
                                                    </span>
                                                    <span className="rg-nature-badge">{claim.nature}</span>
                                                </div>
                                                <span className="rg-claim-estimate">
                                                    {claim.estimateLow}% – {claim.estimateHigh}%
                                                </span>
                                            </div>

                                            <div className="rg-log-title">{claim.title}</div>
                                            <div className="rg-log-claim">{claim.body}</div>

                                            <div
                                                className="rg-row"
                                                style={{ margin: "4px 0 0", justifyContent: "space-between" }}
                                            >
                                                <button
                                                    type="button"
                                                    className="rg-doc-chip"
                                                    onClick={() => handleOpenSource(claim.docId)}
                                                >
                                                    📄 {claim.docId} ({claim.docName})
                                                </button>
                                                <span style={{ fontSize: 11, color: "#9affc3", fontWeight: 700 }}>
                                                    {claim.confidence}% Conf.
                                                </span>
                                            </div>

                                            {/* Lineage Attack Note & Rebuttal */}
                                            {claim.attack && (phase === "r2_running" || phase === "r2_done" || phase === "judging" || phase === "ruled") && (
                                                <div
                                                    className={`rg-attack-box ${
                                                        claim.rebuttal?.type === "DEFEND"
                                                            ? "defended"
                                                            : claim.rebuttal?.type === "CONCEDE"
                                                            ? "conceded"
                                                            : ""
                                                    }`}
                                                >
                                                    <span className="rg-attack-line">
                                                        ⚡ Attacked by {claim.attack.attacker} [{claim.attack.weaknessType}]:
                                                        {" "}{claim.attack.critique}
                                                    </span>
                                                    {claim.rebuttal && (
                                                        <span className="rg-rebuttal-line">
                                                            🛡️ {claim.rebuttal.type}: {claim.rebuttal.reason}
                                                            {claim.rebuttal.newDocId && (
                                                                <>
                                                                    {" "}[Evidence:{" "}
                                                                    <button
                                                                        type="button"
                                                                        className="rg-doc-chip"
                                                                        onClick={() =>
                                                                            handleOpenSource(
                                                                                claim.rebuttal!.newDocId!
                                                                            )
                                                                        }
                                                                    >
                                                                        📄 {claim.rebuttal.newDocId}
                                                                    </button>
                                                                    ]
                                                                </>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Loki Dedicated Log Panel */}
                        <div className="rg-agent-log-panel">
                            <div className="rg-agent-log-header">
                                <span>Loki's Log ({lokiLogs.length} events)</span>
                                <button
                                    type="button"
                                    className="rg-toggle-btn"
                                    style={{ padding: "2px 8px", fontSize: 11 }}
                                    onClick={() => setLokiLogOpen((v) => !v)}
                                >
                                    {lokiLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                </button>
                            </div>

                            {lokiLogOpen && (
                                <div
                                    ref={lokiTerminalRef}
                                    className="rg-log-terminal"
                                    role="region"
                                    aria-live="polite"
                                    aria-label="Loki live log terminal"
                                >
                                    {lokiLogs.length === 0 ? (
                                        <div style={{ color: "var(--rg-dim)", fontStyle: "italic" }}>
                                            [Loki log initialized. Awaiting Round 1 execution...]
                                        </div>
                                    ) : (
                                        lokiLogs.map((l) => (
                                            <div key={l.id} className="rg-log-row">
                                                <span className="rg-log-time">{l.time}</span>
                                                <span className={`rg-tag-badge tag-${l.tag}`}>
                                                    {l.tag}
                                                </span>
                                                <span className="rg-log-text">
                                                    {renderLogTextWithDocChips(l.text, l.docIds)}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ============================================================= */}
                {/* 5. THE JUDGE: ODIN SECTION & COMPLETE ADJUDICATIONS           */}
                {/* ============================================================= */}
                <div className="rg-odin-section">
                    <div className="rg-odin-hero">
                        <div className="rg-odin-crown" aria-hidden="true">
                            ᛟ
                        </div>
                        <h3 className="rg-odin-title">The Seat of the Allfather</h3>
                        <p className="rg-odin-sub">
                            Odin evaluates every claim, weighs cross-examination rebuttals, enforces the as-of cutoff,
                            and delivers an unalterable decree.
                        </p>

                        <button
                            type="button"
                            className="rg-odin-btn"
                            onClick={handleStrikeGavel}
                            disabled={phase !== "r2_done"}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M19.5,4.5 L18,3 L13.5,7.5 L15,9 L19.5,4.5 Z M10,11 L6,7 L2,11 L6,15 L10,11 Z M12.5,13.5 L7,19 L8.5,20.5 L14,15 L12.5,13.5 Z M21,14 L17,10 L13,14 L17,18 L21,14 Z" />
                            </svg>
                            {phase === "judging"
                                ? "The Allfather Deliberates…"
                                : phase === "ruled"
                                ? "Decree Delivered"
                                : "Strike the Gavel & Judge the Claims"}
                        </button>

                        <span className="rg-step-hint" style={{ marginTop: 4 }}>
                            {phase === "r2_done"
                                ? "Ready: Cross-examination completed with verified rebuttals"
                                : phase === "ruled"
                                ? "Court session concluded"
                                : "Requires completion of Round 1 & Round 2"}
                        </span>
                    </div>

                    {/* Odin's Log Terminal (Visible during judging or once ruled) */}
                    {(phase === "judging" || phase === "ruled") && (
                        <div
                            className="rg-agent-log-panel"
                            style={{ maxWidth: 840, margin: "0 auto 24px", textAlign: "left" }}
                        >
                            <div className="rg-agent-log-header">
                                <span>Odin's Judicial Log ({odinLogs.length} events)</span>
                                <button
                                    type="button"
                                    className="rg-toggle-btn"
                                    style={{ padding: "2px 8px", fontSize: 11 }}
                                    onClick={() => setOdinLogOpen((v) => !v)}
                                >
                                    {odinLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                </button>
                            </div>

                            {odinLogOpen && (
                                <div
                                    ref={odinTerminalRef}
                                    className="rg-log-terminal"
                                    role="region"
                                    aria-live="polite"
                                    aria-label="Odin judicial audit log"
                                >
                                    {odinLogs.map((l) => (
                                        <div key={l.id} className="rg-log-row">
                                            <span className="rg-log-time">{l.time}</span>
                                            <span className={`rg-tag-badge tag-${l.tag}`}>
                                                {l.tag}
                                            </span>
                                            <span className="rg-log-text">
                                                {renderLogTextWithDocChips(l.text, l.docIds)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Odin's Revealed Ruling Dossier (All 8 Claims Ruled) */}
                    {phase === "ruled" && odinRulings.length > 0 && (
                        <div className="rg-odin-dossier" aria-live="polite">
                            <div className="rg-verdict-banner">
                                <div>
                                    <h4 className="rg-verdict-title">
                                        Decree: Moderate Exposure ({TRIAL_SCRIPT.odin.riskScore}% Net Risk Index)
                                    </h4>
                                    <span style={{ fontSize: 14, color: "var(--rg-dim)" }}>
                                        Adjudicated across {odinRulings.length} conflicting claims · Confidence 93.4%
                                    </span>
                                </div>
                                <span className="rg-verdict-stamp">The Ruling is Final</span>
                            </div>

                            <div className="rg-ruling-synthesis">
                                <strong>Judicial Determination:</strong> {TRIAL_SCRIPT.odin.synthesis}
                            </div>

                            <h4 style={{ margin: "0 0 14px", color: "var(--rg-gold)", fontSize: 18 }}>
                                Complete Adjudication Record ({odinRulings.length} Claims Ruled)
                            </h4>

                            <div className="rg-ruling-grid">
                                {odinRulings.map((r) => (
                                    <div
                                        key={r.claimId}
                                        className="rg-ruling-card"
                                        onClick={() => handleOpenSource(r.docId)}
                                        style={{ cursor: "pointer" }}
                                        title={`Click to open backing evidence PDF [${r.docId}]`}
                                    >
                                        <div className="rg-ruling-head">
                                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                <span
                                                    className={`rg-ruling-claimant ${
                                                        r.claimant === "Thor" ? "thor" : "loki"
                                                    }`}
                                                >
                                                    [{r.claimId}] {r.claimant} — {r.claimTitle}
                                                </span>
                                                <span className="rg-nature-badge">{r.nature}</span>
                                            </div>

                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <button
                                                    type="button"
                                                    className="rg-doc-chip"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenSource(r.docId);
                                                    }}
                                                >
                                                    📄 {r.docId}
                                                </button>
                                                <span
                                                    className={`rg-verdict-badge ${
                                                        r.verdict === "Established"
                                                            ? "upheld"
                                                            : r.verdict === "Conceded"
                                                            ? "overruled"
                                                            : r.verdict === "Contested"
                                                            ? "partial"
                                                            : "overruled"
                                                    }`}
                                                >
                                                    {r.verdict}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="rg-ruling-odin">{r.decree}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="rg-directives">
                                <h4>Executive Directives Issued by Odin</h4>
                                <ul>
                                    {TRIAL_SCRIPT.odin.directives.map((dir) => (
                                        <li key={dir.id}>
                                            <strong>{dir.title}:</strong> {dir.detail}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <CaseDashboard
                caseFile={created}
                pack={packDetail}
                claims={[...thorClaims, ...lokiClaims]}
                logs={[...thorLogs, ...lokiLogs, ...odinLogs].sort((a, b) => a.time.localeCompare(b.time))}
                rulings={odinRulings}
                directives={TRIAL_SCRIPT.odin.directives}
                synthesis={TRIAL_SCRIPT.odin.synthesis}
                riskScore={TRIAL_SCRIPT.odin.riskScore}
                complete={phase === "ruled"}
            />

            {/* Trial Gavel Strike Lightning Overlay */}
            {gateOverlay && <GateOverlay />}

            {/* Authentic PDF Document Viewer Popup Modal */}
            {activePdfDoc && (
                <DocumentPdfModal
                    docId={activePdfDoc.docId}
                    tradeRow={activePdfDoc.tradeRow}
                    onClose={() => setActivePdfDoc(null)}
                />
            )}
        </>
    );
}