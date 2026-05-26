/**
 * Avatar3D Component
 * Renders the 3D character model at a fixed position (bottom-right corner).
 * This component is designed to be MOUNTED ONCE and never unmount during
 * page transitions — only the `animation` prop changes.
 */

import { useRef, useEffect, Suspense, memo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, Environment } from '@react-three/drei';
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
const LOOPING_ANIMATIONS = new Set<AvatarAnimation>([
  'Idle',
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

  const { scene, animations } = useGLTF(modelUrl || DEFAULT_MODEL_URL);
  const { actions, names } = useAnimations(animations, group);

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

    // If the animation is already playing (e.g., from an internal auto-transition), don't reset it
    if (prevClipName.current === clipName && target.isRunning()) {
      return;
    }

    // Crossfade
    if (prevClipName.current && prevClipName.current !== clipName) {
      const prev = actions[prevClipName.current];
      if (prev) prev.fadeOut(0.5);
    }

    target.reset().fadeIn(0.4).play();
    prevClipName.current = clipName;

    // Let the controller decide the next state when a one-shot clip ends.
    if (!shouldLoop) {
      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === target) {
          onAnimationComplete?.(animation);
        }
      };
      const mixer = target.getMixer();
      mixer.addEventListener('finished', onFinished);
      return () => mixer.removeEventListener('finished', onFinished);
    }
  }, [animation, actions, names, onAnimationComplete]);

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
