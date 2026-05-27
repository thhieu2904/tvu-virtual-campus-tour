/**
 * Avatar3D Component
 * Renders the 3D character model at a fixed position (bottom-right corner).
 * This component is designed to be MOUNTED ONCE and never unmount during
 * page transitions — only the `animation` prop changes.
 */

import { useRef, useEffect, Suspense, memo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Environment } from '@react-three/drei';
import { useTourStore } from '@/features/tour/store';
import * as THREE from 'three';
import { attachWebGLContextRecovery } from '@/shared/lib/webglRecovery';

// ─── Animation names ────────────────────────────────────────
export type AvatarAnimation =
  | 'Idle'
  | 'Greeting'
  | 'Thinking'
  | 'Talking'
  | 'Thankful';

const DEFAULT_MODEL_URL = '/mascots/kaito/model.glb';
const CROSSFADE_SECONDS = 0.45;
const LOOPING_ANIMATIONS = new Set<AvatarAnimation>([
  'Idle',
  'Talking',
]);
const CLIP_FALLBACKS: Record<AvatarAnimation, string[]> = {
  Idle: ['Idle', 'HeadNod'],
  Greeting: ['Greeting', 'StandingUp'],
  Thinking: ['Thinking', 'Texting'],
  Talking: ['Talking', 'HeadNod', 'Texting'],
  Thankful: ['Thankful'],
};

function resolveClipName(animation: AvatarAnimation, names: string[]) {
  return CLIP_FALLBACKS[animation].find((name) => names.includes(name));
}

interface AvatarModelProps {
  animation: AvatarAnimation;
  modelUrl?: string;
  onAnimationComplete?: (animation: AvatarAnimation) => void;
}

