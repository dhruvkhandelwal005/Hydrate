import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "../landing/landing.css";
import { Boundary } from "../landing/Boundary";

type Props = { onEnter: () => void };

const Arena = lazy(() => import("../landing/Arena"));

export default function Landing({ onEnter }: Props) {
    const reduce = !!useReducedMotion();
    const [ruled, setRuled] = useState(false);
    const [assetsReady, setAssetsReady] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const markAssetsReady = useCallback(() => setAssetsReady(true), []);

    useEffect(() => {
        if (!transitioning) return;
        const timer = window.setTimeout(onEnter, reduce ? 0 : 1350);
        return () => window.clearTimeout(timer);
    }, [onEnter, reduce, transitioning]);

    const beginTransition = () => setTransitioning(true);

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
                        <Arena
                            reduce={reduce}
                            onRuling={() => setRuled(true)}
                            onEnter={beginTransition}
                            onAssetsReady={markAssetsReady}
                        />
                    </Suspense>
                </Boundary>
            </motion.div>

            {assetsReady && (
                <div className="nr-cta-stage">
                    <motion.button
                        type="button"
                        className="nr-continue"
                        onClick={beginTransition}
                        disabled={transitioning}
                        aria-label="Continue to create a new case"
                        initial={{ opacity: 0, y: 18, rotateX: -24 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        whileHover={reduce ? undefined : { y: -4, rotateX: 8, scale: 1.035 }}
                        whileTap={reduce ? undefined : { y: 3, rotateX: -8, scale: 0.98 }}
                        transition={{ duration: 0.65, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                        <svg className="nr-continue-cloud" viewBox="0 0 64 44" aria-hidden="true">
                            <path d="M17 36h30a11 11 0 0 0 1-22 16 16 0 0 0-30-2A12 12 0 0 0 17 36Z" />
                            <path className="nr-cloud-glow" d="M21 29h24" />
                        </svg>
                        <span className="nr-continue-label">Continue</span>
                        <svg className="nr-continue-bolt" viewBox="0 0 24 36" aria-hidden="true">
                            <path d="M14 1 3 20h8l-2 15 12-21h-8z" />
                        </svg>
                        <span className="nr-continue-caption">Begin your case</span>
                    </motion.button>
                </div>
            )}

            {ruled && !reduce && (
                <motion.div
                    className="nr-flash"
                    aria-hidden="true"
                    initial={{ opacity: 0.85 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                />
            )}

            {transitioning && !reduce && (
                <motion.div
                    className="nr-storm-gate"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.svg
                        className="nr-storm-cloud nr-storm-cloud-left"
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="none"
                        initial={{ x: "-105%", rotateY: 24, scale: 0.92 }}
                        animate={{ x: "0%", rotateY: 0, scale: 1 }}
                        transition={{ duration: 1.02, ease: [0.68, 0, 0.18, 1] }}
                    >
                        <path d="M0 0h760c-80 80-80 135-5 190-120 70-110 130-15 190-105 70-115 140-10 200-105 70-100 135-15 200-75 70-60 145 25 220H0z" />
                    </motion.svg>
                    <motion.svg
                        className="nr-storm-cloud nr-storm-cloud-right"
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="none"
                        initial={{ x: "105%", rotateY: -24, scale: 0.92 }}
                        animate={{ x: "0%", rotateY: 0, scale: 1 }}
                        transition={{ duration: 1.02, ease: [0.68, 0, 0.18, 1] }}
                    >
                        <path d="M1000 0H240c80 80 80 135 5 190 120 70 110 130 15 190 105 70 115 140 10 200 105 70 100 135 15 200 75 70 60 145-25 220h740z" />
                    </motion.svg>
                    <motion.div
                        className="nr-storm-whiteout"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.24, delay: 0.92, ease: "easeOut" }}
                    />
                    <motion.svg
                        className="nr-storm-bolt"
                        viewBox="0 0 100 180"
                        aria-hidden="true"
                        initial={{ opacity: 0, pathLength: 0, scale: 0.72, y: -24 }}
                        animate={{ opacity: [0, 1, 0.85], pathLength: 1, scale: [0.72, 1.08, 1], y: 0 }}
                        transition={{ duration: 0.5, delay: 0.38, ease: "easeOut" }}
                    >
                        <motion.path d="M60 0 18 93h30l-8 87 45-111H54z" />
                    </motion.svg>
                    <motion.div
                        className="nr-storm-flash"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.85, 0] }}
                        transition={{ duration: 0.58, delay: 0.35 }}
                    />
                </motion.div>
            )}

        </main>
    );
}