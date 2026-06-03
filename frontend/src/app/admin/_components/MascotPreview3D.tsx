'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, memo, Suspense } from 'react'
import { Bot, Box } from 'lucide-react'

export type MascotPreviewAnimation =
  | 'Idle'
  | 'Greeting'
  | 'Thinking'
  | 'Talking'
  | 'Thankful'

/* ─── Lazy-loaded Three.js modules (singleton) ─── */

let threeLoaded = false
let threeLoadPromise: Promise<void> | null = null
let CanvasComponent: React.ComponentType<any> | null = null
let useGLTFHook: ((url: string) => any) | null = null
let useAnimationsHook: ((animations: any, ref: any) => any) | null = null
let OrbitControlsComponent: React.ComponentType<any> | null = null
let THREEModule: any = null

const CROSSFADE_SECONDS = 0.4
const LOOPING_ANIMATIONS = new Set<MascotPreviewAnimation>(['Idle', 'Talking'])
type SceneVector = [number, number, number]
const CLIP_FALLBACKS: Record<MascotPreviewAnimation, string[]> = {
  Idle: ['Idle', 'HeadNod'],
  Greeting: ['Greeting', 'StandingUp'],
  Thinking: ['Thinking', 'Texting'],
  Talking: ['Talking', 'HeadNod', 'Texting'],
  Thankful: ['Thankful'],
}

function resolveClipName(animation: MascotPreviewAnimation, names: string[]) {
  return CLIP_FALLBACKS[animation].find((name) => names.includes(name))
}

function MascotPreviewFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-b from-[#eef3fb] to-[#dce6f5]">
      <div className="flex flex-col items-center gap-2 text-[#7a96c9]">
        <Box className="h-8 w-8 animate-pulse" />
        <span className="text-xs font-medium">Loading 3D...</span>
      </div>
    </div>
  )
}

const MascotModelInner = memo(function MascotModelInner({
  modelUrl,
  animation = 'Idle',
  modelPosition = [0, -0.9, 0],
  modelScale = 1,
  onAnimationsLoaded,
  onAnimationComplete,
}: {
  modelUrl: string
  animation?: MascotPreviewAnimation
  modelPosition?: SceneVector
  modelScale?: number
  onAnimationsLoaded?: (names: string[]) => void
  onAnimationComplete?: (animation: MascotPreviewAnimation) => void
}) {
  const group = useRef<any>(null!)
  const prevClipName = useRef<string | null>(null)
  const onAnimationCompleteRef = useRef(onAnimationComplete)

  const useGLTF = useGLTFHook!
  const useAnimations = useAnimationsHook!
  const THREE = THREEModule!

  const { scene, animations } = useGLTF(modelUrl)
  const { actions, names } = useAnimations(animations, group)

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete
  }, [onAnimationComplete])

  useEffect(() => {
    onAnimationsLoaded?.(names)
  }, [names, onAnimationsLoaded])

  // Tune materials — same as Avatar3D
  useEffect(() => {
    scene.traverse((child: any) => {
      if (child.isMesh) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material]
        for (const mat of materials) {
          mat.metalness = 0.0
          mat.roughness = 0.85
          mat.side = THREE.DoubleSide
          if (mat.transparent || mat.alphaTest > 0) {
            mat.alphaTest = 0.5
            mat.depthWrite = true
          }
          mat.needsUpdate = true
        }
      }
    })
  }, [scene, THREE.DoubleSide])

  // Three.js AnimationAction objects are imperative runtime handles; switching clips requires mutating them.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!actions || names.length === 0) return

    const clipName = resolveClipName(animation, names)
    if (!clipName) return

    const target = actions[clipName]
    if (!target) return

    const shouldLoop = LOOPING_ANIMATIONS.has(animation)
    target.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1)
    // eslint-disable-next-line react-hooks/immutability
    target.clampWhenFinished = !shouldLoop
    target.enabled = true
    target
      .reset()
      .setEffectiveTimeScale(animation === 'Idle' ? 0.85 : 1)
      .setEffectiveWeight(1)
      .fadeIn(CROSSFADE_SECONDS)
      .play()

    if (prevClipName.current && prevClipName.current !== clipName) {
      const previous = actions[prevClipName.current]
      if (previous) previous.fadeOut(CROSSFADE_SECONDS)
    }

    prevClipName.current = clipName

    if (!shouldLoop) {
      const mixer = target.getMixer()
      const onFinished = (event: { action: unknown }) => {
        if (event.action === target) {
          onAnimationCompleteRef.current?.(animation)
        }
      }
      mixer.addEventListener('finished', onFinished)
      return () => mixer.removeEventListener('finished', onFinished)
    }
  }, [actions, animation, names, THREE.LoopOnce, THREE.LoopRepeat])

  return (
    <group ref={group} dispose={null} position={modelPosition}>
      <primitive object={scene} scale={modelScale} />
    </group>
  )
})

