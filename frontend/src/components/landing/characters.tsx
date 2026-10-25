import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import {
    AdditiveBlending,
    AnimationMixer,
    Box3,
    CanvasTexture,
    Group,
    Object3D,
    PointLight,
    Vector3,
    type AnimationAction,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Boundary } from "./Boundary";

/* ---------- palette (Ragnarok poster) ---------- */
const GOLD = "#f2e21a";
const LIME = "#c8d92b";
const SKIN = "#e0b48a";
const FACE = Math.PI;

/* ---------- shared timeline helpers ---------- */
export const RULING_AT = 3.15;
export type Director = { t: number; ruled: boolean; calm: number };
export type DirRef = MutableRefObject<Director>;
export type V3 = [number, number, number];
export type Kind = "heimdall" | "thor" | "loki" | "odin";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeBack = (x: number) => 1 + 2.1 * Math.pow(x - 1, 3) + 1.1 * Math.pow(x - 1, 2);

/* ---------- GLB config: drop files in public/models ---------- */
export type ModelCfg = { url: string; height: number; rotY?: number };
export const MODEL_FILES: Record<Kind, ModelCfg> = {
    heimdall: { url: "/models/heimdall.glb", height: 2.4 },
    thor: { url: "/models/thor.glb", height: 2.4 },
    loki: { url: "/models/loki.glb", height: 2.4 },
    odin: { url: "/models/odin.glb", height: 2.4 },
};

export type Character = { key: Kind; name: string; role: string };
export const CHARACTERS: Character[] = [
    { key: "heimdall", name: "Heimdall", role: "The Gatekeeper" },
    { key: "thor", name: "Thor", role: "The Alarm" },
    { key: "loki", name: "Loki", role: "The Trickster" },
    { key: "odin", name: "Odin", role: "The Allfather" },
];

