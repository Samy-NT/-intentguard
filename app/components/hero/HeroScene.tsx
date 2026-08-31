"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { HeroSceneFallback } from "./HeroSceneFallback";

type AgentNode = {
  id: string;
  position: [number, number, number];
  tier: number;
};

type TrafficPulse = {
  edgeIndex: number;
  offset: number;
  speed: number;
  scale: number;
};

const AGENT_NODES: AgentNode[] = [
  { id: "core", position: [0.34, 0.05, 0.08], tier: 2 },
  { id: "policy", position: [-1.42, 0.92, -0.2], tier: 1 },
  { id: "behavior", position: [-0.52, 1.42, 0.34], tier: 1 },
  { id: "semantic", position: [1.46, 1.08, -0.12], tier: 1 },
  { id: "audit", position: [1.9, -0.22, 0.28], tier: 1 },
  { id: "runtime", position: [0.82, -1.18, -0.32], tier: 1 },
  { id: "agent-a", position: [-2.58, 0.02, 0.2], tier: 0 },
  { id: "agent-b", position: [-2.16, -1.25, -0.28], tier: 0 },
  { id: "agent-c", position: [-0.78, -1.72, 0.24], tier: 0 },
  { id: "agent-d", position: [2.46, 0.82, 0.18], tier: 0 },
  { id: "agent-e", position: [2.62, -1.08, -0.22], tier: 0 },
  { id: "agent-f", position: [-0.18, 2.24, -0.18], tier: 0 },
  { id: "agent-g", position: [0.16, -2.2, 0.05], tier: 0 },
  { id: "edge-x", position: [-3.24, -0.78, 0.3], tier: 0 },
  { id: "edge-y", position: [3.22, -0.08, 0.08], tier: 0 },
];

const CONNECTIONS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 2],
  [1, 6],
  [1, 11],
  [2, 3],
  [2, 11],
  [3, 4],
  [3, 9],
  [4, 9],
  [4, 10],
  [4, 14],
  [5, 8],
  [5, 10],
  [5, 12],
  [6, 7],
  [6, 13],
  [7, 8],
  [7, 13],
  [8, 12],
  [9, 14],
  [10, 14],
  [1, 5],
  [2, 5],
  [3, 10],
];

const THREAT_ROUTE = [13, 7, 8, 5, 0];
const QUARANTINE_POSITION = new THREE.Vector3(2.26, -1.08, 0.52);

const HEALTHY_EDGE_COLOR = new THREE.Color("#78716c");
const HEALTHY_PULSE_COLOR = new THREE.Color("#d6d3d1");
const CORE_COLOR = new THREE.Color("#fafaf9");
const DETECT_COLOR = new THREE.Color("#f59e0b");

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getNodePosition(index: number) {
  return new THREE.Vector3(...AGENT_NODES[index].position);
}

function getThreatPoint(progress: number) {
  const routeProgress = clamp01(progress) * (THREAT_ROUTE.length - 1);
  const segment = Math.min(Math.floor(routeProgress), THREAT_ROUTE.length - 2);
  const localT = routeProgress - segment;
  return getNodePosition(THREAT_ROUTE[segment]).lerp(getNodePosition(THREAT_ROUTE[segment + 1]), localT);
}

