import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type PointerEvent,
} from "react";

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
const RUNE_FONT = '"Segoe UI Symbol","Noto Sans Runic","Apple Symbols",serif';

export const prefersReduced = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* RuneField: drifting runes and an occasional faint lightning strike  */
/* ------------------------------------------------------------------ */

type Glyph = { x: number; y: number; s: number; v: number; a: number; r: string; ph: number };
type Bolt = { pts: [number, number][]; born: number };

export function RuneField() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const reduced = prefersReduced();
        let w = 0;
        let h = 0;
        let raf = 0;
        let last = performance.now();
        let nextBolt = last + 6000 + Math.random() * 6000;
        let bolt: Bolt | null = null;
        let glyphs: Glyph[] = [];

        const rune = () => RUNES[Math.floor(Math.random() * RUNES.length)];
        const make = (): Glyph => ({
            x: Math.random() * w,
            y: Math.random() * h,
            s: 16 + Math.random() * 28,
            v: 6 + Math.random() * 14,
            a: 0.06 + Math.random() * 0.12,
            r: rune(),
            ph: Math.random() * 6.28,
        });

        const makeBolt = (now: number): Bolt => {
            let x = w * (0.15 + Math.random() * 0.7);
            let y = 0;
            const pts: [number, number][] = [[x, y]];
            const end = h * (0.45 + Math.random() * 0.3);
            while (y < end) {
                y += 24 + Math.random() * 40;
                x += (Math.random() - 0.5) * 70;
                pts.push([x, y]);
            }
            return { pts, born: now };
        };

        const draw = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            ctx.clearRect(0, 0, w, h);

            for (const g of glyphs) {
                g.y -= g.v * dt;
                g.ph += dt;
                if (g.y < -40) {
                    g.y = h + 40;
                    g.x = Math.random() * w;
                    g.r = rune();
                }
                const tw = 0.6 + 0.4 * Math.sin(g.ph * 1.3);
                ctx.font = `${g.s}px ${RUNE_FONT}`;
                ctx.fillStyle = `rgba(216,222,74,${g.a * tw})`;
                ctx.fillText(g.r, g.x + Math.sin(g.ph * 0.5) * 8, g.y);
            }

            if (!reduced) {
                if (!bolt && now > nextBolt) {
                    bolt = makeBolt(now);
                    nextBolt = now + 9000 + Math.random() * 8000;
                }
                if (bolt) {
                    const age = (now - bolt.born) / 600;
                    if (age >= 1) {
                        bolt = null;
                    } else {
                        const flick = age < 0.2 ? 1 : age < 0.3 ? 0.3 : 0.8;
                        ctx.save();
                        ctx.strokeStyle = `rgba(230,240,120,${0.35 * (1 - age) * flick})`;
                        ctx.shadowColor = "rgba(216,222,74,0.9)";
                        ctx.shadowBlur = 14;
                        ctx.lineWidth = 1.6;
                        ctx.beginPath();
                        bolt.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                        ctx.stroke();
                        ctx.restore();
                    }
                }
                raf = requestAnimationFrame(draw);
            }
        };

        const resize = () => {
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = Math.round(Math.min(60, (w * h) / 30000));
            glyphs = Array.from({ length: n }, make);
            if (reduced) draw(performance.now());
        };

        resize();
        window.addEventListener("resize", resize);
        if (!reduced) raf = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(raf);
        };
    }, []);

    return <canvas ref={ref} className="rg-canvas" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Spot: panel with a gold glow that follows the pointer               */
/* ------------------------------------------------------------------ */

