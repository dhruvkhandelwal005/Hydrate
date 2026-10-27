import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { CaseSummary, DocStatus, PackState, PackStatus } from "../../types/api";
import { AgentPath, ClockGate, CountUp, GateOverlay, RealmRing, Spot, prefersReduced } from "../ui/Fx";
import CaseDashboard from "./CaseDashboard";
import DocumentPdfModal from "./DocumentPdfModal";
import "./document-pdf-modal.css";
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
    const [params, setSearchParams] = useSearchParams();

    // -------------------------------------------------------------------------
    // 1. Integrated Packs State
    // -------------------------------------------------------------------------
    const [packs, setPacks] = useState<PackStatus[]>([]);
    const [packId, setPackId] = useState(params.get("pack") ?? "dev_pack_E5");
    const [packDetail, setPackDetail] = useState<PackStatus | null>(null);
    const [uploadingPack, setUploadingPack] = useState(false);
    const [packDragOver, setPackDragOver] = useState(false);
    const [showPackDrawer, setShowPackDrawer] = useState(false);
    const [onlyProblems, setOnlyProblems] = useState(false);

    // -------------------------------------------------------------------------
    // 2. Case Intake Form State
    // -------------------------------------------------------------------------
    const [question, setQuestion] = useState("");
    const [asOf, setAsOf] = useState("2027-01-25");
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
    const [autoAdvance, setAutoAdvance] = useState(true);
    const [activeEventMessage, setActiveEventMessage] = useState<string | null>(null);
    const [lastActiveAgent, setLastActiveAgent] = useState<"thor" | "loki" | "odin" | null>(null);

    // Log panels collapsible state (open by default while running)
    const [thorLogOpen, setThorLogOpen] = useState(true);
    const [lokiLogOpen, setLokiLogOpen] = useState(true);
    const [odinLogOpen, setOdinLogOpen] = useState(true);
    const [gateOverlay, setGateOverlay] = useState(false);
    // Case History & Audit Dossier Modal State
    const [showLogsModal, setShowLogsModal] = useState(false);
    const [pastCases, setPastCases] = useState<CaseSummary[]>([]);
    const [selectedHistoryCaseId, setSelectedHistoryCaseId] = useState<string | null>(null);
    const [historyDossier, setHistoryDossier] = useState<any | null>(null);
    const [loadingDossier, setLoadingDossier] = useState(false);
    const [dossierTab, setDossierTab] = useState<"summary" | "events" | "claims" | "json">("events");
    const [isDeletingLogs, setIsDeletingLogs] = useState(false);
    const [actionToast, setActionToast] = useState<{ text: string; type: "ok" | "err" } | null>(null);

    const handleOpenLogsModal = useCallback(async (initialCaseId?: string) => {
        setShowLogsModal(true);
        try {
            const list = await api.listCases();
            const safeList = Array.isArray(list) ? list : [];
            setPastCases(safeList);
            const targetId = initialCaseId || (safeList.length > 0 ? safeList[0].case_id : null);
            if (targetId) {
                setSelectedHistoryCaseId(targetId);
                setLoadingDossier(true);
                const d = await api.getCaseDossier(targetId);
                setHistoryDossier(d);
                setLoadingDossier(false);
            } else {
                setSelectedHistoryCaseId(null);
                setHistoryDossier(null);
            }
        } catch (e) {
            console.warn("Error fetching cases list:", e);
            setPastCases([]);
            setLoadingDossier(false);
        }
    }, []);

    const handleSelectHistoryCase = useCallback(async (cid: string) => {
        setSelectedHistoryCaseId(cid);
        setLoadingDossier(true);
        try {
            const data = await api.getCaseDossier(cid);
            setHistoryDossier(data);
        } catch (e) {
            console.warn("Error fetching dossier:", e);
        } finally {
            setLoadingDossier(false);
        }
    }, []);

    const handleDownloadDossier = useCallback(() => {
        if (!historyDossier) return;
        const blob = new Blob([JSON.stringify(historyDossier, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `case_dossier_${selectedHistoryCaseId || "audit"}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [historyDossier, selectedHistoryCaseId]);

    const handleCopyDossier = useCallback(() => {
        if (!historyDossier) return;
        navigator.clipboard.writeText(JSON.stringify(historyDossier, null, 2));
        alert("Dossier JSON copied to clipboard!");
    }, [historyDossier]);

    const handleDeleteLogs = useCallback(async () => {
        if (!selectedHistoryCaseId) return;
        const confirmed = window.confirm(
            `Are you sure you want to delete all execution logs and trace events for case "${selectedHistoryCaseId}"?\nThis cannot be undone.`
        );
        if (!confirmed) return;

        setIsDeletingLogs(true);
        try {
            await api.deleteCaseLogs(selectedHistoryCaseId);
            setHistoryDossier((prev: any) =>
                prev ? { ...prev, events: [], events_count: 0 } : null
            );
            if (created?.case_id === selectedHistoryCaseId) {
                setThorLogs([]);
                setLokiLogs([]);
                setOdinLogs([]);
            }
            setActionToast({ text: `Execution logs for ${selectedHistoryCaseId} deleted.`, type: "ok" });
            setTimeout(() => setActionToast(null), 3500);
        } catch (err: any) {
            console.error("Failed to delete logs:", err);
            setActionToast({ text: `Failed to delete logs: ${err?.message || "Unknown error"}`, type: "err" });
            setTimeout(() => setActionToast(null), 4000);
        } finally {
            setIsDeletingLogs(false);
        }
    }, [selectedHistoryCaseId, created?.case_id]);

    const handleDeleteCase = useCallback(async (caseIdToDelete: string) => {
        const confirmed = window.confirm(
            `Are you sure you want to permanently delete case "${caseIdToDelete}" and all its logs & rulings?\nThis cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await api.deleteCase(caseIdToDelete);
            setPastCases((prev) => {
                const updated = Array.isArray(prev) ? prev.filter((c) => c.case_id !== caseIdToDelete) : [];
                if (selectedHistoryCaseId === caseIdToDelete) {
                    if (updated.length > 0) {
                        const nextId = updated[0].case_id;
                        setSelectedHistoryCaseId(nextId);
                        void handleSelectHistoryCase(nextId);
                    } else {
                        setSelectedHistoryCaseId(null);
                        setHistoryDossier(null);
                    }
                }
                return updated;
            });
            setActionToast({ text: `Case ${caseIdToDelete} and its logs deleted.`, type: "ok" });
            setTimeout(() => setActionToast(null), 3500);
        } catch (err: any) {
            console.error("Failed to delete case:", err);
            setActionToast({ text: `Failed to delete case: ${err?.message || "Unknown error"}`, type: "err" });
            setTimeout(() => setActionToast(null), 4000);
        }
    }, [selectedHistoryCaseId, handleSelectHistoryCase]);

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

    // -------------------------------------------------------------------------
    // Global Event Listener for Case Audit Logs
    // -------------------------------------------------------------------------
    useEffect(() => {
        const onOpenLogs = () => {
            void handleOpenLogsModal(created?.case_id);
        };
        window.addEventListener("open-case-logs", onOpenLogs);
        void api.listCases().then((list) => {
            setPastCases(Array.isArray(list) ? list : []);
        }).catch(() => {
            setPastCases([]);
        });
        return () => window.removeEventListener("open-case-logs", onOpenLogs);
    }, [handleOpenLogsModal, created?.case_id]);

    // -------------------------------------------------------------------------
    // Restore Case From URL (?case={case_id}&restore=true)
    // -------------------------------------------------------------------------
    useEffect(() => {
        const caseParam = params.get("case");
        const shouldRestore = params.get("restore") === "true";
        if (caseParam && !shouldRestore) {
            setSearchParams({});
            return;
        }
        if (!caseParam || !shouldRestore) return;
        let cancelled = false;

        const restoreCaseState = async () => {
            try {
                const caseData = await api.getCase(caseParam);
                if (cancelled || !isMountedRef.current) return;

                setCreated({
                    case_id: caseData.case_id,
                    run_id: caseData.run_id,
                    question: caseData.case_file.question,
                    as_of_date: caseData.case_file.as_of_date,
                    pack_id: caseData.case_file.pack_id,
                    countries: caseData.case_file.countries,
                    sectors: caseData.case_file.sectors,
                    event_hypothesis: caseData.case_file.event_hypothesis,
                    event_id: caseData.case_file.event_id,
                    verification_status: caseData.case_file.verification_status as any,
                    verification_reason: caseData.case_file.verification_summary,
                    verification_doc_ids: caseData.case_file.verification_evidence?.map((e: any) => e.source_id) || [],
                    excluded_count: 0,
                    phase: caseData.phase as any,
                    status: caseData.status as any,
                });
                setQuestion(caseData.case_file.question);
                setAsOf(caseData.case_file.as_of_date);
                if (caseData.case_file.pack_id) setPackId(caseData.case_file.pack_id);
                setPhase(caseData.phase as TrialPhase);

                // Populate claims if present
                if (caseData.claims && caseData.claims.length > 0) {
                    const tc: Claim[] = [];
                    const lc: Claim[] = [];
                    for (const c of caseData.claims) {
                        const docId = c.citations?.[0]?.doc_id || c.citations?.[0]?.table_id || "ORV-0002";
                        const mapped: Claim = {
                            id: c.claim_id,
                            title: c.title || (c.text?.slice(0, 50) + "...") || "Claim " + c.claim_id,
                            body: c.text,
                            docId: docId,
                            docName: docId + ".pdf",
                            country: c.country || "Midgard",
                            sector: c.sector || "Wheat",
                            confidence: typeof c.confidence === "number" && c.confidence <= 1 ? Math.round(c.confidence * 100) : (c.confidence || 85),
                            estimateLow: c.estimate_low ?? 20,
                            estimateHigh: c.estimate_high ?? 40,
                            nature: c.nature === "fact" ? "fact" : "inference",
                            status: (c.status || "asserted").toLowerCase() as any,
                            attack: c.attack ? {
                                attacker: (c.attack.by === "thor" ? "Thor" : "Loki") as any,
                                weaknessType: c.attack.weakness_type || "ignored substitution",
                                critique: c.attack.text || "",
                            } : undefined,
                            rebuttal: c.rebuttal ? {
                                type: (c.rebuttal.kind || "defend").toUpperCase() === "CONCEDE" ? "CONCEDE" : "DEFEND",
                                reason: c.rebuttal.text || "",
                                newDocId: c.rebuttal.new_doc_ids?.[0],
                                newDocName: c.rebuttal.new_doc_ids?.[0] ? `${c.rebuttal.new_doc_ids[0]}.pdf` : undefined,
                            } : undefined,
                        };
                        if (c.agent === "thor") tc.push(mapped);
                        else lc.push(mapped);
                    }
                    setThorClaims(tc);
                    setLokiClaims(lc);
                }

                // Populate rulings if present
                if (caseData.rulings && caseData.rulings.length > 0) {
                    setOdinRulings(caseData.rulings.map((r) => ({
                        claimId: r.claim_id,
                        claimant: r.claim_id.startsWith("T") ? "Thor" : "Loki",
                        claimTitle: r.reason?.slice(0, 50) || "Adjudicated Finding",
                        verdict: (r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1).toLowerCase()) as any,
                        nature: r.nature as any,
                        decree: r.reason,
                        docId: r.doc_ids?.[0] || "ORV-0002",
                    })));
                }

                // Populate traces if present
                const traceData = await api.getCaseTrace(caseParam);
                if (cancelled || !isMountedRef.current) return;
                if (traceData && traceData.events) {
                    const tLogs: LogLine[] = [];
                    const lLogs: LogLine[] = [];
                    const oLogs: LogLine[] = [];
                    for (const ev of traceData.events) {
                        const line: LogLine = {
                            id: ev.id || Math.random().toString(),
                            time: ev.ts ? ev.ts.slice(11, 23) : formatLogTime(),
                            tag: (ev.type?.replace("CLAIM_CREATED", "CLAIM")
                                          .replace("CHALLENGE_CREATED", "ATTACK")
                                          .replace("DEFENCE_CREATED", "DEFEND")
                                          .replace("SEARCH_STARTED", "SEARCH")
                                          .replace("SEARCH_RESULTS", "RETRIEVED")
                                          .replace("RULING_CREATED", "RULING") || "SEARCH") as any,
                            text: ev.payload?.text || ev.payload?.query || JSON.stringify(ev.payload || {}),
                            docIds: ev.payload?.doc_ids || (ev.payload?.doc_id ? [ev.payload.doc_id] : undefined),
                        };
                        if (ev.agent === "thor") tLogs.push(line);
                        else if (ev.agent === "loki") lLogs.push(line);
                        else oLogs.push(line);
                    }
                    if (tLogs.length > 0) setThorLogs(tLogs);
                    if (lLogs.length > 0) setLokiLogs(lLogs);
                    if (oLogs.length > 0) setOdinLogs(oLogs);
                }
            } catch (err) {
                console.warn("Could not restore case from URL:", err);
            }
        };

        void restoreCaseState();
        return () => { cancelled = true; };
    }, [params]);

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
    const formValid = question.trim().length > 0 && asOf !== "";

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

    const mapClaimToUi = (c: any): Claim => {
        const docId = c.citations?.[0]?.doc_id || c.citations?.[0]?.table_id || "ORV-0002";
        return {
            id: c.claim_id,
            title: c.title || (c.text?.slice(0, 50) + "...") || "Claim " + c.claim_id,
            body: c.text,
            docId,
            docName: docId + ".pdf",
            country: c.country || "Midgard",
            sector: c.sector || "Wheat",
            confidence: typeof c.confidence === "number" && c.confidence <= 1 ? Math.round(c.confidence * 100) : (c.confidence || 85),
            estimateLow: c.estimate_low ?? 20,
            estimateHigh: c.estimate_high ?? 40,
            nature: c.nature === "fact" ? "fact" : "inference",
            status: (c.status || "asserted").toLowerCase() as any,
        };
    };

    const syncTracesFromBackend = (traceData: any) => {
        if (!traceData?.events || !Array.isArray(traceData.events)) return;
        const tLogs: LogLine[] = [];
        const lLogs: LogLine[] = [];
        const oLogs: LogLine[] = [];
        for (const ev of traceData.events) {
            const p = ev.payload || {};
            const tsFormatted = ev.timestamp ? ev.timestamp.slice(11, 23) : formatLogTime();
            const tag = (ev.event_type?.replace("CLAIM_CREATED", "CLAIM")
                                      .replace("CHALLENGE_CREATED", "ATTACK")
                                      .replace("DEFENCE_CREATED", "DEFEND")
                                      .replace("SEARCH_STARTED", "SEARCH")
                                      .replace("SEARCH_RESULTS", "RETRIEVED")
                                      .replace("RULING_CREATED", "RULING")
                                      .replace("CLAIM_CONCEDED", "CONCEDE") || "SEARCH") as any;
            const logText = p.text || p.query || p.reason || p.finding || (p.claim_id ? `Claim ${p.claim_id}: ${p.title || ""}` : ev.event_type);
            const docIds = p.doc_ids || (p.doc_id ? [p.doc_id] : p.new_doc_ids || (p.counter_doc_ids ? p.counter_doc_ids : undefined));
            const line: LogLine = {
                id: ev.trace_id || `line_${Math.random().toString(36).slice(2, 8)}`,
                time: tsFormatted,
                tag,
                text: logText,
                docIds: Array.isArray(docIds) ? docIds : undefined,
            };
            if (ev.agent === "thor") tLogs.push(line);
            else if (ev.agent === "loki") lLogs.push(line);
            else oLogs.push(line);
        }
        if (tLogs.length > 0) setThorLogs(tLogs);
        if (lLogs.length > 0) setLokiLogs(lLogs);
        if (oLogs.length > 0) setOdinLogs(oLogs);
    };

    const runFullCourtroomPipeline = async (caseId: string, force = false) => {
        // Start a persistent SSE stream with replay so no early trace events are lost
        const unsub = api.subscribeStream(
            caseId,
            handleStreamEvent,
            (streamErr) => console.warn("Live SSE stream status:", streamErr),
            true
        );

        try {
            // STEP 1: Round 1 Parallel Advocacy (Thor & Loki)
            setPhase("r1_running");
            setThorLogOpen(true);
            setLokiLogOpen(true);
            setActiveEventMessage("⚔️ Round 1: Thor and Loki advocating in parallel...");
            await api.advanceCase(caseId, "round1", force);

            const [cData1, traceData1] = await Promise.all([
                api.getCase(caseId).catch(() => null),
                api.getCaseTrace(caseId).catch(() => null),
            ]);
            if (cData1?.claims && cData1.claims.length > 0) {
                setThorClaims(cData1.claims.filter((c: any) => c.agent === "thor").map(mapClaimToUi));
                setLokiClaims(cData1.claims.filter((c: any) => c.agent === "loki").map(mapClaimToUi));
            }
            if (traceData1) syncTracesFromBackend(traceData1);

            setPhase("r1_done");
            setActiveEventMessage("✓ Round 1 Complete! Opening claims established. Advancing to Round 2 Cross-Examination...");
            await wait(1000);

            // STEP 2: Round 2 Cross-Examination & Defences
            setPhase("r2_running");
            setActiveEventMessage("⚡ Round 2: Adversarial cross-examination and counter-evidence rebuttals...");
            await api.advanceCase(caseId, "round2", force);

            const [cData2, traceData2] = await Promise.all([
                api.getCase(caseId).catch(() => null),
                api.getCaseTrace(caseId).catch(() => null),
            ]);
            if (cData2?.claims && cData2.claims.length > 0) {
                setThorClaims(cData2.claims.filter((c: any) => c.agent === "thor").map(mapClaimToUi));
                setLokiClaims(cData2.claims.filter((c: any) => c.agent === "loki").map(mapClaimToUi));
            }
            if (traceData2) syncTracesFromBackend(traceData2);

            setPhase("r2_done");
            setActiveEventMessage("✓ Round 2 Complete! Cross-examination concluded. Summoning Odin the Allfather...");
            await wait(1000);

            // STEP 3: Odin Judicial Review
            setPhase("judging");
            setOdinLogOpen(true);
            setGateOverlay(true);
            setActiveEventMessage("ᛟ The Seat of the Allfather: Odin weighing cross-examination claims and as-of cutoff...");
            await wait(800);
            setGateOverlay(false);

            await api.advanceCase(caseId, "judge", force);

            const [rulingData, traceData3] = await Promise.all([
                api.getCaseRuling(caseId).catch(() => null),
                api.getCaseTrace(caseId).catch(() => null),
            ]);
            if (rulingData?.rulings && rulingData.rulings.length > 0) {
                setOdinRulings(rulingData.rulings.map((r: any) => ({
                    claimId: r.claim_id,
                    claimant: r.claim_id?.startsWith("T") ? "Thor" : "Loki",
                    claimTitle: r.reason?.slice(0, 50) || `Ruling on ${r.claim_id}`,
                    verdict: (r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1).toLowerCase()) as any,
                    nature: r.nature || "fact",
                    decree: r.reason || rulingData.determination,
                    docId: r.doc_ids?.[0] || "ORV-0002",
                })));
            }
            if (traceData3) syncTracesFromBackend(traceData3);

            setPhase("ruled");
            setActiveEventMessage("⚖️ Odin has delivered the Final Judicial Decree!");
        } catch (err: any) {
            console.error("Pipeline advancement error:", err);
            if (isMountedRef.current) {
                setError("Workflow error: " + (err.message || String(err)));
            }
        } finally {
            unsub();
        }
    };

    const handleForceTribunal = async () => {
        if (!created) return;
        setBusyCreate(true);
        setActiveEventMessage("⚔️ Convening Adversarial Tribunal in Simulation Mode...");
        try {
            await runFullCourtroomPipeline(created.case_id, true);
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            if (isMountedRef.current) setBusyCreate(false);
        }
    };

    const handleCreateCase = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || !asOf) return;
        setError(null);
        setBusyCreate(true);
        setCreated(null);
        setThorClaims([]);
        setLokiClaims([]);
        setThorLogs([]);
        setLokiLogs([]);
        setOdinLogs([]);
        setOdinRulings([]);
        setPhase("idle");

        try {
            const res = await api.createCase({
                question: trimmed,
                as_of_date: asOf,
                pack_id: packId || "dev_pack_E5",
            });
            if (!isMountedRef.current) return;
            setCreated(res);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("case", res.case_id);
                return next;
            });

            // 1. GATEKEEPER CHECK: If not verified, display the event verification verdict audit!
            if (res.verification_status === "NOT_VERIFIED") {
                setActiveEventMessage("🛡️ Heimdall Event Verification Concluded: Alert evaluated & audited against port telemetry.");
                setBusyCreate(false);
                return;
            }

            // 2. VERIFIED: Run entire real courtroom workflow automatically!
            setActiveEventMessage("✓ Verified by Heimdall! Initiating Round 1 parallel advocacy...");
            await runFullCourtroomPipeline(res.case_id);
        } catch (err: any) {
            console.error("Courtroom run error:", err);
            if (isMountedRef.current) {
                setError(err.message || String(err));
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

    const handleStreamEvent = (evt: any) => {
        const p = evt.payload || {};
        const tsFormatted = evt.ts ? evt.ts.slice(11, 23) : formatLogTime();
        const agent = (evt.agent || "system").toLowerCase();

        let tag: any = "SEARCH";
        if (evt.type === "SEARCH_STARTED") tag = "SEARCH";
        else if (evt.type === "SEARCH_RESULTS") tag = "RETRIEVED";
        else if (evt.type === "CLAIM_CREATED") tag = "CLAIM";
        else if (evt.type === "CHALLENGE_CREATED") tag = "ATTACK";
        else if (evt.type === "DEFENCE_CREATED") tag = "DEFEND";
        else if (evt.type === "CLAIM_CONCEDED") tag = "CONCEDE";
        else if (evt.type === "RULING_CREATED") tag = "RULING";
        else if (evt.type === "DUPLICATE_QUERY_BLOCKED" || evt.type === "CLOCK_VIOLATION") tag = "BLOCKED";
        else if (evt.type === "INJECTION_DETECTED") tag = "SANDBOX";

        const logText = p.text || p.query || p.reason || p.finding || (p.claim_id ? `Claim ${p.claim_id}: ${p.title || ""}` : evt.type);
        const docIds = p.doc_ids || (p.doc_id ? [p.doc_id] : p.new_doc_ids || (p.counter_doc_ids ? p.counter_doc_ids : undefined));

        const line: LogLine = {
            id: evt.id || `evt_${Math.random().toString(36).slice(2, 8)}`,
            time: tsFormatted,
            tag,
            text: logText,
            docIds: Array.isArray(docIds) ? docIds : undefined,
        };

        if (agent === "thor" || agent === "loki" || agent === "odin") {
            setLastActiveAgent(agent);
        }
        const citedBadge = Array.isArray(docIds) && docIds.length > 0 ? ` [Cited: ${docIds.join(", ")}]` : "";
        setActiveEventMessage(`${(agent || "system").toUpperCase()} · ${tag}: ${logText.slice(0, 85)}${citedBadge}`);

        if (agent === "thor") setThorLogs((prev) => [...prev, line]);
        else if (agent === "loki") setLokiLogs((prev) => [...prev, line]);
        else setOdinLogs((prev) => [...prev, line]);

        if (evt.type === "CLAIM_CREATED" && p.claim_id) {
            const docId = p.citations?.[0]?.doc_id || p.citations?.[0]?.table_id || "ORV-0002";
            const claimObj: Claim = {
                id: p.claim_id,
                title: p.title || p.text?.slice(0, 50) || `Claim ${p.claim_id}`,
                body: p.text || "",
                docId,
                docName: docId + ".pdf",
                country: p.country || "Midgard",
                sector: p.sector || "Wheat",
                confidence: typeof p.confidence === "number" && p.confidence <= 1 ? Math.round(p.confidence * 100) : (p.confidence || 85),
                estimateLow: p.estimate_low ?? 20,
                estimateHigh: p.estimate_high ?? 40,
                nature: p.nature === "fact" ? "fact" : "inference",
                status: (p.status || "asserted").toLowerCase() as any,
            };
            if (claimObj.id.startsWith("T") || agent === "thor") {
                setThorClaims((prev) => prev.some((c) => c.id === claimObj.id) ? prev : [...prev, claimObj]);
            } else {
                setLokiClaims((prev) => prev.some((c) => c.id === claimObj.id) ? prev : [...prev, claimObj]);
            }
        } else if (evt.type === "CHALLENGE_CREATED" && p.target_claim_id) {
            const updater = (c: Claim) => c.id === p.target_claim_id ? {
                ...c,
                status: "attacked" as const,
                attack: {
                    attacker: (agent === "thor" ? "Thor" : "Loki") as any,
                    weaknessType: p.weakness_type || "critical flaw",
                    critique: p.text || "",
                }
            } : c;
            setThorClaims((prev) => prev.map(updater));
            setLokiClaims((prev) => prev.map(updater));
        } else if (evt.type === "DEFENCE_CREATED" && p.target_claim_id) {
            const updater = (c: Claim) => c.id === p.target_claim_id ? {
                ...c,
                status: "defended" as const,
                rebuttal: {
                    type: "DEFEND" as const,
                    reason: p.text || "",
                    newDocId: p.new_doc_ids?.[0],
                    newDocName: p.new_doc_ids?.[0] ? `${p.new_doc_ids[0]}.pdf` : undefined,
                }
            } : c;
            setThorClaims((prev) => prev.map(updater));
            setLokiClaims((prev) => prev.map(updater));
        } else if (evt.type === "CLAIM_CONCEDED" && p.claim_id) {
            const updater = (c: Claim) => c.id === p.claim_id ? {
                ...c,
                status: "conceded" as const,
                rebuttal: {
                    type: "CONCEDE" as const,
                    reason: p.reason || "Conceded claim",
                }
            } : c;
            setThorClaims((prev) => prev.map(updater));
            setLokiClaims((prev) => prev.map(updater));
        } else if (evt.type === "RULING_CREATED" && p.claim_id) {
            const verdictStr = p.verdict ? (p.verdict.charAt(0).toUpperCase() + p.verdict.slice(1).toLowerCase()) : "Established";
            setOdinRulings((prev) => [
                ...prev.filter((r) => r.claimId !== p.claim_id),
                {
                    claimId: p.claim_id,
                    claimant: p.claim_id.startsWith("T") ? "Thor" : "Loki",
                    claimTitle: p.reason?.slice(0, 50) || `Ruling on ${p.claim_id}`,
                    verdict: verdictStr as any,
                    nature: p.nature || "fact",
                    decree: p.reason || "Decreed by Odin",
                    docId: p.doc_ids?.[0] || "ORV-0002",
                }
            ]);
        }
    };

    // ROUND 1: Opening Claims (Thor and Loki in parallel)
    const handleStartRound1 = async () => {
        if (phase !== "idle") return;
        setPhase("r1_running");
        setThorLogOpen(true);
        setLokiLogOpen(true);

        if (created?.case_id) {
            try {
                const unsub = api.subscribeStream(
                    created.case_id,
                    handleStreamEvent,
                    (err) => console.warn("SSE stream notice:", err)
                );
                await api.advanceCase(created.case_id, "round1");
                await wait(800);
                unsub();

                const caseData = await api.getCase(created.case_id);
                if (isMountedRef.current) {
                    if (caseData.claims && caseData.claims.length > 0) {
                        const tc: Claim[] = [];
                        const lc: Claim[] = [];
                        for (const c of caseData.claims) {
                            const docId = c.citations?.[0]?.doc_id || c.citations?.[0]?.table_id || "ORV-0002";
                            const mapped: Claim = {
                                id: c.claim_id,
                                title: c.title || (c.text?.slice(0, 50) + "...") || "Claim " + c.claim_id,
                                body: c.text,
                                docId,
                                docName: docId + ".pdf",
                                country: c.country || "Midgard",
                                sector: c.sector || "Wheat",
                                confidence: typeof c.confidence === "number" && c.confidence <= 1 ? Math.round(c.confidence * 100) : (c.confidence || 85),
                                estimateLow: c.estimate_low ?? 20,
                                estimateHigh: c.estimate_high ?? 40,
                                nature: c.nature === "fact" ? "fact" : "inference",
                                status: (c.status || "asserted").toLowerCase() as any,
                            };
                            if (c.agent === "thor") tc.push(mapped);
                            else lc.push(mapped);
                        }
                        setThorClaims(tc);
                        setLokiClaims(lc);
                    }
                    setPhase("r1_done");
                    if (autoAdvance) {
                        setActiveEventMessage("Round 1 Complete: Auto-advancing to Round 2 Cross-Examination...");
                        window.setTimeout(() => {
                            if (isMountedRef.current) void handleStartRound2();
                        }, 1300);
                    }
                }
                return;
            } catch (err) {
                console.warn("Backend round1 advancement threw error, falling back to script:", err);
            }
        }

        const r1Data = await runTrialStep("round1");
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
            if (autoAdvance) {
                setActiveEventMessage("Round 1 Complete: Auto-advancing to Round 2 Cross-Examination...");
                window.setTimeout(() => {
                    if (isMountedRef.current) void handleStartRound2();
                }, 1300);
            }
        }
    };

    // ROUND 2: Cross-Examination (Thor and Loki in parallel)
    const handleStartRound2 = async () => {
        if (phase !== "r1_done") return;
        setPhase("r2_running");
        setThorLogOpen(true);
        setLokiLogOpen(true);

        if (created?.case_id) {
            try {
                const unsub = api.subscribeStream(
                    created.case_id,
                    handleStreamEvent,
                    (err) => console.warn("SSE stream notice:", err)
                );
                await api.advanceCase(created.case_id, "round2");
                await wait(800);
                unsub();

                const caseData = await api.getCase(created.case_id);
                if (isMountedRef.current) {
                    if (caseData.claims && caseData.claims.length > 0) {
                        const tc: Claim[] = [];
                        const lc: Claim[] = [];
                        for (const c of caseData.claims) {
                            const docId = c.citations?.[0]?.doc_id || c.citations?.[0]?.table_id || "ORV-0002";
                            const mapped: Claim = {
                                id: c.claim_id,
                                title: c.title || (c.text?.slice(0, 50) + "...") || "Claim " + c.claim_id,
                                body: c.text,
                                docId,
                                docName: docId + ".pdf",
                                country: c.country || "Midgard",
                                sector: c.sector || "Wheat",
                                confidence: typeof c.confidence === "number" && c.confidence <= 1 ? Math.round(c.confidence * 100) : (c.confidence || 85),
                                estimateLow: c.estimate_low ?? 20,
                                estimateHigh: c.estimate_high ?? 40,
                                nature: c.nature === "fact" ? "fact" : "inference",
                                status: (c.status || "asserted").toLowerCase() as any,
                                attack: c.attack ? {
                                    attacker: (c.attack.by === "thor" ? "Thor" : "Loki") as any,
                                    weaknessType: c.attack.weakness_type || "ignored substitution",
                                    critique: c.attack.text || "",
                                } : undefined,
                                rebuttal: c.rebuttal ? {
                                    type: (c.rebuttal.kind || "defend").toUpperCase() === "CONCEDE" ? "CONCEDE" : "DEFEND",
                                    reason: c.rebuttal.text || "",
                                    newDocId: c.rebuttal.new_doc_ids?.[0],
                                    newDocName: c.rebuttal.new_doc_ids?.[0] ? `${c.rebuttal.new_doc_ids[0]}.pdf` : undefined,
                                } : undefined,
                            };
                            if (c.agent === "thor") tc.push(mapped);
                            else lc.push(mapped);
                        }
                        setThorClaims(tc);
                        setLokiClaims(lc);
                    }
                    setPhase("r2_done");
                    if (autoAdvance) {
                        setActiveEventMessage("Round 2 Cross-Examination Complete: Advancing to Odin Final Decrees...");
                        window.setTimeout(() => {
                            if (isMountedRef.current) void handleStrikeGavel();
                        }, 1300);
                    }
                }
                return;
            } catch (err) {
                console.warn("Backend round2 advancement threw error, falling back to script:", err);
            }
        }

        const r2Data = await runTrialStep("round2");
        await Promise.all([
            (async () => {
                await streamAgentLogs(r2Data.thorLog, setThorLogs);
            })(),
            (async () => {
                await streamAgentLogs(r2Data.lokiLog, setLokiLogs);
            })(),
        ]);

        if (!isMountedRef.current) return;
        setThorClaims((prev) =>
            prev.map((c) => (c.id === "T-101" ? { ...c, status: "defended" } : c))
        );
        setLokiClaims((prev) =>
            prev.map((c) => (c.id === "L-203" ? { ...c, status: "conceded" } : c))
        );
        setPhase("r2_done");
        if (autoAdvance) {
            setActiveEventMessage("Round 2 Cross-Examination Complete: Advancing to Odin Final Decrees...");
            window.setTimeout(() => {
                if (isMountedRef.current) void handleStrikeGavel();
            }, 1300);
        }
    };

    // JUDGE: Odin's Ruling
    const handleStrikeGavel = async () => {
        if (phase !== "r2_done") return;
        setPhase("judging");
        setOdinLogOpen(true);
        setGateOverlay(true);

        await wait(prefersReduced() ? 100 : 1000);
        if (!isMountedRef.current) return;
        setGateOverlay(false);

        if (created?.case_id) {
            try {
                const unsub = api.subscribeStream(
                    created.case_id,
                    handleStreamEvent,
                    (err) => console.warn("SSE stream notice:", err)
                );
                await api.advanceCase(created.case_id, "judge");
                await wait(800);
                unsub();

                const rulingData = await api.getCaseRuling(created.case_id);
                if (isMountedRef.current) {
                    if (rulingData.rulings && rulingData.rulings.length > 0) {
                        setOdinRulings(rulingData.rulings.map((r: any) => ({
                            claimId: r.claim_id,
                            claimant: r.claim_id?.startsWith("T") ? "Thor" : "Loki",
                            claimTitle: r.reason?.slice(0, 50) || `Ruling on ${r.claim_id}`,
                            verdict: (r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1).toLowerCase()) as any,
                            nature: r.nature || "fact",
                            decree: r.reason || rulingData.determination,
                            docId: r.doc_ids?.[0] || "ORV-0002",
                        })));
                    }
                    setPhase("ruled");
                }
                return;
            } catch (err) {
                console.warn("Backend judge advancement threw error, falling back to script:", err);
            }
        }

        const odinData = await runTrialStep("odin");
        await streamAgentLogs(odinData.odinLog, setOdinLogs);
        if (!isMountedRef.current) return;
        setOdinRulings(odinData.rulings);
        setPhase("ruled");
    };

    // Reset Trial
    const handleResetTrial = async () => {
        if (created?.case_id) {
            try {
                const newCase = await api.resetCase(created.case_id);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("case", newCase.case_id);
                    return next;
                });
                setCreated(newCase);
            } catch (err) {
                console.warn("Backend reset error:", err);
            }
        }
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                    <h1 style={{ margin: 0 }}>Trial Intake & Courtroom Pipeline</h1>
                    <p className="rg-lede" style={{ margin: "4px 0 0" }}>
                        Submit your disruption query below. Heimdall evaluates admissibility, then Thor, Loki, and Odin adjudicate the exposure.
                    </p>
                </div>
                <button
                    type="button"
                    className="rg-btn"
                    style={{
                        background: "rgba(234, 179, 8, 0.18)",
                        border: "1px solid #eab308",
                        color: "#fef08a",
                        padding: "8px 16px",
                        fontSize: "13px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        boxShadow: "0 0 14px rgba(234, 179, 8, 0.25)",
                        borderRadius: "8px"
                    }}
                    onClick={() => void handleOpenLogsModal(created?.case_id)}
                    title="View full execution logs and timeline for each queried case"
                >
                    <span style={{ fontSize: "16px" }}>📜</span> Case Audit Logs ({Array.isArray(pastCases) ? pastCases.length : 0})
                </button>
            </div>

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
                                onChange={(e) => {
                                    setQuestion(e.target.value);
                                    setCreated(null);
                                    setPhase("idle");
                                    setThorClaims([]);
                                    setLokiClaims([]);
                                    setThorLogs([]);
                                    setLokiLogs([]);
                                    setOdinLogs([]);
                                    setOdinRulings([]);
                                    setError(null);
                                    setActiveEventMessage(null);
                                    if (params.get("case")) {
                                        setSearchParams({});
                                    }
                                }}
                                placeholder="State your scenario: e.g. How exposed are Midgard and Tolan to the Orvan corridor closure? (or type any query)"
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

                        <div className="rg-actions" style={{ marginTop: "12px" }}>
                            <button
                                type="submit"
                                className="rg-btn"
                                style={{
                                    width: "100%",
                                    fontSize: "15px",
                                    fontWeight: "bold",
                                    background: "linear-gradient(135deg, #eab308, #ca8a04)",
                                    color: "#0a120e",
                                    boxShadow: "0 0 20px rgba(234, 179, 8, 0.4)",
                                    padding: "14px 24px",
                                    cursor: "pointer",
                                    borderRadius: "8px",
                                    border: "none",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: "8px"
                                }}
                                disabled={!formValid || busyCreate}
                            >
                                {busyCreate ? "⚡ Heimdall Checking Relevance & Running Workflow…" : "⚡ Send Query & Run Workflow"}
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
                                    <dt>Sealed Docs</dt>
                                    <dd>{created.excluded_count ?? 0} post-date files</dd>
                                </dl>

                                {/* Verification Status Banner */}
                                {created.verification_status === "NOT_VERIFIED" ? (
                                    <div
                                        role="region"
                                        aria-label="Heimdall Event Verification Verdict"
                                        style={{
                                            marginTop: 14,
                                            border: "1px solid rgba(234, 179, 8, 0.45)",
                                            background: "linear-gradient(180deg, rgba(30, 25, 15, 0.95), rgba(18, 15, 10, 0.98))",
                                            boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(234, 179, 8, 0.2)",
                                            padding: 18,
                                            borderRadius: 10,
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={{ fontSize: 22 }}>🛡️</span>
                                                <div>
                                                    <h4 style={{ margin: 0, color: "#facc15", fontSize: 15, fontWeight: "bold", letterSpacing: "0.04em" }}>
                                                        HEIMDALL EVENT VERIFICATION · DECOY ALERT AUDIT
                                                    </h4>
                                                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                                                        Ruling: Refuted / Rejected as Decoy · Port Authority & Logistics Audit Complete
                                                    </span>
                                                </div>
                                            </div>
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: "4px 10px",
                                                    borderRadius: 9999,
                                                    background: "rgba(239, 68, 68, 0.2)",
                                                    border: "1px solid #ef4444",
                                                    color: "#f87171",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                }}
                                            >
                                                Decoy Alert Refuted
                                            </span>
                                        </div>

                                        <div style={{ background: "rgba(0,0,0,0.4)", padding: 12, borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
                                            <p style={{ margin: 0, fontSize: 13, color: "#e4e4e7", lineHeight: 1.6 }}>
                                                {created.verification_reason}
                                            </p>
                                        </div>

                                        {/* Verified Port Authority & Logistics Records */}
                                        {created.verification_doc_ids && created.verification_doc_ids.length > 0 && (
                                            <div style={{ marginBottom: 14 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#facc15", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span>📑</span> Verified Port Authority & Logistics Records Retrieved:
                                                </div>
                                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                    {created.verification_doc_ids.map((docId) => (
                                                        <button
                                                            key={docId}
                                                            type="button"
                                                            className="rg-doc-chip"
                                                            style={{ background: "rgba(234, 179, 8, 0.15)", border: "1px solid rgba(234, 179, 8, 0.5)", color: "#fef08a" }}
                                                            onClick={() => handleOpenSource(docId)}
                                                            title={`Click to inspect backing record ${docId}`}
                                                        >
                                                            📄 {docId} (Verified Record)
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Source Trust & Reliability Breakdown */}
                                        <div style={{ marginBottom: 14, background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                                                Evidentiary Trust & Reliability Analysis
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                                                <div style={{ padding: "6px 10px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 4 }}>
                                                    <span style={{ color: "#34d399", fontWeight: 700 }}>✓ Port Authority & Ministry Telemetry (Tier 1):</span>
                                                    <p style={{ margin: "2px 0 0", color: "#a7f3d0", fontSize: 11 }}>
                                                        High Reliability (0.90+ Trust) — Confirms labor strike & regulatory corridor lapse. Zero physical or kinetic damage to silos.
                                                    </p>
                                                </div>
                                                <div style={{ padding: "6px 10px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 4 }}>
                                                    <span style={{ color: "#f87171", fontWeight: 700 }}>✕ Breaking Attack Alert (Tier 4 / Social):</span>
                                                    <p style={{ margin: "2px 0 0", color: "#fecaca", fontSize: 11 }}>
                                                        Zero Admissibility — Classified as an unverified rumor / decoy alert. Physically refuted by operational port logs.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Retrieval Query Audit */}
                                        {created.retrieval_queries && created.retrieval_queries.length > 0 && (
                                            <details style={{ marginBottom: 14, fontSize: 12 }}>
                                                <summary style={{ cursor: "pointer", color: "#38bdf8", fontWeight: 600 }}>
                                                    🔍 View Heimdall Search Queries & Event Pool Audit ({created.retrieval_queries.length} queries)
                                                </summary>
                                                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#94a3b8", fontFamily: "monospace", fontSize: 11 }}>
                                                    {created.retrieval_queries.map((q, idx) => (
                                                        <li key={idx} style={{ marginBottom: 3 }}>{q}</li>
                                                    ))}
                                                </ul>
                                            </details>
                                        )}

                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 10 }}>
                                            <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                                                Status: <strong>STOPPED_NOT_VERIFIED (DECOY RULED)</strong>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleForceTribunal}
                                                style={{
                                                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                                    color: "#0a0a0a",
                                                    border: "none",
                                                    padding: "8px 16px",
                                                    borderRadius: 6,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    boxShadow: "0 0 12px rgba(245, 158, 11, 0.3)",
                                                }}
                                                title="Convene Thor vs Loki adversarial trial to simulate advocacy on this hypothesis"
                                            >
                                                ⚔️ Convene Adversarial Tribunal Anyway (Simulation Mode)
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        role="region"
                                        aria-label="Heimdall Verification Admitted"
                                        style={{
                                            marginTop: 14,
                                            padding: 16,
                                            background: "rgba(16, 185, 129, 0.12)",
                                            border: "1px solid #10b981",
                                            borderRadius: 8,
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ color: "#34d399", fontWeight: "bold", fontSize: 14 }}>
                                                    ✓ HEIMDALL EVENT VERIFIED · ADMITTED TO TRIBUNAL
                                                </span>
                                                {created.event_id && <span className="rg-badge ok">{created.event_id}</span>}
                                            </div>
                                            <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>
                                                Phase: {phase.toUpperCase()}
                                            </span>
                                        </div>
                                        <p style={{ margin: "4px 0 10px", fontSize: 13, color: "#d1fae5", lineHeight: 1.5 }}>
                                            {created.verification_reason}
                                        </p>
                                        {created.verification_doc_ids && created.verification_doc_ids.length > 0 && (
                                            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                                <span style={{ fontSize: 11, color: "#a8e6cf", fontWeight: 600 }}>Corroborating Telemetry & Evidence:</span>
                                                {created.verification_doc_ids.map((docId) => (
                                                    <button key={docId} type="button" className="rg-doc-chip" onClick={() => handleOpenSource(docId)}>
                                                        📄 {docId}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {created.retrieval_queries && created.retrieval_queries.length > 0 && (
                                            <details style={{ marginTop: 10, fontSize: 12 }}>
                                                <summary style={{ cursor: "pointer", color: "#6ee7b7", fontWeight: 600 }}>
                                                    🔍 View Heimdall Search Queries & Retrieval Audit ({created.retrieval_queries.length} queries)
                                                </summary>
                                                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#a7f3d0", fontFamily: "monospace", fontSize: 11 }}>
                                                    {created.retrieval_queries.map((q, idx) => (
                                                        <li key={idx} style={{ marginBottom: 3 }}>{q}</li>
                                                    ))}
                                                </ul>
                                            </details>
                                        )}
                                    </div>
                                )}

                                {created.verification_status === "VERIFIED" && created.countries.length > 0 && (
                                    <>
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
                                    </>
                                )}

                                {created.verification_status === "VERIFIED" && created.sectors.length > 0 && (
                                    <>
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
                                    </>
                                )}
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
            {/* (Rendered when query is verified OR simulation mode is engaged)   */}
            {/* ================================================================= */}
            {created && (created.verification_status === "VERIFIED" || phase !== "idle") && (
                <>
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
                {/* 4. COURTROOM STAGE STEPPER & LIVE TELEMETRY TICKER            */}
                {/* ============================================================= */}
                <div className="rg-stage-stepper">
                    <div className={`rg-stage-step ${created?.verification_status === "VERIFIED" ? "done" : "active"}`}>
                        <span className="rg-step-num">1</span>
                        <span>Heimdall Gatekeeper {created?.verification_status === "VERIFIED" ? "✓" : ""}</span>
                    </div>
                    <div className={`rg-stage-step ${phase === "r1_running" ? "active" : (phase !== "idle" ? "done" : "")}`}>
                        <span className="rg-step-num">2</span>
                        <span>Round 1: Parallel Advocacy</span>
                    </div>
                    <div className={`rg-stage-step ${phase === "r2_running" ? "active" : (phase === "r2_done" || phase === "judging" || phase === "ruled" ? "done" : "")}`}>
                        <span className="rg-step-num">3</span>
                        <span>Round 2: Cross-Examination</span>
                    </div>
                    <div className={`rg-stage-step ${phase === "judging" ? "active" : (phase === "ruled" ? "done" : "")}`}>
                        <span className="rg-step-num">4</span>
                        <span>Odin Judicial Review</span>
                    </div>
                </div>

                <div className="rg-live-ticker-wrap">
                    <span className="rg-pulse-beacon" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Live Courtroom Telemetry:
                    </span>
                    <span style={{ fontSize: 13, color: "#f1f5f9", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeEventMessage || (phase === "idle" ? "Waiting for case parameter verification..." : `Phase: ${phase.toUpperCase()} · Live telemetry synchronized.`)}
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => setAutoAdvance(v => !v)}
                            style={{
                                background: autoAdvance ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)",
                                border: `1px solid ${autoAdvance ? "#10b981" : "#64748b"}`,
                                color: autoAdvance ? "#34d399" : "#94a3b8",
                                fontSize: 11,
                                padding: "4px 10px",
                                borderRadius: 9999,
                                cursor: "pointer",
                                fontWeight: 600
                            }}
                            title="When enabled, trial automatically advances across rounds without manual button clicking"
                        >
                            Auto-Advance: {autoAdvance ? "ON" : "OFF"}
                        </button>
                    </div>
                </div>

                {/* ============================================================= */}
                {/* 5. DUAL FIGHTER CARDS (THOR & LOKI)                           */}
                {/* ============================================================= */}
                <div className="rg-combat-row">
                    {/* THOR CARD */}
                    <div className={`rg-fighter-card thor ${phase === "r1_running" || (phase === "r2_running" && lastActiveAgent === "thor") ? "active-aura" : ""}`}>
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
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                    {thorLogs.length > 0 && (
                                        <button
                                            type="button"
                                            className="rg-toggle-btn"
                                            style={{ padding: "2px 8px", fontSize: 11, color: "#fca5a5" }}
                                            onClick={() => setThorLogs([])}
                                            title="Clear Thor's terminal logs"
                                        >
                                            Clear
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="rg-toggle-btn"
                                        style={{ padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => setThorLogOpen((v) => !v)}
                                    >
                                        {thorLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                    </button>
                                </div>
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
                    <div className={`rg-fighter-card loki ${phase === "r1_running" || (phase === "r2_running" && lastActiveAgent === "loki") ? "active-aura" : ""}`}>
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
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                    {lokiLogs.length > 0 && (
                                        <button
                                            type="button"
                                            className="rg-toggle-btn"
                                            style={{ padding: "2px 8px", fontSize: 11, color: "#fca5a5" }}
                                            onClick={() => setLokiLogs([])}
                                            title="Clear Loki's terminal logs"
                                        >
                                            Clear
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="rg-toggle-btn"
                                        style={{ padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => setLokiLogOpen((v) => !v)}
                                    >
                                        {lokiLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                    </button>
                                </div>
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
                <div className={`rg-odin-section ${phase === "judging" ? "active-aura" : ""}`}>
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
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                    {odinLogs.length > 0 && (
                                        <button
                                            type="button"
                                            className="rg-toggle-btn"
                                            style={{ padding: "2px 8px", fontSize: 11, color: "#fca5a5" }}
                                            onClick={() => setOdinLogs([])}
                                            title="Clear Odin's judicial terminal logs"
                                        >
                                            Clear
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="rg-toggle-btn"
                                        style={{ padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => setOdinLogOpen((v) => !v)}
                                    >
                                        {odinLogOpen ? "Hide Log ▲" : "Show Log ▼"}
                                    </button>
                                </div>
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

                            {/* Tri-Partite Adjudication Breakdown for Benchmark PS-3 */}
                            <div style={{ margin: "20px 0 24px" }}>
                                <h4 style={{ margin: "0 0 10px", color: "var(--rg-gold)", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                    <span>⚖️</span> Cross-Examination Adjudication: Established vs. Contested vs. Conceded
                                </h4>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                                    <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.35)", borderRadius: 8, padding: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                            <span>✓</span> ESTABLISHED CLAIMS
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: "#d1fae5", lineHeight: 1.5 }}>
                                            Corroborated by official customs telemetry (ORV-0012, ORV-0017): Port loading volume contracted to index 32–40 (~60–68% reduction). Expiration of maritime corridor agreement and 14-Sept dock strike confirmed.
                                        </p>
                                    </div>
                                    <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.35)", borderRadius: 8, padding: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#facc15", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                            <span>⚡</span> CONTESTED CLAIMS
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: "#fef08a", lineHeight: 1.5 }}>
                                            Ledger Analytics' -90% catastrophic wipeout projection (ORV-0045) is actively contested by Corvan Grain operational telemetry and overland rail throughput via Ravik & Vanir routes.
                                        </p>
                                    </div>
                                    <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.35)", borderRadius: 8, padding: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                            <span>✕</span> CONCEDED / REJECTED
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: "#fecaca", lineHeight: 1.5 }}>
                                            "Imminent famine in importing nations": Conceded & rejected — bilateral contracting absorbs month-by-month demand with zero documented famine. Physical destruction of silos refuted as decoy alert.
                                        </p>
                                    </div>
                                </div>
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
                                <h4>Recommendations for Decision Makers</h4>
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
            </>
            )}

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

            {/* Case History & Audit Dossier Modal */}
            {showLogsModal && (
                <div
                    className="rg-pdf-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowLogsModal(false);
                    }}
                >
                    <div className="rg-pdf-viewer-window" style={{ maxWidth: "1050px", height: "85vh", display: "flex", flexDirection: "column" }}>
                        <header className="rg-pdf-toolbar" style={{ padding: "12px 18px", borderBottom: "1px solid rgba(234, 179, 8, 0.3)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "20px" }}>📜</span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: "16px", color: "var(--rg-gold)" }}>Case History & Audit Dossier Vault</h3>
                                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Chronological execution trace, agent challenges, rulings, and telemetry</span>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                {actionToast && (
                                    <span style={{
                                        fontSize: "11px",
                                        padding: "4px 8px",
                                        borderRadius: "4px",
                                        background: actionToast.type === "ok" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                                        color: actionToast.type === "ok" ? "#4ade80" : "#f87171",
                                        border: `1px solid ${actionToast.type === "ok" ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)"}`
                                    }}>
                                        {actionToast.text}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="rg-btn secondary"
                                    style={{
                                        padding: "4px 10px",
                                        fontSize: "12px",
                                        background: "rgba(239, 68, 68, 0.12)",
                                        color: "#fca5a5",
                                        border: "1px solid rgba(239, 68, 68, 0.35)",
                                    }}
                                    onClick={handleDeleteLogs}
                                    disabled={!selectedHistoryCaseId || isDeletingLogs}
                                    title="Delete execution trace logs for selected case"
                                >
                                    {isDeletingLogs ? "⏳ Deleting..." : "🗑️ Delete Logs"}
                                </button>
                                <button
                                    type="button"
                                    className="rg-btn secondary"
                                    style={{ padding: "4px 10px", fontSize: "12px" }}
                                    onClick={handleDownloadDossier}
                                    disabled={!historyDossier}
                                    title="Download complete audit record as JSON"
                                >
                                    💾 Download JSON
                                </button>
                                <button
                                    type="button"
                                    className="rg-btn secondary"
                                    style={{ padding: "4px 10px", fontSize: "12px" }}
                                    onClick={handleCopyDossier}
                                    disabled={!historyDossier}
                                    title="Copy dossier JSON to clipboard"
                                >
                                    📋 Copy JSON
                                </button>
                                <button
                                    type="button"
                                    className="rg-pdf-close-btn"
                                    onClick={() => setShowLogsModal(false)}
                                    aria-label="Close Audit Modal"
                                >
                                    ✕
                                </button>
                            </div>
                        </header>

                        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                            {/* Left Sidebar: List of Past Cases */}
                            <div style={{ width: "290px", borderRight: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", overflowY: "auto", padding: "10px" }}>
                                <h4 style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--rg-gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Case Dockets ({Array.isArray(pastCases) ? pastCases.length : 0})
                                </h4>
                                {(!Array.isArray(pastCases) || pastCases.length === 0) ? (
                                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", padding: "10px 0" }}>No saved cases yet</div>
                                ) : (
                                    pastCases.map((c) => (
                                        <div
                                            key={c.case_id}
                                            onClick={() => void handleSelectHistoryCase(c.case_id)}
                                            style={{
                                                padding: "10px",
                                                borderRadius: "6px",
                                                marginBottom: "6px",
                                                cursor: "pointer",
                                                background: selectedHistoryCaseId === c.case_id ? "rgba(234, 179, 8, 0.15)" : "rgba(255,255,255,0.03)",
                                                border: selectedHistoryCaseId === c.case_id ? "1px solid var(--rg-gold)" : "1px solid rgba(255,255,255,0.06)",
                                                position: "relative",
                                                transition: "background 0.2s, border-color 0.2s",
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                                <strong style={{ fontSize: "12px", color: "#f7ffeb" }}>{c.case_id}</strong>
                                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                    <span className={`rg-badge ${c.verification_status === "VERIFIED" ? "ok" : "warn"}`} style={{ fontSize: "10px", padding: "1px 5px" }}>
                                                        {c.verification_status}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void handleDeleteCase(c.case_id);
                                                        }}
                                                        style={{
                                                            background: "transparent",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            fontSize: "12px",
                                                            padding: "2px 4px",
                                                            color: "rgba(255, 255, 255, 0.4)",
                                                            borderRadius: "3px",
                                                            lineHeight: 1,
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.color = "#f87171";
                                                            e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)";
                                                            e.currentTarget.style.background = "transparent";
                                                        }}
                                                        title={`Delete case ${c.case_id} and all its logs`}
                                                        aria-label={`Delete case ${c.case_id}`}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {c.question}
                                            </div>
                                            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                                                As of: {c.as_of_date} · {c.pack_id}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Right Panel: Dossier Details & Logs */}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "rgba(10, 18, 14, 0.95)" }}>
                                {loadingDossier ? (
                                    <div style={{ padding: "40px", textAlign: "center", color: "var(--rg-gold)" }}>Loading audit telemetry…</div>
                                ) : !historyDossier ? (
                                    <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Select a case from the list to view its complete audit trace.</div>
                                ) : (
                                    <>
                                        {/* Dossier Tabs */}
                                        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}>
                                            {(["events", "summary", "claims", "json"] as const).map((tab) => (
                                                <button
                                                    key={tab}
                                                    type="button"
                                                    onClick={() => setDossierTab(tab)}
                                                    style={{
                                                        padding: "10px 18px",
                                                        border: "none",
                                                        background: dossierTab === tab ? "rgba(234, 179, 8, 0.15)" : "transparent",
                                                        color: dossierTab === tab ? "var(--rg-gold)" : "rgba(255,255,255,0.7)",
                                                        borderBottom: dossierTab === tab ? "2px solid var(--rg-gold)" : "2px solid transparent",
                                                        cursor: "pointer",
                                                        fontWeight: 600,
                                                        fontSize: "12px",
                                                        textTransform: "capitalize",
                                                    }}
                                                >
                                                    {tab === "events" ? `Execution Trace (${historyDossier.events_count ?? historyDossier.events?.length ?? 0})` :
                                                     tab === "claims" ? `Claims & Rulings (${(historyDossier.claims_count ?? 0) + (historyDossier.rulings_count ?? 0)})` :
                                                     tab === "summary" ? "Docket Overview" : "Raw JSON"}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Tab Content */}
                                        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                                            {dossierTab === "events" && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                                        <span style={{ fontSize: "12px", color: "var(--rg-gold)", fontWeight: 600 }}>
                                                            Trace Events Recorded: {historyDossier.events?.length ?? 0}
                                                        </span>
                                                        {historyDossier.events && historyDossier.events.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleDeleteLogs}
                                                                disabled={isDeletingLogs}
                                                                style={{
                                                                    background: "rgba(239, 68, 68, 0.15)",
                                                                    color: "#fca5a5",
                                                                    border: "1px solid rgba(239, 68, 68, 0.35)",
                                                                    padding: "4px 10px",
                                                                    borderRadius: "4px",
                                                                    fontSize: "11px",
                                                                    cursor: "pointer",
                                                                    fontWeight: 600,
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    gap: "4px",
                                                                }}
                                                                title="Clear all execution trace events for this case"
                                                            >
                                                                {isDeletingLogs ? "⏳ Deleting..." : "🗑️ Clear Trace Logs"}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {(!historyDossier.events || historyDossier.events.length === 0) ? (
                                                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", padding: "16px 0", textAlign: "center" }}>No trace events recorded for this case.</div>
                                                    ) : (
                                                        historyDossier.events.map((evt: any, idx: number) => {
                                                            const agentTone =
                                                                evt.agent === "thor" ? "#38bdf8" :
                                                                evt.agent === "loki" ? "#4ade80" :
                                                                evt.agent === "odin" ? "#eab308" :
                                                                evt.agent === "heimdall" ? "#f97316" : "#a855f7";
                                                            return (
                                                                <div
                                                                    key={evt.trace_id || idx}
                                                                    style={{
                                                                        padding: "8px 12px",
                                                                        borderRadius: "6px",
                                                                        background: "rgba(255,255,255,0.03)",
                                                                        border: "1px solid rgba(255,255,255,0.06)",
                                                                        fontSize: "12px",
                                                                        fontFamily: "var(--rg-mono)",
                                                                    }}
                                                                >
                                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                                            <span style={{ color: agentTone, fontWeight: "bold", textTransform: "uppercase", fontSize: "11px" }}>
                                                                                [{evt.agent || "system"}]
                                                                            </span>
                                                                            <span style={{ color: "#f7ffeb", fontWeight: 600 }}>{evt.event_type}</span>
                                                                        </div>
                                                                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                                                                            {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ""}
                                                                        </span>
                                                                    </div>
                                                                    <pre style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                                                        {JSON.stringify(evt.payload, null, 2)}
                                                                    </pre>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}

                                            {dossierTab === "summary" && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "14px", color: "#f7ffeb", fontSize: "13px" }}>
                                                    <div>
                                                        <strong style={{ color: "var(--rg-gold)" }}>Scenario Question:</strong>
                                                        <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.85)" }}>{historyDossier.question}</p>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: "var(--rg-gold)" }}>Heimdall Verification:</strong>
                                                        <p style={{ margin: "4px 0 0", color: historyDossier.verification_status === "VERIFIED" ? "#4ade80" : "#f87171" }}>
                                                            Status: <strong>{historyDossier.verification_status}</strong> · {historyDossier.verification_reason}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: "var(--rg-gold)" }}>Disruption Hypothesis:</strong>
                                                        <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.85)" }}>{historyDossier.event_hypothesis}</p>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: "var(--rg-gold)" }}>Target Parameters:</strong>
                                                        <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.85)" }}>
                                                            Countries: {historyDossier.countries?.join(", ") || "None"} · Sectors: {historyDossier.sectors?.join(", ") || "None"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {dossierTab === "claims" && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                                    <h4 style={{ margin: "0 0 4px", fontSize: "13px", color: "var(--rg-gold)" }}>Asserted Claims ({historyDossier.claims?.length ?? 0})</h4>
                                                    {historyDossier.claims?.map((c: any) => (
                                                        <div key={c.claim_id} style={{ padding: "8px", borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", fontSize: "12px" }}>
                                                            <div style={{ display: "flex", gap: "8px", fontWeight: "bold", color: c.agent === "thor" ? "#38bdf8" : "#4ade80" }}>
                                                                <span>{c.claim_id}</span>
                                                                <span>[{c.country} - {c.sector}]</span>
                                                                <span>{c.low_estimate}% to {c.high_estimate}%</span>
                                                            </div>
                                                            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.85)" }}>{c.claim}</p>
                                                        </div>
                                                    ))}
                                                    <h4 style={{ margin: "14px 0 4px", fontSize: "13px", color: "var(--rg-gold)" }}>Odin Rulings ({historyDossier.rulings?.length ?? 0})</h4>
                                                    {historyDossier.rulings?.map((r: any) => (
                                                        <div key={r.claim_id} style={{ padding: "8px", borderRadius: "6px", background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)", fontSize: "12px" }}>
                                                            <strong style={{ color: "var(--rg-gold)" }}>{r.claim_id} · {r.verdict}</strong>
                                                            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.85)" }}>{r.justification}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {dossierTab === "json" && (
                                                <pre style={{ margin: 0, fontSize: "11px", color: "#a5f3fc", background: "rgba(0,0,0,0.5)", padding: "12px", borderRadius: "6px", overflowX: "auto" }}>
                                                    {JSON.stringify(historyDossier, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}