function useGlbAvailable(url: string): boolean {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        let alive = true;
        fetch(url, { method: "HEAD" })
            .then((r) => {
                const type = r.headers.get("content-type") || "";
                // vite returns index.html for missing files, so reject html
                if (alive && r.ok && !type.includes("text/html")) setOk(true);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [url]);
    return ok;
}

/* ---------- real GLB model with its own animation clips ---------- */
function GlbModel({ cfg, kind, director }: { cfg: ModelCfg; kind: Kind; director: DirRef }) {
    const gltf = useLoader(GLTFLoader, cfg.url);
    const rig = useMemo(() => {
        const scene = gltf.scene;
        scene.scale.setScalar(1);
        scene.position.set(0, 0, 0);
        const box = new Box3().setFromObject(scene);
        const size = new Vector3();
        const mid = new Vector3();
        box.getSize(size);
        box.getCenter(mid);
        const s = size.y > 0 ? cfg.height / size.y : 1;
        scene.scale.setScalar(s);
        scene.position.set(-mid.x * s, -box.min.y * s, -mid.z * s);
        const holder = new Group();
        holder.rotation.y = cfg.rotY ?? 0;
        holder.add(scene);
        const mixer = new AnimationMixer(scene);
        const actions: Record<string, AnimationAction> = {};
        gltf.animations.forEach((c) => {
            actions[c.name] = mixer.clipAction(c);
        });
        return { holder, mixer, actions };
    }, [gltf, cfg]);
    const cur = useRef<AnimationAction | null>(null);

    useEffect(() => () => {
        rig.mixer.stopAllAction();
    }, [rig]);

    useFrame((_, dt) => {
        const names = Object.keys(rig.actions);
        if (!names.length) return;
        const find = (re: RegExp) => names.find((n) => re.test(n));
        const idle = find(/idle|stand|breath/i) ?? names[0];
        const d = director.current;
        let want = idle;
        if (!d.ruled && (kind === "thor" || kind === "loki")) {
            want = find(/attack|fight|strike|swing|taunt|cast|combat/i) ?? idle;
        }
        if (d.ruled && kind === "odin") want = find(/slam|strike|attack|point|command/i) ?? idle;
        const next = rig.actions[want];
        if (next !== cur.current) {
            next.reset().fadeIn(0.3).play();
            cur.current?.fadeOut(0.3);
            cur.current = next;
        }
        rig.mixer.update(dt);
    });

    return <primitive object={rig.holder} />;
}

/* ---------- procedural 3D humanoid (used when no GLB exists) ---------- */
type Look = { body: string; legs: string; gauntlet: string; cape?: string };
const LOOK: Record<Kind, Look> = {
    thor: { body: "#3b4a5a", legs: "#2a323b", gauntlet: "#aeb8c0", cape: "#8b1e1e" },
    loki: { body: "#1d6a31", legs: "#14301c", gauntlet: "#c9a227", cape: "#0f3d1c" },
    odin: { body: "#4a5568", legs: "#2b3340", gauntlet: "#c9a227", cape: "#2d3340" },
    heimdall: { body: "#cfc9a8", legs: "#8f8a6c", gauntlet: "#c9a227" },
};

const mat = (color: string, o: { m?: number; r?: number; e?: string; ei?: number } = {}) => (
    <meshStandardMaterial
        color={color}
        metalness={o.m ?? 0.15}
        roughness={o.r ?? 0.6}
        emissive={o.e ?? "#000000"}
        emissiveIntensity={o.ei ?? 0}
    />
);

function Humanoid({
    kind,
    director,
    handRef,
}: {
    kind: Kind;
    director: DirRef;
    handRef?: MutableRefObject<Object3D | null>;
}) {
    const R = useRef<Record<string, Object3D | null>>({});
    const set = (n: string) => (o: Object3D | null) => {
        R.current[n] = o;
    };
    const hammerLight = useRef<PointLight>(null);
    const P = LOOK[kind];

    useEffect(() => {
        if (handRef) handRef.current = R.current["hand1"] ?? null;
    }, [handRef]);

    useFrame(() => {
        const d = director.current;
        const t = d.t;
        const calm = d.calm;
        const fight = 1 - calm;
        const o = R.current;
        const rot = (n: string, x: number, y = 0, z = 0) => o[n]?.rotation.set(x, y, z);
        const br = Math.sin(t * 1.8);
        o.torso?.scale.set(1, 1 + br * 0.012, 1);

        const fighter = kind === "thor" || kind === "loki";
        const arrive = clamp((t - 0.8) / 1.0);
        const k = fighter ? fight * arrive : 0; // how engaged in the duel
        const w = fighter && t > 0.8 ? Math.sin(t * 9) * 0.55 * (1 - arrive) : 0; // walking in
        rot("leg-1", w + k * 0.28);
        rot("leg1", -w - k * 0.2);

        if (kind === "thor") {
            const sw = Math.sin(t * 4.2);
            rot("arm-1", lerp(0.08, -1.9 + sw * 0.45, k), 0, -0.2); // hammer arm
            rot("fore-1", lerp(0, -1.1 + sw * 0.35, k));
            rot("arm1", lerp(0.05, -1.5, k) + Math.sin(t * 3) * 0.08 * k, 0, 0.15); // beckons Loki
            rot("fore1", lerp(-0.1, -0.4, k));
            o.torso?.rotation.set(0.12 * k + br * 0.01, Math.sin(t * 2) * 0.12 * k, 0);
            rot("head", 0.18 * calm - 0.08 * k);
            rot("cape", 0.16 + Math.sin(t * 3.1) * 0.1 + 0.22 * k);
            if (hammerLight.current) hammerLight.current.intensity = 0.6 + (1.5 + Math.random() * 2.5) * k;
        }

        if (kind === "loki") {
            const sw = Math.sin(t * 3.4);
            const sw2 = Math.sin(t * 5.5);
            rot("arm1", lerp(0.05, -1.4 + sw * 0.1, k), 0, 0.22); // casting hand
            rot("fore1", lerp(0, -0.45, k));
            rot("arm-1", lerp(0.05, -0.9 + sw2 * 0.5, k), 0, -0.2); // dagger hand
            rot("fore-1", lerp(0, -1.0 + sw2 * 0.3, k));
            o.torso?.rotation.set(-0.06 * k, Math.sin(t * 1.7) * 0.1 * k, Math.sin(t * 2) * 0.04);
            rot("head", 0.18 * calm, 0, Math.sin(t * 2) * 0.12 * k);
            rot("cape", 0.16 + Math.sin(t * 2.7) * 0.1 + 0.2 * k);
            o.orbs?.scale.setScalar(0.2 + k * 0.8);
            for (let i = 0; i < 3; i += 1) {
                const a = t * 3.2 + i * 2.094;
                o[`orb${i}`]?.position.set(Math.cos(a) * 0.3, Math.sin(t * 2 + i) * 0.1, Math.sin(a) * 0.3);
            }
        }

        if (kind === "odin") {
            const raise = easeOut(clamp((t - 2.4) / 0.55));
            let ax = -0.45;
            let af = -0.3;
            if (t < 2.95) {
                ax = lerp(-0.45, -2.7, raise);
            } else if (t < RULING_AT) {
                const q = (t - 2.95) / (RULING_AT - 2.95);
                ax = lerp(-2.7, -1.0, q * q);
                af = lerp(-0.3, -0.4, q);
            } else {
                ax = lerp(-1.0, -0.7, calm);
                af = lerp(-0.4, -0.8, calm);
            }
            rot("arm1", ax, 0, 0.1); // gavel arm: lands on the bench at impact
            rot("fore1", af);
            rot("arm-1", -0.1, 0, -0.15); // staff arm
            rot("fore-1", -0.15);
            const nod = t >= RULING_AT ? Math.exp(-(t - RULING_AT) * 3) * 0.25 : 0;
            rot("head", nod);
            o.torso?.rotation.set(0.05 + br * 0.01, 0, 0);
            rot("cape", 0.1 + Math.sin(t * 1.5) * 0.04);
            const halo = o.halo;
            if (halo) {
                halo.visible = t > 2.4;
                halo.rotation.set(t * 0.6, t * 0.9, 0);
                const pop = t >= RULING_AT ? 0.18 * Math.exp(-(t - RULING_AT) * 2) : 0;
                halo.scale.setScalar(0.6 + 0.4 * easeOut(clamp((t - 2.5) / 0.8)) + pop);
            }
        }

        if (kind === "heimdall") {
            const s = clamp(Math.sin(t * 0.8) * 1.8);
            const kk = s * s * (3 - 2 * s); // horn blow cycle
            rot("arm1", lerp(0.05, -2.0, kk), 0, 0.1);
            rot("fore1", lerp(0, -1.5, kk));
            rot("arm-1", 0.05, 0, -0.12);
            rot("fore-1", -0.1);
            rot("head", -0.1 * kk);
        }
    });

    const handProp = (s: -1 | 1) => {
        if (kind === "thor" && s === -1) {
            return (
                <group rotation={[0, Math.PI / 2, 0]}>
                    <mesh position={[0, 0.12, 0]}>
                        <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
                        {mat("#5a3a1f", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0, 0.52, 0]}>
                        <boxGeometry args={[0.62, 0.3, 0.3]} />
                        {mat("#aeb8c0", { m: 0.9, r: 0.28 })}
                    </mesh>
                    {[-1, 1].map((q) => (
                        <mesh key={q} position={[q * 0.33, 0.52, 0]}>
                            <boxGeometry args={[0.06, 0.34, 0.34]} />
                            {mat("#5d6a73", { m: 0.9, r: 0.4 })}
                        </mesh>
                    ))}
                    {[-1, 1].map((q) => (
                        <mesh key={`r${q}`} position={[0, 0.52, q * 0.155]}>
                            <boxGeometry args={[0.3, 0.07, 0.01]} />
                            {mat(LIME, { e: LIME, ei: 1.6 })}
                        </mesh>
                    ))}
                    <pointLight ref={hammerLight} position={[0, 0.52, 0.3]} color={LIME} intensity={2} distance={4} />
                </group>
            );
        }
        if (kind === "loki" && s === -1) {
            return (
                <group>
                    <mesh position={[0, 0.3, 0]}>
                        <boxGeometry args={[0.05, 0.55, 0.015]} />
                        {mat("#dfe7ea", { m: 0.9, r: 0.2, e: "#7aff9a", ei: 0.35 })}
                    </mesh>
                    <mesh position={[0, 0.03, 0]}>
                        <boxGeometry args={[0.2, 0.04, 0.05]} />
                        {mat(GOLD, { m: 0.8, r: 0.3 })}
                    </mesh>
                </group>
            );
        }
        if (kind === "loki" && s === 1) {
            return (
                <group ref={set("orbs")} position={[0, 0.12, 0]}>
                    {[0, 1, 2].map((i) => (
                        <mesh key={i} ref={set(`orb${i}`)}>
                            <sphereGeometry args={[0.055, 10, 10]} />
                            <meshBasicMaterial color="#7aff9a" />
                        </mesh>
                    ))}
                    <pointLight color="#7aff9a" intensity={1.5} distance={3} />
                </group>
            );
        }
        if (kind === "odin" && s === 1) {
            return (
                <group>
                    {/* gavel: handle along hand z, head across x; lands flat on the bench at impact */}
                    <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.025, 0.025, 0.34, 8]} />
                        {mat("#8a5a2b", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0, 0, -0.1]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.09, 0.09, 0.3, 18]} />
                        {mat(GOLD, { m: 0.8, r: 0.3, e: GOLD, ei: 0.25 })}
                    </mesh>
                </group>
            );
        }
        if (kind === "odin" && s === -1) {
            return (
                <group>
                    <mesh position={[0, 0.3, 0]}>
                        <cylinderGeometry args={[0.03, 0.03, 2.6, 8]} />
                        {mat("#6b4a2a", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0, 1.78, 0]}>
                        <coneGeometry args={[0.07, 0.34, 8]} />
                        {mat(GOLD, { m: 0.9, r: 0.25, e: GOLD, ei: 0.4 })}
                    </mesh>
                </group>
            );
        }
        if (kind === "heimdall" && s === 1) {
            return (
                <group position={[0, 0.05, 0.08]} rotation={[0, Math.PI / 2, 0]}>
                    <mesh>
                        <torusGeometry args={[0.2, 0.055, 8, 20, Math.PI * 1.1]} />
                        {mat(GOLD, { m: 0.85, r: 0.25, e: GOLD, ei: 0.3 })}
                    </mesh>
                </group>
            );
        }
        return null;
    };

    const arm = (s: -1 | 1) => (
        <group key={s} ref={set(`arm${s}`)} position={[s * 0.5, 0.77, 0]}>
            <mesh position={[0, -0.3, 0]}>
                <capsuleGeometry args={[0.09, 0.4, 4, 10]} />
                {mat(P.body, { m: 0.4 })}
            </mesh>
            <group ref={set(`fore${s}`)} position={[0, -0.58, 0]}>
                <mesh position={[0, -0.27, 0]}>
                    <capsuleGeometry args={[0.08, 0.34, 4, 10]} />
                    {mat(P.gauntlet, { m: 0.6, r: 0.4 })}
                </mesh>
                <group ref={set(`hand${s}`)} position={[0, -0.56, 0]}>
                    <mesh>
                        <sphereGeometry args={[0.09, 12, 12]} />
                        {mat(SKIN)}
                    </mesh>
                    {handProp(s)}
                </group>
            </group>
        </group>
    );

    const eye =
        kind === "thor" ? "#6fc4ff" : kind === "loki" ? "#7aff9a" : kind === "heimdall" ? "#ffe27a" : "#dfe6ee";

    const headExtras = () => {
        if (kind === "thor") {
            return (
                <>
                    <mesh position={[0, 0.05, -0.03]} rotation={[-0.2, 0, 0]}>
                        <sphereGeometry args={[0.245, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                        {mat("#e8c34a", { r: 0.7 })}
                    </mesh>
                    <mesh position={[0, -0.12, -0.16]}>
                        <capsuleGeometry args={[0.15, 0.25, 4, 8]} />
                        {mat("#e8c34a", { r: 0.7 })}
                    </mesh>
                    <mesh position={[0, -0.17, 0.1]} scale={[1, 1.2, 0.7]}>
                        <sphereGeometry args={[0.13, 12, 12]} />
                        {mat("#d4a93a", { r: 0.8 })}
                    </mesh>
                </>
            );
        }
        if (kind === "loki") {
            return (
                <>
                    <mesh position={[0, 0.05, -0.03]} rotation={[-0.2, 0, 0]}>
                        <sphereGeometry args={[0.245, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                        {mat("#14181c", { r: 0.5 })}
                    </mesh>
                    <mesh position={[0, -0.1, -0.17]}>
                        <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
                        {mat("#14181c", { r: 0.5 })}
                    </mesh>
                    <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.2, 0.03, 8, 24]} />
                        {mat(GOLD, { m: 0.85, r: 0.25 })}
                    </mesh>
                    {[-1, 1].map((q) => (
                        <mesh key={q} position={[q * 0.17, 0.34, 0]} rotation={[0, 0, -q * 0.55]}>
                            <coneGeometry args={[0.045, 0.5, 8]} />
                            {mat(GOLD, { m: 0.85, r: 0.25, e: GOLD, ei: 0.2 })}
                        </mesh>
                    ))}
                </>
            );
        }
        if (kind === "odin") {
            return (
                <>
                    <mesh position={[0, -0.1, -0.15]}>
                        <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
                        {mat("#cfd4da")}
                    </mesh>
                    <mesh position={[0, -0.42, 0.1]} rotation={[Math.PI, 0, 0]}>
                        <coneGeometry args={[0.2, 0.75, 12]} />
                        {mat("#eef0f2", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0, 0.36, 0]} rotation={[0, 0, 0.08]}>
                        <coneGeometry args={[0.2, 0.4, 14]} />
                        {mat("#223a63", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0, 0.17, 0]}>
                        <cylinderGeometry args={[0.45, 0.45, 0.03, 28]} />
                        {mat("#223a63", { r: 0.8 })}
                    </mesh>
                    <mesh position={[0.08, 0.03, 0.2]}>
                        <sphereGeometry args={[0.055, 10, 10]} />
                        {mat("#07200f", { r: 0.9 })}
                    </mesh>
                    <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.21, 0.01, 6, 28]} />
                        {mat("#07200f", { r: 0.9 })}
                    </mesh>
                </>
            );
        }
        return (
            <>
                <mesh position={[0, -0.1, -0.16]}>
                    <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
                    {mat("#f4f4f0")}
                </mesh>
                <mesh position={[0, 0.04, -0.02]} rotation={[-0.15, 0, 0]}>
                    <sphereGeometry args={[0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
                    {mat(GOLD, { m: 0.9, r: 0.25, e: GOLD, ei: 0.2 })}
                </mesh>
            </>
        );
    };

    return (
        <group>
            {[-1, 1].map((s) => (
                <group key={s} ref={set(`leg${s}`)} position={[s * 0.17, 0.95, 0]}>
                    <mesh position={[0, -0.45, 0]}>
                        <capsuleGeometry args={[0.11, 0.62, 4, 10]} />
                        {mat(P.legs, { r: 0.75 })}
                    </mesh>
                    <mesh position={[0, -0.86, 0.06]}>
                        <boxGeometry args={[0.2, 0.14, 0.34]} />
                        {mat("#1b1b1b", { r: 0.8 })}
                    </mesh>
                </group>
            ))}

            <group ref={set("torso")} position={[0, 0.95, 0]}>
                <mesh position={[0, 0.45, 0]} scale={[1, 1, 0.62]}>
                    <cylinderGeometry args={[0.42, 0.3, 0.85, 16]} />
                    {mat(P.body, { m: 0.45, r: 0.45 })}
                </mesh>
                <mesh position={[0, 0.02, 0]} scale={[1, 1, 0.62]}>
                    <cylinderGeometry args={[0.31, 0.31, 0.1, 16]} />
                    {mat(GOLD, { m: 0.85, r: 0.3 })}
                </mesh>
                <mesh position={[0, 0.5, 0.27]}>
                    <sphereGeometry args={[0.06, 10, 10]} />
                    {mat(kind === "loki" ? GOLD : LIME, { e: kind === "loki" ? GOLD : LIME, ei: 1.2 })}
                </mesh>
                {[-1, 1].map((s) => (
                    <mesh key={s} position={[s * 0.46, 0.77, 0]}>
                        <sphereGeometry args={[0.17, 12, 12]} />
                        {mat(P.gauntlet, { m: 0.8, r: 0.3 })}
                    </mesh>
                ))}
                <mesh position={[0, 0.93, 0]}>
                    <cylinderGeometry args={[0.08, 0.09, 0.14, 10]} />
                    {mat(SKIN)}
                </mesh>

                <group ref={set("head")} position={[0, 1.15, 0]}>
                    <mesh scale={[0.9, 1.05, 1]}>
                        <sphereGeometry args={[0.22, 20, 16]} />
                        {mat(SKIN, { r: 0.7 })}
                    </mesh>
                    <mesh position={[0, -0.01, 0.22]}>
                        <boxGeometry args={[0.04, 0.07, 0.06]} />
                        {mat(SKIN, { r: 0.7 })}
                    </mesh>
                    {[-1, 1].map((s) => (
                        <mesh key={s} position={[s * 0.08, 0.03, 0.19]}>
                            <sphereGeometry args={[0.026, 8, 8]} />
                            {mat(eye, { e: eye, ei: 2 })}
                        </mesh>
                    ))}
                    {headExtras()}
                </group>

                {arm(-1)}
                {arm(1)}

                {P.cape && (
                    <group ref={set("cape")} position={[0, 0.86, -0.2]}>
                        <mesh position={[0, -0.75, -0.02]}>
                            <boxGeometry args={[kind === "loki" ? 0.95 : 0.9, 1.5, 0.04]} />
                            {mat(P.cape, { r: 0.85 })}
                        </mesh>
                    </group>
                )}
            </group>

            {kind === "odin" && (
                <group ref={set("halo")} position={[0, 2.15, -0.45]} visible={false}>
                    {[0, 1].map((i) => (
                        <mesh key={i} rotation={[i * 1.1, 0, i * 0.7]}>
                            <torusGeometry args={[0.72 + i * 0.12, 0.014, 8, 72]} />
                            <meshBasicMaterial color={GOLD} transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} />
                        </mesh>
                    ))}
                </group>
            )}
        </group>
    );
}

