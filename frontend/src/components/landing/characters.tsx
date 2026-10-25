// import the types for what drawing functions return and accept
import type { ReactElement, ReactNode } from "react";

// bright yellow used for armor and highlights
const GOLD = "#f2d230";
// lime green used for lightning and magic
const LIME = "#b6e23a";
// very dark green used for outlines and pupils
const DARK = "#07200f";
// skin tone shared by all four faces
const SKIN = "#e0b48a";
// shoulders and chest shape shared by all four busts
const BODY_D = "M8 180 C12 140 40 128 80 126 C120 128 148 140 152 180 Z";
// side-view head shape: nose points to the right, so every figure faces right
const HEAD_D = "M30 40 C30 22 46 14 60 18 C74 22 78 34 76 42 L82 50 L76 54 L78 62 C76 72 64 78 52 76 C38 74 30 58 30 40 Z";

// props that every bust takes: body color, a label, and four drawing layers
type BustProps = { label: string; body: string; behind?: ReactNode; local?: ReactNode; front?: ReactNode };

// one reusable bust: layers go behind the body, on the head, or in front of everything
function Bust({ label, body, behind, local, front }: BustProps): ReactElement {
    // return one SVG portrait on a 160 by 180 grid
    return (
        <svg viewBox="0 0 160 180" role="img" aria-label={label}>
            {/* layer behind the body, for capes and rainbows */}
            {behind}
            {/* shoulders and chest */}
            <path d={BODY_D} fill={body} />
            {/* neck */}
            <rect x="66" y="96" width="26" height="36" fill={SKIN} />
            {/* head group: shifted so head sits above the neck */}
            <g transform="translate(30 30)">
                {/* the face in side view */}
                <path d={HEAD_D} fill={SKIN} />
                {/* hair, beard, helmet and eye of this character */}
                {local}
            </g>
            {/* layer in front of everything, for weapons */}
            {front}
        </svg>
    );
}

// Thor: blond, bearded, red cape, hammer and lightning
function Thor(): ReactElement {
    // return the portrait with Thor's parts
    return (
        <Bust label="Thor" body="#3b4a5a"
            behind={<path d="M0 180 C4 138 30 120 62 120 L62 180 Z" fill="#8b1e1e" />}
            local={<>
                {/* long blond hair */}
                <path d="M28 44 C24 14 50 6 66 14 C76 18 80 26 78 34 C62 22 44 30 42 54 L40 100 C30 84 26 64 28 44 Z" fill="#e8c34a" />
                {/* blond beard */}
                <path d="M54 62 C58 82 74 86 80 64 L78 58 C70 68 60 68 54 62 Z" fill="#d4a93a" />
                {/* blue eye */}
                <circle cx="66" cy="40" r="3" fill="#6fc4ff" />
            </>}
            front={<>
                {/* hammer handle */}
                <rect x="118" y="112" width="6" height="64" fill="#8a5a2b" />
                {/* hammer head */}
                <rect x="102" y="100" width="38" height="20" rx="3" fill="#b8c0c8" />
                {/* lightning crackling beside the head */}
                <path d="M122 22 L112 46 H122 L114 68" fill="none" stroke={LIME} strokeWidth="3" strokeLinejoin="round" />
            </>}
        />
    );
}

// Loki: slim, black hair, gold horned helmet, green cloak, smirk
function Loki(): ReactElement {
    // return the portrait with Loki's parts
    return (
        <Bust label="Loki" body="#1d6a31"
            local={<>
                {/* slicked black hair */}
                <path d="M28 44 C26 18 46 10 62 16 C70 20 74 26 72 32 C58 26 44 32 42 56 L38 84 C28 70 26 58 28 44 Z" fill="#14181c" />
                {/* back horn of the helmet */}
                <path d="M40 22 C26 12 22 -6 34 -14 C32 0 40 8 50 16 Z" fill={GOLD} />
                {/* front horn of the helmet */}
                <path d="M60 16 C56 2 66 -10 78 -12 C72 0 74 8 74 22 Z" fill={GOLD} />
                {/* gold helmet band */}
                <path d="M30 32 C40 18 62 14 76 28" fill="none" stroke={GOLD} strokeWidth="5" />
                {/* green mischievous eye */}
                <circle cx="66" cy="40" r="3" fill="#7aff9a" />
                {/* smirk */}
                <path d="M68 64 Q74 67 79 61" fill="none" stroke={DARK} strokeWidth="2" strokeLinecap="round" />
            </>}
            front={
                // gold clasp on the cloak
                <circle cx="80" cy="150" r="7" fill={GOLD} />
            }
        />
    );
}

