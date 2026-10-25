import { lazy, Suspense, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "../landing/landing.css";
import { Boundary } from "../landing/Boundary";

type Props = { onEnter: () => void };

const Arena = lazy(() => import("../landing/Arena"));

export default function Landing({ onEnter }: Props) {
    const reduce = !!useReducedMotion();
    const [ruled, setRuled] = useState(false);

    return (
        <main className="nr-page">
            <div className="nr-rays" aria-hidden="true" />
            <div className="nr-vignette" aria-hidden="true" />
            <div className="nr-frame" aria-hidden="true" />

            <svg className="nr-bg-bolt nr-bg-bolt-l" viewBox="0 0 60 400" aria-hidden="true">
                <path d="M40 0 L18 120 L36 124 L8 260 L28 264 L2 400" />
            </svg>
            <svg className="nr-bg-bolt nr-bg-bolt-r" viewBox="0 0 60 400" aria-hidden="true">
                <path d="M20 0 L42 110 L24 116 L52 250 L32 256 L58 400" />
            </svg>

            <motion.div
                className="nr-canvas"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                <Boundary fallback={null}>
                    <Suspense fallback={null}>
                        <Arena reduce={reduce} onRuling={() => setRuled(true)} onEnter={onEnter} />
                    </Suspense>
                </Boundary>
            </motion.div>

            {ruled && !reduce && (
                <motion.div
                    className="nr-flash"
                    aria-hidden="true"
                    initial={{ opacity: 0.85 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                />
            )}

            <button type="button" className="nr-sr-enter" onClick={onEnter}>
                Enter the trial
            </button>
        </main>
    );
}