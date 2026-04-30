/**
 * Avatar3D Component
 * Renders the 3D character model at a fixed position (bottom-right corner).
 * This component is designed to be MOUNTED ONCE and never unmount during
 * page transitions — only the `animation` prop changes.
 */

import { useRef, useEffect, Suspense, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useAnimations, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─── Animation names ────────────────────────────────────────
export type AvatarAnimation = 'HeadNod' | 'StandingUp' | 'Thankful' | 'Texting';

interface AvatarModelProps {
  animation: AvatarAnimation;
}

// ─── Inner 3D Model (memoized to avoid unnecessary re-renders) ───
const AvatarModel = memo(function AvatarModel({ animation }: AvatarModelProps) {
  const group = useRef<THREE.Group>(null!);
  const prevAnimation = useRef<AvatarAnimation | null>(null);

  const { scene, animations } = useGLTF('/models/character.glb');
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

  // Switch animation with smooth crossfade
  useEffect(() => {
    if (names.length === 0 || !animation) return;

    const target = actions[animation];
    if (!target) return;

    const shouldLoop = animation === 'HeadNod' || animation === 'Texting';
    target.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
    target.clampWhenFinished = !shouldLoop;

    // If the animation is already playing (e.g., from an internal auto-transition), don't reset it
    if (prevAnimation.current === animation && target.isRunning()) {
      return;
    }

    // Crossfade
    if (prevAnimation.current && prevAnimation.current !== animation) {
      const prev = actions[prevAnimation.current];
      if (prev) prev.fadeOut(0.5);
    }

    target.reset().fadeIn(0.4).play();
    prevAnimation.current = animation;

    // Auto-transition non-looping → HeadNod
    if (!shouldLoop) {
      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === target) {
          const headNod = actions['HeadNod'];
          if (headNod) {
            target.fadeOut(0.5);
            headNod.reset().fadeIn(0.4).play();
            headNod.setLoop(THREE.LoopRepeat, Infinity);
            prevAnimation.current = 'HeadNod';
          }
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

// Preload the GLB
useGLTF.preload('/models/character.glb');

// ─── Main Avatar3D Wrapper ──────────────────────────────────
interface Avatar3DProps {
  animation: AvatarAnimation;
}

function Avatar3D({ animation }: Avatar3DProps) {
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
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0); // Fully transparent background
        }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-3, 3, 3]} intensity={0.4} color="#a8c8ff" />
        <pointLight position={[2, 4, -3]} intensity={0.3} color="#ffd700" />
        <Environment preset="city" background={false} />
        <Suspense fallback={null}>
          <AvatarModel animation={animation} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Memoize the entire component to prevent re-renders from parent transitions
export default memo(Avatar3D);
