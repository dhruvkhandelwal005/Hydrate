// import the type for inline style objects
import type { CSSProperties } from "react";
// import the page styles and the animation timeline
import "../landing/landing.css";
// import the cast: Heimdall, Thor, Loki, Odin
import { CHARACTERS } from "../landing/characters";

// the page receives one function: what to do when the user clicks the button
type Props = { onEnter: () => void };

// the landing page component
export default function Landing({ onEnter }: Props) {
    // return the page markup
    return (
        // full-screen wrapper
        <main className="nr-page">
            {/* decorative border frame */}
            <div className="nr-frame" aria-hidden="true" />
            {/* flash layer for the gavel strike */}
            <div className="nr-flash" aria-hidden="true" />
            {/* title block, fades in at 3.4 seconds */}
            <section className="nr-hero">
                {/* small line above the title */}
                <p className="nr-eyebrow">Supply Chain Disruption Impact Analyzer</p>
                {/* main title */}
                <h1 className="nr-title">Trial of the Nine Realms</h1>
                {/* tagline */}
                <p className="nr-tag">Four agents argue. One judge rules.</p>
                {/* button that opens the app */}
                <button className="nr-cta" onClick={onEnter}>Open a case</button>
            </section>
            {/* the stage where the four characters appear */}
            <ul className="nr-stage">
                {/* electric arc between Thor and Loki */}
                <li className="nr-spark" aria-hidden="true">
                    {/* jagged lightning line, stretched to the width of the stage */}
                    <svg viewBox="0 0 200 40" preserveAspectRatio="none" width="100%" height="100%">
                        {/* the zigzag path */}
                        <polyline points="0,20 28,6 52,30 78,10 104,32 130,8 156,28 182,12 200,20" fill="none" stroke="#b6e23a" strokeWidth="3" strokeLinejoin="round" />
                    </svg>
                </li>
                {/* loop over the cast, positions and delays come from the data */}
                {CHARACTERS.map(({ key, name, role, Art, photo, dx, dy, delay, flip }) => (
                    // one character, CSS variables feed the entrance animation
                    <li key={key} className={`nr-char nr-${key}${flip ? " nr-flip" : ""}`} style={{ "--dx": dx, "--dy": dy, "--delay": delay } as CSSProperties}>
                        {/* round badge: real photo when given, drawn avatar otherwise */}
                        <div className="nr-art">{photo ? <img src={photo} alt={name} /> : <Art />}</div>
                        {/* character name */}
                        <div className="nr-name">{name}</div>
                        {/* character role */}
                        <div className="nr-role">{role}</div>
                        {/* only Odin gets the verdict stamp */}
                        {key === "odin" && <div className="nr-stamp">The ruling is final</div>}
                    </li>
                ))}
            </ul>
        </main>
    );
}