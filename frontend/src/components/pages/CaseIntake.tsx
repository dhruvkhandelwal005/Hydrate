import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { CaseSummary, PackState, PackStatus } from "../../types/api";
import { AgentPath, ClockGate, GateOverlay, Spot, prefersReduced } from "../ui/Fx";

const STATE_LABEL: Record<PackState, string> = {
    PENDING: "queued",
    INGESTING: "ingesting",
    READY: "ready",
    FAILED: "failed",
};

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export default function CaseIntake() {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const [packs, setPacks] = useState<PackStatus[]>([]);
    const [packId, setPackId] = useState(params.get("pack") ?? "");
    const [question, setQuestion] = useState("");
    const [asOf, setAsOf] = useState("");

    const [created, setCreated] = useState<CaseSummary | null>(null);
    const [busy, setBusy] = useState<"create" | "run" | null>(null);
    const [error, setError] = useState<string | null>(null);

    // load packs, refresh while the selected one is still ingesting
    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;

        const load = async () => {
            try {
                const list = await api.listPacks();
                if (cancelled) return;
                setPacks(list);
                setPackId((cur) => {
                    if (cur && list.some((p) => p.pack_id === cur)) return cur;
                    return list.find((p) => p.state === "READY")?.pack_id ?? "";
                });
                const selected = list.find((p) => p.pack_id === packId);
                if (selected && (selected.state === "PENDING" || selected.state === "INGESTING")) {
                    timer = window.setTimeout(load, 2000);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        };
        void load();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [packId]);

    const pack = packs.find((p) => p.pack_id === packId);
    const packReady = pack?.state === "READY";
    const formValid = question.trim().length >= 10 && asOf !== "" && packReady;
    const locked = created !== null;

    const createCase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formValid) return;
        setError(null);
        setBusy("create");
        try {
            setCreated(
                await api.createCase({
                    question: question.trim(),
                    as_of_date: asOf,
                    pack_id: packId,
                }),
            );
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const startTrial = async () => {
        if (!created) return;
        setError(null);
        setBusy("run");
        try {
            // show the lightning strike for at least 1.3 s while the run starts
            await Promise.all([api.runCase(created.case_id), wait(prefersReduced() ? 0 : 1300)]);
            navigate(`/cases/${created.case_id}`);
        } catch (err) {
            setError((err as Error).message);
            setBusy(null);
        }
    };

    return (
        <>
            <h1>New case</h1>
            <p className="rg-lede">
                Ask how exposed a country is to a disruption. Heimdall checks the event is real before
                Thor and Loki argue it.
            </p>

            {error && (
                <div className="rg-error" role="alert">
                    {error}
                </div>
            )}

            <div className="rg-intake">
                <Spot className="rg-panel">
                    <form onSubmit={createCase}>
                        <div className="rg-field">
                            <label className="rg-label" htmlFor="pack">
                                Event pack
                            </label>
                            <select
                                id="pack"
                                className="rg-select"
                                value={packId}
                                disabled={locked}
                                onChange={(e) => setPackId(e.target.value)}
                            >
                                {packs.length === 0 && <option value="">No packs available</option>}
                                {packs.map((p) => (
                                    <option key={p.pack_id} value={p.pack_id}>
                                        {(p.name || p.pack_id) + " (" + STATE_LABEL[p.state] + ")"}
                                    </option>
                                ))}
                            </select>
                            {packs.length === 0 ? (
                                <p className="rg-hint">
                                    <Link to="/packs">Upload a pack</Link> first.
                                </p>
                            ) : pack && !packReady ? (
                                <p className="rg-hint">
                                    This pack is {STATE_LABEL[pack.state]}. Pick a ready pack or wait for ingestion.{" "}
                                    <Link to="/packs">View ingestion report</Link>
                                </p>
                            ) : null}
                        </div>

                        <div className="rg-field">
                            <label className="rg-label" htmlFor="question">
                                Question
                            </label>
                            <textarea
                                id="question"
                                className="rg-textarea"
                                value={question}
                                disabled={locked}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="How exposed are the countries named in the event to this disruption? Give a low and a high range for each sector."
                            />
                        </div>

                        <div className="rg-field">
                            <label className="rg-label" htmlFor="asof">
                                As-of date
                            </label>
                            <input
                                id="asof"
                                type="date"
                                className="rg-input"
                                value={asOf}
                                disabled={locked}
                                onChange={(e) => setAsOf(e.target.value)}
                            />
                            <p className="rg-hint">No document published after this date can be used.</p>
                        </div>

                        {!locked && (
                            <div className="rg-actions">
                                <button type="submit" className="rg-btn" disabled={!formValid || busy !== null}>
                                    {busy === "create" ? "Creating case…" : "Create case"}
                                </button>
                            </div>
                        )}

                        {created && (
                            <div className="rg-detected" aria-live="polite">
                                <h2>Case {created.case_id}</h2>

                                <dl className="rg-dl">
                                    <dt>As of</dt>
                                    <dd>{created.as_of_date}</dd>
                                    <dt>Pack</dt>
                                    <dd>{pack?.name || created.pack_id}</dd>
                                </dl>

                                <h2>Countries found</h2>
                                {created.countries.length === 0 ? (
                                    <p className="rg-hint" style={{ marginBottom: 18 }}>
                                        None detected in the question. Heimdall will look for them in the pack.
                                    </p>
                                ) : (
                                    <div className="rg-chips">
                                        {created.countries.map((c, i) => (
                                            <span key={c} className="rg-chip" style={{ "--i": i } as CSSProperties}>
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <h2>Sectors found</h2>
                                {created.sectors.length === 0 ? (
                                    <p className="rg-hint" style={{ marginBottom: 18 }}>
                                        None detected in the question. Heimdall will look for them in the pack.
                                    </p>
                                ) : (
                                    <div className="rg-chips">
                                        {created.sectors.map((s, i) => (
                                            <span key={s} className="rg-chip" style={{ "--i": i } as CSSProperties}>
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="rg-actions">
                                    <button
                                        type="button"
                                        className="rg-btn"
                                        onClick={startTrial}
                                        disabled={busy !== null}
                                    >
                                        {busy === "run" ? "Starting trial…" : "Start trial"}
                                    </button>
                                    <button
                                        type="button"
                                        className="rg-btn ghost"
                                        onClick={() => setCreated(null)}
                                        disabled={busy !== null}
                                    >
                                        Edit question
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>
                </Spot>

                <aside className="rg-aside" aria-label="How the trial works">
                    <Spot className="rg-panel">
                        <h2>The as-of cutoff</h2>
                        <ClockGate asOf={asOf} />
                    </Spot>
                    <Spot className="rg-panel">
                        <h2>Who hears your case</h2>
                        <AgentPath />
                    </Spot>
                </aside>
            </div>

            {busy === "run" && <GateOverlay />}
        </>
    );
}