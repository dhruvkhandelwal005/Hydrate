import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Group,
    Line,
    LineBasicMaterial,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PointLight,
    Points,
    PointsMaterial,
    Vector3,
} from "three";
import { Actor, RULING_AT, clamp, easeOut, lerp, type DirRef, type Director } from "./characters";

const GOLD = "#f2e21a";
const LIME = "#c8d92b";

type Props = { reduce: boolean; onRuling: () => void; onEnter: () => void };

/* ---------- clock: one timeline for everything ---------- */
function Clock({ director, reduce }: { director: DirRef; reduce: boolean }) {
    useFrame((s) => {
        const d = director.current;
        d.t = reduce ? 99 : s.clock.elapsedTime;
        d.ruled = d.t >= RULING_AT;
        d.calm = d.ruled ? easeOut(clamp((d.t - RULING_AT) / 0.9)) : 0;
    });
    return null;
}

/* ---------- camera: intro dolly, pointer parallax, impact shake ---------- */
function Rig({ director, shake }: { director: DirRef; shake: MutableRefObject<number> }) {
    const sm = useRef({ x: 0, y: 0 });
    useFrame((state, dt) => {
        const { camera, size, pointer } = state;
        const d = director.current;
        const aspect = size.width / Math.max(1, size.height);
        const base = Math.max(12.5, 15.4 / aspect);
        const intro = 1 + 0.16 * (1 - easeOut(clamp(d.t / 4.2)));
        const s = shake.current;
        shake.current = Math.max(0, s - dt * 2.2);
        const k = Math.min(1, dt * 3);
        sm.current.x += (pointer.x * 0.7 - sm.current.x) * k;
        sm.current.y += (pointer.y * 0.35 - sm.current.y) * k;
        camera.position.set(
            sm.current.x + Math.sin(d.t * 0.3) * 0.25 * (1 - d.calm) + (Math.random() - 0.5) * s * s * 0.5,
            3.0 + sm.current.y + (Math.random() - 0.5) * s * s * 0.4,
            base * intro,
        );
        camera.lookAt(0, 2.7, 0);
    });
    return null;
}

function Lights({ director }: { director: DirRef }) {
    const judge = useRef<PointLight>(null);
    useFrame(() => {
        const d = director.current;
        if (judge.current) {
            judge.current.intensity = d.t > 2.0 ? 14 + (d.ruled ? 20 * Math.exp(-(d.t - RULING_AT) * 4) : 0) : 0;
        }
    });
    return (
        <>
            <ambientLight color="#9fbf8a" intensity={0.9} />
            <directionalLight color="#fff3b0" intensity={2.2} position={[-4, 6, 6]} />
            <directionalLight color={LIME} intensity={1.6} position={[4, 3, -4]} />
            <pointLight ref={judge} color={GOLD} position={[0, 5.5, 1.5]} distance={12} intensity={0} />
        </>
    );
}

/* ---------- rising embers (3D particles) ---------- */
function Embers() {
    const N = 80;
    const { geo, spd } = useMemo(() => {
        const pos = new Float32Array(N * 3);
        const spd = new Float32Array(N);
        for (let i = 0; i < N; i += 1) {
            pos[i * 3] = (Math.random() - 0.5) * 16;
            pos[i * 3 + 1] = Math.random() * 8 - 1;
            pos[i * 3 + 2] = -4 + Math.random() * 7;
            spd[i] = 0.25 + Math.random() * 0.6;
        }
        const geo = new BufferGeometry();
        geo.setAttribute("position", new BufferAttribute(pos, 3));
        return { geo, spd };
    }, []);
    useFrame((s, dt) => {
        const a = geo.getAttribute("position") as BufferAttribute;
        for (let i = 0; i < N; i += 1) {
            let y = a.getY(i) + spd[i] * dt;
            if (y > 7.5) y = -1.2;
            a.setY(i, y);
            a.setX(i, a.getX(i) + Math.sin(s.clock.elapsedTime + i) * dt * 0.15);
        }
        a.needsUpdate = true;
    });
    return (
        <points geometry={geo} frustumCulled={false}>
            <pointsMaterial color={GOLD} size={0.07} transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} />
        </points>
    );
}