function buildPulses(count: number): TrafficPulse[] {
  return Array.from({ length: count }, (_, index) => ({
    edgeIndex: (index * 5 + 2) % CONNECTIONS.length,
    offset: (index * 0.137) % 1,
    speed: 0.055 + ((index % 5) * 0.012),
    scale: 0.72 + ((index % 4) * 0.12),
  }));
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.LineSegments | THREE.Points;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

export default function HeroScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const mountEl = mount;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const isMobile = window.innerWidth < 768 || coarsePointer;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isMobile,
        powerPreference: "high-performance",
      });
    } catch {
      setHasFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.055);

    const camera = new THREE.PerspectiveCamera(isMobile ? 41 : 34, 1, 0.1, 60);
    camera.position.set(0, 0.18, 8.4);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setClearColor(0x050505, 0);
    renderer.domElement.className = "aurel-hero-canvas";
    mountEl.appendChild(renderer.domElement);

    const rig = new THREE.Group();
    const network = new THREE.Group();
    scene.add(rig);
    rig.add(network);

    const nodePositions = AGENT_NODES.flatMap((node) => node.position);
    const nodeTiers = AGENT_NODES.map((node) => node.tier);
    const nodeSeeds = AGENT_NODES.map((_, index) => ((index * 41) % 97) / 97);
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute("aTier", new THREE.Float32BufferAttribute(nodeTiers, 1));
    nodeGeometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(nodeSeeds, 1));

    const nodeMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntro: { value: reducedMotion ? 1 : 0 },
        uDetection: { value: reducedMotion ? 0.6 : 0 },
        uPointer: { value: new THREE.Vector2(99, 99) },
        uPixelRatio: { value: 1 },
        uReduced: { value: reducedMotion ? 1 : 0 },
      },
      vertexShader: `
        attribute float aTier;
        attribute float aSeed;
        uniform float uTime;
        uniform float uIntro;
        uniform float uDetection;
        uniform vec2 uPointer;
        uniform float uPixelRatio;
        uniform float uReduced;
        varying float vTier;
        varying float vGlow;
        varying float vDetect;

        void main() {
          vec3 p = position;
          float drift = sin(uTime * 0.78 + aSeed * 19.0) * 0.028 * (1.0 - uReduced);
          p.xy += vec2(drift, drift * 0.58);

          float pointerGlow = 1.0 - smoothstep(0.0, 1.05, distance(p.xy, uPointer));
          float detectGlow = uDetection * (1.0 - smoothstep(0.0, 2.2, distance(p, vec3(0.34, 0.05, 0.08))));
          float living = 0.45 + 0.55 * sin(uTime * 1.45 + aSeed * 31.0);
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          float baseSize = mix(3.2, 7.0, aTier / 2.0);
          gl_PointSize = baseSize * uPixelRatio * (1.0 + pointerGlow * 0.75 + detectGlow * 0.48 + living * 0.12) * (48.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;

          vTier = aTier;
          vGlow = max(pointerGlow, living * 0.32) * uIntro;
          vDetect = detectGlow;
        }
      `,
      fragmentShader: `
        varying float vTier;
        varying float vGlow;
        varying float vDetect;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float disc = smoothstep(0.5, 0.18, d);
          float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.25, 0.48, d);
          vec3 base = mix(vec3(0.45, 0.42, 0.38), vec3(0.98, 0.97, 0.94), vTier / 2.0);
          vec3 detected = mix(base, vec3(0.96, 0.58, 0.16), vDetect);
          float alpha = (disc * 0.5 + ring * 0.36 + vGlow * 0.18 + vDetect * 0.26);
          gl_FragColor = vec4(detected, alpha);
        }
      `,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
    network.add(nodes);

    const linePositions = new Float32Array(CONNECTIONS.length * 2 * 3);
    const lineColors = new Float32Array(CONNECTIONS.length * 2 * 3);
    CONNECTIONS.forEach(([a, b], index) => {
      const pa = AGENT_NODES[a].position;
      const pb = AGENT_NODES[b].position;
      linePositions.set(pa, index * 6);
      linePositions.set(pb, index * 6 + 3);
    });
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    network.add(lines);

    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0xd6d3d1,
      transparent: true,
      opacity: 0.04,
      wireframe: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const boundaryA = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 4.8, 3, 2), boundaryMaterial.clone());
    boundaryA.rotation.set(-0.42, 0.18, -0.12);
    network.add(boundaryA);
    const boundaryB = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.25, 2, 2), boundaryMaterial.clone());
    boundaryB.rotation.set(0.28, -0.32, 0.18);
    network.add(boundaryB);

    const coreRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5f5f4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.006, 8, 144), coreRingMaterial);
    coreRing.position.copy(getNodePosition(0));
    coreRing.rotation.set(1.25, 0.1, 0.72);
    network.add(coreRing);

    const scanRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.007, 8, 164), scanRingMaterial);
    scanRing.position.copy(getNodePosition(0));
    scanRing.rotation.set(1.3, -0.08, 0.6);
    network.add(scanRing);

    const containmentMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uContain: { value: reducedMotion ? 0.8 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uContain;
        varying vec2 vUv;

        void main() {
          float scan = smoothstep(0.04, 0.0, abs(fract(vUv.x * 18.0 - uTime * 1.6) - 0.5));
          float bands = 0.28 + scan * 0.72;
          vec3 color = mix(vec3(0.98, 0.58, 0.16), vec3(0.94, 0.27, 0.27), 0.42);
          gl_FragColor = vec4(color, uContain * bands * 0.52);
        }
      `,
    });
    const containment = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 12, 164), containmentMaterial);
    containment.position.copy(QUARANTINE_POSITION);
    containment.rotation.set(1.15, -0.2, 0.38);
    containment.visible = reducedMotion;
    network.add(containment);

    const pulseGeometry = new THREE.SphereGeometry(0.04, 10, 8);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: HEALTHY_PULSE_COLOR,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pulses = buildPulses(isMobile ? 14 : 24);
    const pulseMesh = new THREE.InstancedMesh(pulseGeometry, pulseMaterial, pulses.length);
    pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    network.add(pulseMesh);

    const threatMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: reducedMotion ? 0.85 : 0 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vNormal;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec3 p = position + normal * sin(uTime * 8.0 + position.y * 11.0) * 0.045;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        uniform float uTime;
        varying vec3 vNormal;

        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 1.8);
          float pulse = 0.68 + 0.32 * sin(uTime * 10.0);
          vec3 color = mix(vec3(0.96, 0.58, 0.16), vec3(0.94, 0.18, 0.22), pulse);
          gl_FragColor = vec4(color, uAlpha * (0.48 + fresnel * 0.52));
        }
      `,
    });
    const threat = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 1), threatMaterial);
    threat.visible = reducedMotion;
    network.add(threat);

    const barrierMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5f5f4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const barrier = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 80), barrierMaterial);
    barrier.rotation.set(1.15, -0.25, 0.25);
    network.add(barrier);

    const matrix = new THREE.Matrix4();
    const pointerTarget = new THREE.Vector2(99, 99);
    const pointerSmoothed = new THREE.Vector2(99, 99);
    const cameraTarget = new THREE.Vector2(0, 0);
    const cameraSmoothed = new THREE.Vector2(0, 0);
    const scrollProgress = { current: 0 };
    const startTime = performance.now();

    function updateLineColors(detect: number, contain: number, intro: number, elapsed: number) {
      const attr = lineGeometry.getAttribute("color") as THREE.BufferAttribute;
      CONNECTIONS.forEach(([a, b], index) => {
        const onThreatRoute =
          THREAT_ROUTE.includes(a) &&
          THREAT_ROUTE.includes(b) &&
          Math.abs(THREAT_ROUTE.indexOf(a) - THREAT_ROUTE.indexOf(b)) === 1;
        const coreEdge = a === 0 || b === 0;
        const activity = 0.46 + Math.sin(elapsed * 1.4 + index * 0.6) * 0.12;
        const highlight = onThreatRoute ? Math.max(detect, contain * 0.4) : coreEdge ? detect * 0.28 : 0;
        const color = HEALTHY_EDGE_COLOR.clone().lerp(DETECT_COLOR, highlight).lerp(CORE_COLOR, coreEdge ? 0.1 : 0);
        const intensity = intro * (activity + highlight * 1.15);
        color.multiplyScalar(intensity);
        attr.setXYZ(index * 2, color.r, color.g, color.b);
        attr.setXYZ(index * 2 + 1, color.r, color.g, color.b);
      });
      attr.needsUpdate = true;
    }

    function resize() {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dprCap = isMobile ? 1.25 : 1.75;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < 640 ? 46 : width < 1024 ? 39 : 34;
      camera.updateProjectionMatrix();
      nodeMaterial.uniforms.uPixelRatio.value = dpr;
    }

    function updateScroll() {
      const rect = mountEl.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      scrollProgress.current = clamp01((viewport * 0.48 - rect.top) / Math.max(rect.height, 1));
    }

    function onPointerMove(event: PointerEvent) {
      if (reducedMotion || isMobile) return;
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      cameraTarget.set(x, y);
      pointerTarget.set(x * 6.4 - 0.15, -y * 4.2);
    }

    function onVisibilityChange() {
      renderer.setAnimationLoop(document.hidden ? null : animate);
    }

    function animate() {
      const elapsed = (performance.now() - startTime) / 1000;
      const storyTime = reducedMotion ? 8.2 : (elapsed + 2.35) % 12;
      const intro = reducedMotion ? 1 : smoothstep(0, 2.45, elapsed);
      const threatIn = smoothstep(4.55, 5.15, storyTime);
      const threatOut = smoothstep(10.65, 11.4, storyTime);
      const threatAlpha = reducedMotion ? 0.86 : threatIn * (1 - threatOut);
      const detection = reducedMotion ? 0.52 : smoothstep(5.95, 6.45, storyTime) * (1 - smoothstep(8.4, 9.2, storyTime));
      const intercept = reducedMotion ? 0.74 : smoothstep(6.78, 7.22, storyTime) * (1 - smoothstep(10.55, 11.35, storyTime));
      const contain = reducedMotion ? 0.82 : smoothstep(7.18, 7.72, storyTime) * (1 - smoothstep(10.65, 11.4, storyTime));
      const rawThreatProgress = clamp01((storyTime - 4.75) / 2.25);
      const routeProgress = reducedMotion ? 0.62 : Math.min(rawThreatProgress, 0.66);
      const routePoint = getThreatPoint(routeProgress);
      const isolateProgress = reducedMotion ? 1 : smoothstep(7.0, 7.72, storyTime);
      const threatPoint = routePoint.clone().lerp(QUARANTINE_POSITION, isolateProgress);

      cameraSmoothed.lerp(cameraTarget, 0.055);
      pointerSmoothed.lerp(pointerTarget, 0.075);
      camera.position.x = cameraSmoothed.x * 0.34 + scrollProgress.current * 0.22;
      camera.position.y = 0.18 - cameraSmoothed.y * 0.22 + scrollProgress.current * 0.12;
      camera.lookAt(0.28 + scrollProgress.current * 0.3, -0.06, 0);

      const mobileScale = isMobile ? 0.76 : 1;
      rig.position.x = isMobile ? 0.24 : 1.18;
      rig.position.y = isMobile ? -0.72 : -0.06;
      rig.scale.setScalar(lerp(0.86, mobileScale, intro));
      rig.rotation.y = lerp(-0.2, 0.08, intro) + Math.sin(elapsed * 0.18) * 0.035 * (1 - Number(reducedMotion));
      rig.rotation.x = -0.05 + cameraSmoothed.y * 0.035;
      network.rotation.z = Math.sin(elapsed * 0.14) * 0.018 * (1 - Number(reducedMotion));

      nodeMaterial.uniforms.uTime.value = elapsed;
      nodeMaterial.uniforms.uIntro.value = intro;
      nodeMaterial.uniforms.uDetection.value = detection + contain * 0.32;
      nodeMaterial.uniforms.uPointer.value.copy(pointerSmoothed);

      coreRing.rotation.z += reducedMotion ? 0 : 0.0024;
      coreRing.scale.setScalar(1 + detection * 0.12 + Math.sin(elapsed * 0.9) * 0.025);
      coreRingMaterial.opacity = 0.1 + intro * 0.08 + detection * 0.2;

      scanRing.visible = detection > 0.01;
      const scanScale = 0.34 + detection * (1.5 + Math.sin(elapsed * 2.2) * 0.08);
      scanRing.scale.setScalar(scanScale);
      scanRingMaterial.opacity = detection * (0.34 - clamp01(scanScale - 1.2) * 0.18);

      containment.visible = contain > 0.01;
      containment.position.copy(QUARANTINE_POSITION);
      containment.scale.setScalar(0.7 + contain * 0.72 + Math.sin(elapsed * 2.6) * 0.018 * contain);
      containment.rotation.z -= reducedMotion ? 0 : 0.007;
      containmentMaterial.uniforms.uTime.value = elapsed;
      containmentMaterial.uniforms.uContain.value = contain;

      threat.visible = threatAlpha > 0.01;
      threat.position.copy(threatPoint);
      threat.rotation.set(elapsed * 1.4, elapsed * 1.9, elapsed * 0.9);
      threat.scale.setScalar((0.9 + intercept * 0.25 + contain * 0.08) * threatAlpha);
      threatMaterial.uniforms.uTime.value = elapsed;
      threatMaterial.uniforms.uAlpha.value = threatAlpha;

      barrier.visible = intercept > 0.01;
      barrier.position.copy(routePoint);
      barrier.scale.setScalar(0.36 + intercept * 1.08);
      barrierMaterial.opacity = intercept * (1 - contain * 0.35) * 0.36;

      pulses.forEach((pulse, index) => {
        const [a, b] = CONNECTIONS[pulse.edgeIndex];
        const from = getNodePosition(a);
        const to = getNodePosition(b);
        const t = (pulse.offset + elapsed * pulse.speed) % 1;
        const eased = smoothstep(0, 1, t);
        const point = from.lerp(to, eased);
        const lineFade = Math.sin(Math.PI * t);
        const pulseScale = pulse.scale * (0.62 + lineFade * 0.7) * intro;
        matrix.compose(
          point,
          new THREE.Quaternion(),
          new THREE.Vector3(pulseScale, pulseScale, pulseScale)
        );
        pulseMesh.setMatrixAt(index, matrix);
      });
      pulseMesh.instanceMatrix.needsUpdate = true;
      pulseMaterial.opacity = reducedMotion ? 0.38 : 0.58;

      updateLineColors(detection, contain, intro, elapsed);
      renderer.render(scene, camera);
    }

    resize();
    updateScroll();
    renderer.setAnimationLoop(animate);
    setIsReady(true);

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mountEl.removeChild(renderer.domElement);
      disposeObject(scene);
      renderer.dispose();
    };
  }, []);

  return (
    <div className={`aurel-hero-scene ${isReady && !hasFailed ? "has-webgl" : ""}`} aria-hidden="true">
      <HeroSceneFallback />
      <div
        ref={mountRef}
        className={`aurel-hero-webgl ${isReady && !hasFailed ? "is-ready" : ""}`}
      />
      <div className="aurel-hero-telemetry">
        <div>
          <span>agent mesh</span>
          <strong>live</strong>
        </div>
        <div>
          <span>anomaly</span>
          <strong>isolated</strong>
        </div>
        <div>
          <span>traffic</span>
          <strong>continuous</strong>
        </div>
      </div>
    </div>
  );
}