// ─── Inner 3D Model (memoized to avoid unnecessary re-renders) ───
const AvatarModel = memo(function AvatarModel({
  animation,
  modelUrl,
  onAnimationComplete,
}: AvatarModelProps) {
  const group = useRef<THREE.Group>(null!);
  const prevClipName = useRef<string | null>(null);
  const mouthTargetsRef = useRef<Array<{ mesh: THREE.Mesh; index: number }>>([]);
  const onAnimationCompleteRef = useRef(onAnimationComplete);

  const { scene, animations } = useGLTF(modelUrl || DEFAULT_MODEL_URL);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  // Tune materials for toon-style VRM model
  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const rawMat of materials) {
          const mat = rawMat as THREE.MeshStandardMaterial;

          // Toon look: no metallic, matte finish
          mat.metalness = 0.0;
          mat.roughness = 0.85;

          // VRM models use doubleSided — required to avoid "jagged triangle" artifacts
          mat.side = THREE.DoubleSide;

          // Improve alpha handling for hair/eyelash/brow
          if (mat.transparent || mat.alphaTest > 0) {
            mat.alphaTest = 0.5;
            mat.depthWrite = true;
          }

          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  // Find all mouth morph targets (outer lips, teeth, inside mouth meshes)
  useEffect(() => {
    const targets: Array<{ mesh: THREE.Mesh; index: number }> = [];
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        const keys = Object.keys(mesh.morphTargetDictionary);
        const mouthKey = keys.find(
          (k) =>
            k === 'mouth_a' ||
            k === 'Fcl_MTH_A' ||
            k === 'aa' ||
            k === 'A' ||
            k.toLowerCase() === 'viseme_a' ||
            k.toLowerCase().includes('mouth_a')
        );
        if (mouthKey !== undefined) {
          const index = mesh.morphTargetDictionary[mouthKey];
          targets.push({ mesh, index });
          console.log(`[Avatar3D] Found mouth morph target: "${mouthKey}" at index ${index} on mesh "${mesh.name}"`);
        }
      }
    });
    mouthTargetsRef.current = targets;
  }, [scene]);

  const avatarState = useTourStore((s) => s.avatarState);

  // Procedural Lip Sync Animation Driven by Speak State
  useFrame((state) => {
    if (mouthTargetsRef.current.length === 0) return;

    const isSpeaking = avatarState === 'speaking';
    const time = state.clock.getElapsedTime();
    let targetInfluence = 0;

    if (isSpeaking) {
      // Calm, cartoon-style soft lip sync formula:
      // Slow down syllable frequency (6.5) and modulate with soft phrasing (2.0)
      const syllable = Math.abs(Math.sin(time * 6.5));
      const phrasing = 0.4 + 0.6 * Math.abs(Math.cos(time * 2.0));
      targetInfluence = syllable * phrasing * 0.75; // Pleasant max opening of 0.75
    } else {
      targetInfluence = 0;
    }

    // Apply smooth mouth opening/closing to all mouth meshes (outer lips, teeth, etc.)
    for (const target of mouthTargetsRef.current) {
      const { mesh, index } = target;
      if (!mesh.morphTargetInfluences) continue;

      const currentInfluence = mesh.morphTargetInfluences[index] || 0;
      mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
        currentInfluence,
        targetInfluence,
        0.25
      );
    }
  });

  // Switch animation with smooth crossfade. Three.js animation actions are imperative objects.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (names.length === 0 || !animation) return;

    const clipName = resolveClipName(animation, names);
    if (!clipName) return;

    const target = actions[clipName];
    if (!target) return;

    const shouldLoop = LOOPING_ANIMATIONS.has(animation);
    target.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
    // Three.js AnimationAction is an imperative runtime object; this flag is part of its public API.
    // eslint-disable-next-line react-hooks/immutability
    target.clampWhenFinished = !shouldLoop;

    // If the animation is already playing, keep the current action and listener intact.
    if (prevClipName.current === clipName && target.isRunning()) {
      return;
    }

    target.enabled = true;
    target
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(CROSSFADE_SECONDS)
      .play();

    if (prevClipName.current && prevClipName.current !== clipName) {
      const prev = actions[prevClipName.current];
      if (prev) {
        prev.enabled = true;
        prev.fadeOut(CROSSFADE_SECONDS);
      }
    }

    prevClipName.current = clipName;

    // Let the controller decide the next state when a one-shot clip ends.
    if (!shouldLoop) {
      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === target) {
          onAnimationCompleteRef.current?.(animation);
        }
      };
      const mixer = target.getMixer();
      mixer.addEventListener('finished', onFinished);
      return () => mixer.removeEventListener('finished', onFinished);
    }
  }, [animation, actions, names]);

  return (
    <group ref={group} dispose={null} position={[0, -0.9, 0]}>
      <primitive object={scene} scale={1} />
    </group>
  );
});

// Preload the local mascot defaults. Location-specific URLs can still override this.
useGLTF.preload(DEFAULT_MODEL_URL);
useGLTF.preload('/mascots/vivy/model.glb');

function WebGLRecoveryListener() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    return attachWebGLContextRecovery(gl.domElement, 'avatar canvas');
  }, [gl]);

  return null;
}

// ─── Main Avatar3D Wrapper ──────────────────────────────────
interface Avatar3DProps {
  animation: AvatarAnimation;
  modelUrl?: string;
  onAnimationComplete?: (animation: AvatarAnimation) => void;
}

function Avatar3D({ animation, modelUrl, onAnimationComplete }: Avatar3DProps) {
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{
          position: [0.15, 0.4, 3.4],
          fov: 35,
        }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.LinearToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0); // Fully transparent background
        }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <WebGLRecoveryListener />
        <ambientLight intensity={0.8} color="#ffffff" />
        <hemisphereLight args={['#ffeedd', '#8899bb', 0.4]} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-3, 3, 3]} intensity={0.4} color="#a8c8ff" />
        <pointLight position={[2, 4, -3]} intensity={0.3} color="#ffd700" />
        <pointLight position={[0, 0.5, 2]} intensity={0.2} color="#ffe4c4" />
        <Suspense fallback={null}>
          <AvatarModel
            key={modelUrl || 'default'}
            animation={animation}
            modelUrl={modelUrl}
            onAnimationComplete={onAnimationComplete}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Memoize the entire component to prevent re-renders from parent transitions
export default memo(Avatar3D);