/* ---------- Actor: entrance, lunge, turn; swaps GLB in if present ---------- */
export type ActorProps = {
    kind: Kind;
    director: DirRef;
    home: V3;
    from: V3;
    delay: number;
    dur: number;
    rotY?: number;
    settleRotY?: number;
    scale?: number;
    overshoot?: boolean;
    handRef?: MutableRefObject<Object3D | null>;
    onClick?: () => void;
};

export function Actor(p: ActorProps) {
    const root = useRef<Group>(null);
    const modelRotation = useRef<Group>(null);
    const drag = useRef<{ pointerId: number | null; startX: number; lastX: number; moved: boolean } | null>(null);
    const manualYaw = useRef(FACE);
    const cfg = MODEL_FILES[p.kind];
    const hasGlb = useGlbAvailable(cfg.url);
    const name = CHARACTERS.find((character) => character.key === p.kind)?.name ?? p.kind;
    const nameOffsetX = p.kind === "thor" ? -0.65 : p.kind === "loki" ? 0.65 : 0;
    const nameTexture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 160;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create the character name label.");

        context.shadowColor = "rgba(0, 0, 0, 0.35)";
        context.shadowBlur = 12;
        context.shadowOffsetY = 5;
        context.beginPath();
        context.moveTo(128, 126);
        context.bezierCurveTo(75, 126, 48, 104, 54, 77);
        context.bezierCurveTo(56, 55, 76, 41, 101, 40);
        context.bezierCurveTo(111, 10, 145, 7, 165, 31);
        context.bezierCurveTo(187, 5, 225, 8, 243, 32);
        context.bezierCurveTo(275, 10, 310, 22, 316, 48);
        context.bezierCurveTo(355, 37, 390, 53, 391, 79);
        context.bezierCurveTo(417, 84, 431, 101, 420, 116);
        context.bezierCurveTo(410, 130, 385, 132, 360, 130);
        context.lineTo(128, 130);
        context.closePath();
        context.fillStyle = "#fffbe5";
        context.fill();
        context.shadowColor = "transparent";
        context.lineWidth = 6;
        context.strokeStyle = "#b9a83c";
        context.stroke();
        context.fillStyle = "#17351d";
        context.font = "bold 46px Georgia, serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(name, 256, 82, 330);

        return new CanvasTexture(canvas);
    }, [name]);

    useEffect(() => () => nameTexture.dispose(), [nameTexture]);

    useFrame(() => {
        const g = root.current;
        if (!g) return;
        const d = p.director.current;
        const t = d.t;
        const raw = clamp((t - p.delay) / p.dur);
        const e = p.overshoot ? easeBack(raw) : easeOut(raw);
        g.visible = t >= p.delay;
        g.position.set(
            lerp(p.from[0], p.home[0], e),
            lerp(p.from[1], p.home[1], e),
            lerp(p.from[2], p.home[2], e),
        );
        if (p.kind === "thor" || p.kind === "loki") {
            const dir = p.home[0] < 0 ? 1 : -1; // lunge toward the rival
            g.position.x += dir * (1 - d.calm) * clamp((t - 1.8) / 0.4) * (0.5 + 0.5 * Math.sin(t * 3.2)) * 0.4;
        }
        if (p.kind === "odin") g.position.y += d.calm * Math.sin(t * 1.4) * 0.03;
        g.rotation.y = lerp(p.rotY ?? 0, p.settleRotY ?? p.rotY ?? 0, d.calm);
    });

    const human = (
        <group rotation={[0, FACE, 0]}>
            <Humanoid kind={p.kind} director={p.director} handRef={p.handRef} />
        </group>
    );

    return (
        <group
            ref={root}
            scale={p.scale ?? 1}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const x = e.nativeEvent.clientX;
                drag.current = { pointerId: e.pointerId, startX: x, lastX: x, moved: false };
                (e.target as unknown as Element | null)?.setPointerCapture?.(e.pointerId);
                document.body.style.cursor = "grabbing";
            }}
            onPointerMove={(e) => {
                const activeDrag = drag.current;
                if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
                e.stopPropagation();
                const x = e.nativeEvent.clientX;
                if (Math.abs(x - activeDrag.startX) > 3) activeDrag.moved = true;
                manualYaw.current += (x - activeDrag.lastX) * 0.01;
                activeDrag.lastX = x;
                if (modelRotation.current) modelRotation.current.rotation.y = manualYaw.current;
            }}
            onPointerUp={(e) => {
                const activeDrag = drag.current;
                if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
                e.stopPropagation();
                (e.target as unknown as Element | null)?.releasePointerCapture?.(e.pointerId);
                activeDrag.pointerId = null;
                document.body.style.cursor = "grab";
            }}
            onPointerCancel={(e) => {
                const activeDrag = drag.current;
                if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
                (e.target as unknown as Element | null)?.releasePointerCapture?.(e.pointerId);
                drag.current = null;
                document.body.style.cursor = "";
            }}
            onClick={
                p.onClick
                    ? (e) => {
                          e.stopPropagation();
                          const wasDragged = drag.current?.moved ?? false;
                          drag.current = null;
                          if (wasDragged) return;
                          p.onClick?.();
                      }
                    : undefined
            }
            onPointerOver={() => {
                if (!drag.current || drag.current.pointerId === null) document.body.style.cursor = "grab";
            }}
            onPointerOut={() => {
                if (!drag.current || drag.current.pointerId === null) document.body.style.cursor = "";
            }}
        >
            <group ref={modelRotation} rotation={[0, FACE, 0]}>
                {hasGlb ? (
                    <Boundary fallback={human}>
                        <Suspense fallback={null}>
                            <GlbModel cfg={cfg} kind={p.kind} director={p.director} />
                        </Suspense>
                    </Boundary>
                ) : (
                    human
                )}
            </group>
            <sprite position={[nameOffsetX, 2.8, 0]} scale={[1.55, 0.48, 1]} renderOrder={10}>
                <spriteMaterial map={nameTexture} transparent depthTest={false} />
            </sprite>
        </group>
    );
}