/** Ensure model URL is absolute (starts with /) so it resolves from root */
function normalizeModelUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url
  }
  return `/${url}`
}

const MascotPreview3D = memo(function MascotPreview3D({
  modelUrl,
  className,
  animation = 'Idle',
  controls = false,
  cameraPosition = [0.15, 0.4, 3.4],
  cameraTarget = [0, 0.2, 0],
  fov = 35,
  modelPosition,
  modelScale,
  onAnimationsLoaded,
  onAnimationComplete,
}: {
  modelUrl: string
  className?: string
  animation?: MascotPreviewAnimation
  controls?: boolean
  cameraPosition?: SceneVector
  cameraTarget?: SceneVector
  fov?: number
  modelPosition?: SceneVector
  modelScale?: number
  onAnimationsLoaded?: (names: string[]) => void
  onAnimationComplete?: (animation: MascotPreviewAnimation) => void
}) {
  const resolvedUrl = normalizeModelUrl(modelUrl)
  const [ready, setReady] = useState(threeLoaded)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (threeLoaded) return
    if (threeLoadPromise) {
      threeLoadPromise.then(() => setReady(true)).catch(() => setError(true))
      return
    }
    threeLoadPromise = Promise.all([
      import('@react-three/fiber'),
      import('@react-three/drei'),
      import('three'),
    ])
      .then(([fiber, drei, three]) => {
        CanvasComponent = fiber.Canvas
        useGLTFHook = drei.useGLTF
        useAnimationsHook = drei.useAnimations
        OrbitControlsComponent = drei.OrbitControls
        THREEModule = three
        threeLoaded = true
        setReady(true)
      })
      .catch(() => setError(true))
      .finally(() => { threeLoadPromise = null })
  }, [])

  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-b from-[#eef3fb] to-[#dce6f5] ${className || ''}`}>
        <Bot className="h-8 w-8 text-[#7a96c9]" />
      </div>
    )
  }

  if (!ready || !CanvasComponent) {
    return <MascotPreviewFallback />
  }

  const Canvas = CanvasComponent
  const OrbitControls = OrbitControlsComponent

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#f0f4fa] via-[#e8eef8] to-[#dce4f2] ${className || ''}`}>
      <Canvas
        camera={{ position: cameraPosition, fov }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREEModule.LinearToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }: any) => gl.setClearColor(0x000000, 0)}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.8} color="#ffffff" />
        <hemisphereLight args={['#ffeedd', '#8899bb', 0.4]} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-3, 3, 3]} intensity={0.4} color="#a8c8ff" />
        {controls && OrbitControls && (
          <OrbitControls
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={1.5}
            maxDistance={7}
            target={cameraTarget}
          />
        )}
        <Suspense fallback={null}>
          <MascotModelInner
            modelUrl={resolvedUrl}
            animation={animation}
            modelPosition={modelPosition}
            modelScale={modelScale}
            onAnimationsLoaded={onAnimationsLoaded}
            onAnimationComplete={onAnimationComplete}
          />
        </Suspense>
      </Canvas>
      {/* Subtle label overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/20 to-transparent px-3 py-2">
        <p className="text-[10px] font-medium text-white/80 drop-shadow-sm">3D Preview</p>
      </div>
    </div>
  )
})

export default MascotPreview3D
