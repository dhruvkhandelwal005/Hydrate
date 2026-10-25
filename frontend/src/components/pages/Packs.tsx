import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { DocStatus, PackState, PackStatus } from "../../types/api";
import { CountUp, RealmRing, Spot } from "../ui/Fx";

const STATE_LABEL: Record<PackState, string> = {
    PENDING: "Queued",
    INGESTING: "Ingesting",
    READY: "Ready",
    FAILED: "Failed",
};

const STATE_TONE: Record<PackState, string> = {
    PENDING: "neutral",
    INGESTING: "warn",
    READY: "ok",
    FAILED: "bad",
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

export default function Packs() {
    const [packs, setPacks] = useState<PackStatus[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<PackStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [onlyProblems, setOnlyProblems] = useState(false);

    const refreshList = useCallback(async () => {
        try {
            setPacks(await api.listPacks());
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    useEffect(() => {
        void refreshList();
    }, [refreshList]);

    // poll the list while any pack is still ingesting
    const anyActive = packs.some((p) => isActive(p.state));
    useEffect(() => {
        if (!anyActive) return;
        const t = window.setInterval(() => void refreshList(), 2000);
        return () => window.clearInterval(t);
    }, [anyActive, refreshList]);

    // load selected pack detail, poll while active
    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        let timer: number | undefined;

        const load = async () => {
            try {
                const d = await api.getPackStatus(selectedId);
                if (cancelled) return;
                setDetail(d);
                if (isActive(d.state)) timer = window.setTimeout(load, 2000);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        };
        void load();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [selectedId]);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        if (!file.name.toLowerCase().endsWith(".zip")) {
            setError("Upload a .zip event pack.");
            return;
        }
        setUploading(true);
        try {
            const { pack_id } = await api.ingestPack(file);
            await refreshList();
            setSelectedId(pack_id);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const files = useMemo(() => {
        const all = detail?.files ?? [];
        return onlyProblems ? all.filter((f) => f.status !== "VALID") : all;
    }, [detail, onlyProblems]);

    const stats = useMemo(() => {
        if (!detail) return null;
        const c = detail.counts;
        return {
            valid: c.VALID ?? 0,
            partial: c.PARTIAL ?? 0,
            problems:
                (c.EMPTY ?? 0) + (c.DAMAGED ?? 0) + (c.MALFORMED ?? 0) + (c.QUARANTINED ?? 0),
            duplicates: c.DUPLICATE ?? 0,
        };
    }, [detail]);

    const progress =
        detail && detail.total_files > 0 ? detail.processed_files / detail.total_files : 0;
    const ringTone = detail?.state === "READY" ? "ready" : detail?.state === "FAILED" ? "failed" : "active";

    const statCards: { label: string; value: number; tone: string }[] = stats
        ? [
            { label: "Valid files", value: stats.valid, tone: "ok" },
            { label: "Partial files", value: stats.partial, tone: "warn" },
            { label: "Quarantined or damaged", value: stats.problems, tone: "bad" },
            { label: "Duplicates", value: stats.duplicates, tone: "" },
            { label: "Trade tables", value: detail?.trade_tables ?? 0, tone: "" },
            { label: "Hash mismatches", value: detail?.hash_mismatches ?? 0, tone: "bad" },
        ]
        : [];

    return (
        <>
            <h1>Event packs</h1>
            <p className="rg-lede">
                Upload a Runemark event pack. Every PDF, DOCX and TXT file is parsed, damaged files are
                quarantined, and trade tables become rows you can cite.
            </p>

            {error && (
                <div className="rg-error" role="alert">
                    {error}
                </div>
            )}

            <div className="rg-grid">
                <section aria-label="Packs">
                    <label
                        className={`rg-drop${dragOver ? " over" : ""}${uploading ? " busy" : ""}`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            void upload(e.dataTransfer.files?.[0]);
                        }}
                    >
                        <input
                            type="file"
                            accept=".zip,application/zip"
                            disabled={uploading}
                            onChange={(e) => {
                                void upload(e.target.files?.[0]);
                                e.target.value = "";
                            }}
                        />
                        <span className="rune" aria-hidden="true">
                            ᛒ
                        </span>
                        <strong>{uploading ? "Crossing the bridge…" : "Drop a pack .zip here"}</strong>
                        or click to choose a file
                    </label>

                    {packs.length === 0 ? (
                        <div className="rg-empty">
                            <span className="rune" aria-hidden="true">
                                ᚠ
                            </span>
                            No packs yet. Upload one to begin.
                        </div>
                    ) : (
                        <ul className="rg-packlist">
                            {packs.map((p) => (
                                <li key={p.pack_id}>
                                    <button
                                        type="button"
                                        className={`rg-packitem${p.pack_id === selectedId ? " sel" : ""}`}
                                        onClick={() => setSelectedId(p.pack_id)}
                                        aria-pressed={p.pack_id === selectedId}
                                    >
                                        <span className="name">{p.name || p.pack_id}</span>
                                        <span className="meta">
                                            <span className={`rg-badge ${STATE_TONE[p.state]}`}>
                                                {STATE_LABEL[p.state]}
                                            </span>
                                            {p.total_files} files
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <Spot className="rg-panel" aria-label="Pack detail" aria-live="polite">
                    {!detail ? (
                        <div className="rg-empty">
                            <span className="rune" aria-hidden="true">
                                ᛟ
                            </span>
                            Select a pack to see its ingestion report.
                        </div>
                    ) : (
                        <div className="rg-detail" key={detail.pack_id}>
                            <div className="rg-row">
                                <h2 style={{ margin: 0 }}>{detail.name || detail.pack_id}</h2>
                                <span className={`rg-badge ${STATE_TONE[detail.state]}`}>
                                    {STATE_LABEL[detail.state]}
                                </span>
                            </div>

                            <div className="rg-detailtop">
                                <RealmRing progress={progress} tone={ringTone} />
                                <div className="rg-statgrid">
                                    {statCards.map((s) => (
                                        <div
                                            key={s.label}
                                            className={`rg-stat ${s.value > 0 ? s.tone : "zero"}`}
                                        >
                                            <b>
                                                <CountUp value={s.value} />
                                            </b>
                                            <span>{s.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {detail.pack_hash && (
                                <p className="rg-hint" style={{ marginTop: 0, marginBottom: 16 }}>
                                    Pack hash: <code>{detail.pack_hash.slice(0, 16)}…</code>
                                </p>
                            )}

                            <div className="rg-row">
                                <h2 style={{ margin: 0 }}>Files</h2>
                                <label className="rg-check">
                                    <input
                                        type="checkbox"
                                        checked={onlyProblems}
                                        onChange={(e) => setOnlyProblems(e.target.checked)}
                                    />
                                    Show only problem files
                                </label>
                            </div>

                            {files.length === 0 ? (
                                <div className="rg-empty">
                                    {onlyProblems ? "No problem files." : "No file report yet."}
                                </div>
                            ) : (
                                <div className="rg-tablewrap">
                                    <table className="rg-table">
                                        <thead>
                                            <tr>
                                                <th>File</th>
                                                <th>Doc ID</th>
                                                <th>Status</th>
                                                <th>Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {files.map((f) => (
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
                                                    <td>{f.reason ?? ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {detail.state === "READY" && (
                                <div className="rg-actions" style={{ marginTop: 22 }}>
                                    <Link to={`/cases/new?pack=${encodeURIComponent(detail.pack_id)}`}>
                                        <button type="button" className="rg-btn">
                                            Ask a question about this pack
                                        </button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </Spot>
            </div>
        </>
    );
}