// Odin: grey beard, wide hat, eyepatch, cloak, and the gavel of final judgement
function Odin(): ReactElement {
    // return the portrait with Odin's parts
    return (
        <Bust label="Odin" body="#4a5568"
            local={<>
                {/* long grey hair at the back */}
                <path d="M30 40 L44 58 L40 96 C30 80 26 60 30 40 Z" fill="#cfd4da" />
                {/* long white beard */}
                <path d="M50 60 C46 100 70 126 82 70 L80 62 C70 70 58 68 50 60 Z" fill="#eef0f2" />
                {/* wide dark-blue hat crown */}
                <path d="M30 34 C30 8 62 2 72 20 L74 34 Z" fill="#223a63" />
                {/* hat brim */}
                <path d="M14 36 Q50 22 92 36 Q50 42 14 36 Z" fill="#223a63" />
                {/* eyepatch strap */}
                <path d="M32 40 L70 38" stroke={DARK} strokeWidth="3" />
                {/* eyepatch */}
                <circle cx="66" cy="41" r="5" fill={DARK} />
            </>}
            front={
                // the gavel group swings down at 2.8 seconds
                <g className="nr-gavel">
                    {/* gavel handle */}
                    <rect x="110" y="104" width="7" height="60" rx="2" fill="#8a5a2b" transform="rotate(25 113 164)" />
                    {/* gavel head */}
                    <rect x="96" y="94" width="40" height="20" rx="3" fill={GOLD} stroke={DARK} strokeWidth="2" transform="rotate(25 113 104)" />
                </g>
            }
        />
    );
}

// Heimdall: white hair, gold helmet, golden eyes, Bifrost behind him, his horn
function Heimdall(): ReactElement {
    // return the portrait with Heimdall's parts
    return (
        <Bust label="Heimdall" body="#cfc9a8"
            behind={<>
                {/* outer rainbow bridge arc */}
                <path d="M6 150 A74 74 0 0 1 154 150" fill="none" stroke={LIME} strokeWidth="5" />
                {/* middle arc */}
                <path d="M16 150 A64 64 0 0 1 144 150" fill="none" stroke={GOLD} strokeWidth="5" />
                {/* inner arc */}
                <path d="M26 150 A54 54 0 0 1 134 150" fill="none" stroke="#7ad6a0" strokeWidth="5" />
            </>}
            local={<>
                {/* white hair at the back */}
                <path d="M28 40 L26 72 C34 68 38 56 40 44 Z" fill="#f4f4f0" />
                {/* gold helmet */}
                <path d="M28 40 C26 14 48 6 64 12 C76 16 80 26 78 36 Z" fill={GOLD} stroke={DARK} strokeWidth="2" />
                {/* golden glowing eye */}
                <circle cx="66" cy="42" r="3" fill="#ffe27a" />
            </>}
            front={
                // the horn Gjallarhorn raised to his lips
                <path d="M104 98 C118 90 134 84 146 66 L154 72 C146 96 126 112 104 98 Z" fill={GOLD} stroke={DARK} strokeWidth="2" />
            }
        />
    );
}

// what the page needs for each character
export type Character = {
    // short id used as the React key and CSS class
    key: string;
    // display name
    name: string;
    // one-line role
    role: string;
    // the drawn avatar
    Art: () => ReactElement;
    // optional real photo path, for example "/characters/thor.png" (put the file in frontend/public/characters)
    photo?: string;
    // start offset sideways before sliding in
    dx: string;
    // start offset up or down before sliding in
    dy: string;
    // seconds to wait before this character appears
    delay: string;
    // mirror the picture so the figure faces left
    flip?: boolean;
};

// the cast: Heimdall opens, Thor and Loki face each other, Odin rules last
export const CHARACTERS: Character[] = [
    // Heimdall rises first at the gate, centre bottom
    { key: "heimdall", name: "Heimdall", role: "The Gatekeeper", Art: Heimdall, dx: "0px", dy: "40px", delay: "0.2s" },
    // Thor slides in from the left, already facing right
    { key: "thor", name: "Thor", role: "The Alarm", Art: Thor, dx: "-70px", dy: "0px", delay: "0.8s" },
    // Loki slides in from the right, mirrored to face left, toward Thor
    { key: "loki", name: "Loki", role: "The Trickster", Art: Loki, dx: "70px", dy: "0px", delay: "0.8s", flip: true },
    // Odin descends from above last, then strikes the gavel
    { key: "odin", name: "Odin", role: "The Allfather", Art: Odin, dx: "0px", dy: "-90px", delay: "2.2s" },
];