export function Spot({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
    const onMove = (e: PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    return (
        <section className={className} onPointerMove={onMove} {...rest}>
            {children}
        </section>
    );
}

/* ------------------------------------------------------------------ */
/* CountUp                                                             */
/* ------------------------------------------------------------------ */

export function CountUp({ value }: { value: number }) {
    const [shown, setShown] = useState(0);
    const from = useRef(0);

    useEffect(() => {
        if (prefersReduced()) {
            setShown(value);
            from.current = value;
            return;
        }
        const a = from.current;
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / 700);
            const eased = 1 - Math.pow(1 - t, 3);
            const v = Math.round(a + (value - a) * eased);
            setShown(v);
            from.current = v;
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);

    return <>{shown}</>;
}

/* ------------------------------------------------------------------ */
/* RealmRing: nine nodes light up as a pack is ingested                */
/* ------------------------------------------------------------------ */

const NODE_RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺ";
const RING_PTS = Array.from({ length: 9 }, (_, i) => {
    const a = ((-90 + i * 40) * Math.PI) / 180;
    return { x: 100 + 72 * Math.cos(a), y: 100 + 72 * Math.sin(a) };
});
const RING_PATH =
    RING_PTS.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

export function RealmRing({
    progress,
    tone,
}: {
    progress: number; // 0..1
    tone: "active" | "ready" | "failed";
}) {
    const p = tone === "ready" ? 1 : Math.max(0, Math.min(1, progress));
    const lit = tone === "ready" ? 9 : Math.floor(p * 9);
    const center =
        tone === "ready" ? "Ready" : tone === "failed" ? "Failed" : `${Math.round(p * 100)}%`;

    return (
        <svg
            className={`rg-ring ${tone}`}
            viewBox="0 0 200 200"
            role="img"
            aria-label={`Ingestion ${center}`}
        >
            <circle className="orbit" cx="100" cy="100" r="94" />
            <path className="poly-bg" d={RING_PATH} />
            <path
                className="poly"
                d={RING_PATH}
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={100 - p * 100}
            />
            {RING_PTS.map((pt, i) => (
                <g
                    key={i}
                    className={`node${i < lit ? " lit" : ""}${tone === "active" && i === lit ? " next" : ""}`}
                >
                    <circle cx={pt.x} cy={pt.y} r="13" />
                    <text x={pt.x} y={pt.y + 1}>
                        {NODE_RUNES[i]}
                    </text>
                </g>
            ))}
            <text className="pct" x="100" y="98">
                {center}
            </text>
            <text className="sub" x="100" y="120">
                nine realms
            </text>
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* ClockGate: shows the as-of firewall sealing later documents         */
/* ------------------------------------------------------------------ */

export function ClockGate({ asOf }: { asOf: string }) {
    const cut = asOf ? "62%" : "100%";
    return (
        <div className="rg-clock" style={{ "--cut": cut } as CSSProperties}>
            <div className="track" aria-hidden="true">
                <div className="ok" />
                <div className="sealed" />
                <div className="cut" />
            </div>
            <div className="labels">
                <span>Admissible</span>
                <span>{asOf ? `Sealed after ${asOf}` : "Pick an as-of date"}</span>
            </div>
            <p className="rg-hint">
                The cutoff is enforced in the search index. Later documents never reach an agent.
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* AgentPath: the four agents, Thor and Loki side by side              */
/* ------------------------------------------------------------------ */

function Agent({
    glyph,
    name,
    role,
    delay,
    wide,
}: {
    glyph: string;
    name: string;
    role: string;
    delay: string;
    wide?: boolean;
}) {
    return (
        <div
            className={`rg-agent${wide ? " wide" : ""}`}
            style={{ "--d": delay } as CSSProperties}
        >
            <span className="glyph" aria-hidden="true">
                {glyph}
            </span>
            <span>
                <b>{name}</b>
                <span className="role">{role}</span>
            </span>
        </div>
    );
}

export function AgentPath() {
    return (
        <div className="rg-agents">
            <Agent wide glyph="ᚺ" name="Heimdall" role="Checks the event is real" delay="0s" />
            <div className="rg-conn" aria-hidden="true">
                <i />
            </div>
            <div className="rg-pair">
                <Agent glyph="ᚦ" name="Thor" role="Argues exposure is high" delay="1.5s" />
                <Agent glyph="ᛚ" name="Loki" role="Argues exposure is limited" delay="1.5s" />
                <svg className="rg-bolt" viewBox="0 0 26 40" aria-hidden="true">
                    <polygon points="15,0 3,22 12,22 8,40 23,16 14,16 19,0" />
                </svg>
            </div>
            <div className="rg-conn" aria-hidden="true">
                <i />
            </div>
            <Agent wide glyph="ᛟ" name="Odin" role="Rules on every claim" delay="3s" />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* GateOverlay: lightning strike shown when a trial starts             */
/* ------------------------------------------------------------------ */

export function GateOverlay() {
    return (
        <div className="rg-gate" role="status" aria-live="polite">
            <svg viewBox="0 0 120 180" width="120" height="180" aria-hidden="true">
                <path d="M80 0 L50 80 L75 80 L40 170 L100 70 L72 70 L100 0" />
            </svg>
            <p>The court is in session</p>
        </div>
    );
}