/* ---------- glowing rune circle under the duel ---------- */
function Runes({ director }: { director: DirRef }) {
    const root = useRef<Group>(null);
    const a = useRef<Group>(null);
    const b = useRef<Group>(null);
    useFrame(() => {
        const t = director.current.t;
        const p = easeOut(clamp((t - 1.0) / 0.9));
        if (root.current) {
            root.current.visible = t > 1.0;
            root.current.scale.setScalar(0.3 + 0.7 * p);
        }
        if (a.current) a.current.rotation.z = t * 0.15;
        if (b.current) b.current.rotation.z = -t * 0.25;
    });
    const m = (c: string, o: number) => (
        <meshBasicMaterial color={c} transparent opacity={o} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
    );
    return (
        <group ref={root} position={[0, 0.03, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <group ref={a}>
                <mesh>
                    <ringGeometry args={[3.1, 3.16, 96]} />
                    {m(LIME, 0.55)}
                </mesh>
                <mesh>
                    <ringGeometry args={[3.45, 3.5, 64, 1, 0, Math.PI * 1.3]} />
                    {m(GOLD, 0.5)}
                </mesh>
            </group>
            <group ref={b}>
                <mesh>
                    <ringGeometry args={[2.3, 2.35, 6]} />
                    {m(LIME, 0.5)}
                </mesh>
                <mesh>
                    <ringGeometry args={[1.5, 1.54, 3]} />
                    {m(GOLD, 0.55)}
                </mesh>
            </group>
        </group>
    );
}

/* ---------- Bifrost: glowing bridge behind everyone ---------- */
function Bifrost({ director }: { director: DirRef }) {
    const g = useRef<Group>(null);
    const cols = [LIME, GOLD, "#7ad6a0", "#3fa86a"];
    useFrame(() => {
        const t = director.current.t;
        const grp = g.current;
        if (!grp) return;
        grp.visible = t > 0.4;
        grp.scale.setScalar(Math.max(0.001, easeOut(clamp((t - 0.4) / 1.2))));
        grp.children.forEach((c, i) => {
            const mm = (c as Mesh).material as MeshBasicMaterial;
            mm.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.8));
        });
    });
    return (
        <group ref={g} position={[0, 0, -5]}>
            {cols.map((c, i) => (
                <mesh key={i}>
                    <torusGeometry args={[4.2 - i * 0.3, 0.06, 8, 80, Math.PI]} />
                    <meshBasicMaterial color={c} transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
}

/* ---------- the judge's bench rises, Odin lands behind it ---------- */
function Bench({ director }: { director: DirRef }) {
    const g = useRef<Group>(null);
    useFrame(() => {
        const t = director.current.t;
        if (!g.current) return;
        g.current.visible = t > 1.5;
        g.current.position.y = lerp(-4, 0, easeOut(clamp((t - 1.5) / 0.7)));
    });
    const gold = <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.3} emissive={GOLD} emissiveIntensity={0.2} />;
    return (
        <group ref={g}>
            <mesh position={[0, 3.025, -0.6]}>
                <boxGeometry args={[3.6, 1.15, 1.7]} />
                <meshStandardMaterial color="#2b1a0e" roughness={0.7} metalness={0.1} />
            </mesh>
            <mesh position={[0, 3.6, -0.6]}>
                <boxGeometry args={[3.7, 0.04, 1.8]} />
                {gold}
            </mesh>
            <mesh position={[0, 3.0, 0.27]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.5, 0.5, 0.04]} />
                {gold}
            </mesh>
        </group>
    );
}

/* ---------- Thor vs Loki lightning, 3D, regenerated ~20x/sec ---------- */
function Arc({ director }: { director: DirRef }) {
    const N = 16;
    const lines = useMemo(
        () =>
            Array.from({ length: 6 }, (_, i) => {
                const geo = new BufferGeometry();
                geo.setAttribute("position", new BufferAttribute(new Float32Array(N * 3), 3));
                const line = new Line(
                    geo,
                    new LineBasicMaterial({
                        color: i < 2 ? "#fffbd0" : GOLD,
                        transparent: true,
                        opacity: 0,
                        blending: AdditiveBlending,
                        depthWrite: false,
                    }),
                );
                line.frustumCulled = false;
                return line;
            }),
        [],
    );
    const glow = useRef<Mesh>(null);
    const light = useRef<PointLight>(null);
    const last = useRef(0);

    useFrame(() => {
        const d = director.current;
        const t = d.t;
        const grow = clamp((t - 1.7) / 0.3);
        const fade = d.ruled ? Math.max(0, 1 - (t - RULING_AT) / 0.6) : 1;
        const on = grow * fade;
        if (on > 0 && t - last.current > 0.05) {
            last.current = t;
            lines.forEach((l, li) => {
                const a = l.geometry.getAttribute("position") as BufferAttribute;
                for (let i = 0; i < N; i += 1) {
                    const s = i / (N - 1);
                    const amp = i === 0 || i === N - 1 ? 0 : Math.sin(s * Math.PI) * (0.32 + li * 0.05);
                    a.setXYZ(
                        i,
                        lerp(-1.25, 1.25, s * grow),
                        1.9 + (Math.random() - 0.5) * 2 * amp,
                        0.4 + (Math.random() - 0.5) * amp,
                    );
                }
                a.needsUpdate = true;
            });
        }
        lines.forEach((l) => {
            (l.material as LineBasicMaterial).opacity = on * (0.55 + Math.random() * 0.45);
        });
        if (glow.current) {
            glow.current.scale.setScalar((0.5 + Math.random() * 0.35) * on * 1.6 + 0.001);
            (glow.current.material as MeshBasicMaterial).opacity = on * 0.55;
        }
        if (light.current) light.current.intensity = on * (4 + Math.random() * 6);
    });

    return (
        <group>
            {lines.map((l, i) => (
                <primitive key={i} object={l} />
            ))}
            <mesh ref={glow} position={[0, 1.9, 0.4]}>
                <sphereGeometry args={[0.5, 16, 16]} />
                <meshBasicMaterial color="#fffbd0" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            <pointLight ref={light} position={[0, 1.9, 1]} color={GOLD} distance={9} intensity={0} />
        </group>
    );
}

/* ---------- gavel impact: shockwave ring, spark burst, light, shake ---------- */
function Impact({
    director,
    handRef,
    shake,
    onRuling,
    reduce,
}: {
    director: DirRef;
    handRef: MutableRefObject<Object3D | null>;
    shake: MutableRefObject<number>;
    onRuling: () => void;
    reduce: boolean;
}) {
    const N = 70;
    const fired = useRef(false);
    const t0 = useRef(0);
    const ring = useRef<Mesh>(null);
    const light = useRef<PointLight>(null);
    const pts = useRef<Points>(null);
    const origin = useRef(new Vector3(0.1, 3.6, -0.2));
    const burst = useMemo(() => {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new BufferAttribute(new Float32Array(N * 3), 3));
        return { geo, vel: new Float32Array(N * 3) };
    }, []);

    useEffect(() => {
        if (reduce) {
            fired.current = true;
            onRuling();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduce]);

    useFrame((_, dt) => {
        const d = director.current;
        if (!fired.current && d.ruled) {
            fired.current = true;
            t0.current = d.t;
            handRef.current?.getWorldPosition(origin.current);
            shake.current = 1;
            const a = burst.geo.getAttribute("position") as BufferAttribute;
            for (let i = 0; i < N; i += 1) {
                const ang = Math.random() * Math.PI * 2;
                const sp = 2 + Math.random() * 4;
                a.setXYZ(i, origin.current.x, origin.current.y, origin.current.z);
                burst.vel[i * 3] = Math.cos(ang) * sp;
                burst.vel[i * 3 + 1] = 1 + Math.random() * 4;
                burst.vel[i * 3 + 2] = Math.sin(ang) * sp * 0.6;
            }
            a.needsUpdate = true;
            onRuling();
        }
        if (!fired.current || reduce) return;
        const s = d.t - t0.current;
        if (ring.current) {
            ring.current.position.copy(origin.current);
            ring.current.scale.setScalar(1 + s * 7);
            (ring.current.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - s / 0.9));
        }
        const a = burst.geo.getAttribute("position") as BufferAttribute;
        for (let i = 0; i < N; i += 1) {
            burst.vel[i * 3 + 1] -= 6 * dt;
            a.setXYZ(
                i,
                a.getX(i) + burst.vel[i * 3] * dt,
                a.getY(i) + burst.vel[i * 3 + 1] * dt,
                a.getZ(i) + burst.vel[i * 3 + 2] * dt,
            );
        }
        a.needsUpdate = true;
        if (pts.current) (pts.current.material as PointsMaterial).opacity = Math.max(0, 1 - s / 1.3);
        if (light.current) {
            light.current.position.copy(origin.current);
            light.current.intensity = 30 * Math.exp(-s * 5);
        }
    });

    return (
        <group>
            <mesh ref={ring} position={[0.1, 3.6, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.4, 0.46, 64]} />
                <meshBasicMaterial color={GOLD} transparent opacity={0} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            <points ref={pts} geometry={burst.geo} frustumCulled={false}>
                <pointsMaterial color="#fffbd0" size={0.1} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
            </points>
            <pointLight ref={light} color={GOLD} distance={10} intensity={0} />
        </group>
    );
}

/* ---------- scene ---------- */
export default function Arena({ reduce, onRuling, onEnter }: Props) {
    const director = useRef<Director>({ t: reduce ? 99 : 0, ruled: reduce, calm: reduce ? 1 : 0 });
    const shake = useRef(0);
    const odinHand = useRef<Object3D | null>(null);

    return (
        <Canvas
            dpr={[1, 1.75]}
            camera={{ fov: 31, near: 0.1, far: 80, position: [0, 3, 13] }}
            gl={{ antialias: true, alpha: true }}
        >
            <Clock director={director} reduce={reduce} />
            <Rig director={director} shake={shake} />
            <Lights director={director} />
            <Bifrost director={director} />
            <Runes director={director} />
            <Embers />
            <Bench director={director} />
            <Arc director={director} />

            {/* Heimdall: first, rises in the foreground and blows the horn */}
            <Actor kind="heimdall" director={director} home={[0, -0.5, 3]} from={[0, -4, 3]} delay={0.2} dur={0.9} scale={0.8} />
            {/* Thor and Loki walk in and face each other as rivals */}
            <Actor kind="thor" director={director} home={[-2.5, 0, 0]} from={[-9, 0, 0]} delay={0.8} dur={1.0} rotY={0.25} settleRotY={0.25} scale={1.2} />
            <Actor kind="loki" director={director} home={[2.5, 0, 0]} from={[9, 0, 0]} delay={0.8} dur={1.0} rotY={-0.25} settleRotY={-0.25} scale={1.2} />
            {/* Odin drops in last, the gavel decides, click him to enter */}
            <Actor
                kind="odin"
                director={director}
                home={[0, 2.45, -1.2]}
                from={[0, 10, -1.2]}
                delay={2.0}
                dur={1.1}
                overshoot
                handRef={odinHand}
                onClick={onEnter}
            />

            <Impact director={director} handRef={odinHand} shake={shake} onRuling={onRuling} reduce={reduce} />
        </Canvas>
    );
}