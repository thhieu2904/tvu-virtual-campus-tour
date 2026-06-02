'use client'

import { useEffect, useRef, useState, memo, Suspense } from 'react'
import { Bot, Box } from 'lucide-react'

/* ─── Lazy-loaded Three.js modules (singleton) ─── */

let threeLoaded = false
let CanvasComponent: React.ComponentType<any> | null = null
let useGLTFHook: ((url: string) => any) | null = null
let useAnimationsHook: ((animations: any, ref: any) => any) | null = null
let THREEModule: any = null

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
}: {
  modelUrl: string
}) {
  const group = useRef<any>(null!)

  if (!useGLTFHook || !useAnimationsHook || !THREEModule) return null

  const { scene, animations } = useGLTFHook(modelUrl)
  const { actions, names } = useAnimationsHook(animations, group)

  // Play Idle animation on mount
  useEffect(() => {
    if (!actions || names.length === 0) return
    const idleName = names.find(
      (n: string) => n === 'Idle' || n === 'HeadNod'
    )
    if (!idleName || !actions[idleName]) return
    const action = actions[idleName]
    action.setLoop(THREEModule.LoopRepeat, Infinity)
    action.reset().setEffectiveTimeScale(0.8).setEffectiveWeight(1).fadeIn(0.3).play()
  }, [actions, names])

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
          mat.side = THREEModule.DoubleSide
          if (mat.transparent || mat.alphaTest > 0) {
            mat.alphaTest = 0.5
            mat.depthWrite = true
          }
          mat.needsUpdate = true
        }
      }
    })
  }, [scene])

  return (
    <group ref={group} dispose={null} position={[0, -0.9, 0]}>
      <primitive object={scene} scale={1} />
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
}: {
  modelUrl: string
  className?: string
}) {
  const resolvedUrl = normalizeModelUrl(modelUrl)
  const [ready, setReady] = useState(threeLoaded)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (threeLoaded) return
    Promise.all([
      import('@react-three/fiber'),
      import('@react-three/drei'),
      import('three'),
    ])
      .then(([fiber, drei, three]) => {
        CanvasComponent = fiber.Canvas
        useGLTFHook = drei.useGLTF
        useAnimationsHook = drei.useAnimations
        THREEModule = three
        threeLoaded = true
        setReady(true)
      })
      .catch(() => setError(true))
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

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#f0f4fa] via-[#e8eef8] to-[#dce4f2] ${className || ''}`}>
      <Canvas
        camera={{ position: [0.15, 0.4, 3.4], fov: 35 }}
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
        <Suspense fallback={null}>
          <MascotModelInner modelUrl={resolvedUrl} />
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
