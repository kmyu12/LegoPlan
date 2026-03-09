'use client'

import { useRef, useState } from 'react'
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

// PDF 기반 6면 정의 - 에디톨로지 전략 포트
// Z-fighting 방지: 큐브 본체(±1.0)보다 0.002 바깥으로 면을 배치
const D = 1.002
const FACE_CONFIG = [
  { label: 'OUTPUT',   sub: '소유/공급',   color: '#22c55e', position: [D, 0, 0]  as [number,number,number], rotation: [0, Math.PI / 2, 0]  as [number,number,number] },
  { label: 'INPUT',    sub: '갈망/수요',   color: '#eab308', position: [-D, 0, 0] as [number,number,number], rotation: [0, -Math.PI / 2, 0] as [number,number,number] },
  { label: 'BARRIER',  sub: '결핍/위험',   color: '#ef4444', position: [0, 0, D]  as [number,number,number], rotation: [0, 0, 0]             as [number,number,number] },
  { label: 'LOGIC',    sub: '전략/연결',   color: '#3b82f6', position: [0, 0, -D] as [number,number,number], rotation: [0, Math.PI, 0]       as [number,number,number] },
  { label: 'IDENTITY', sub: '이름/정의',   color: '#f8fafc', position: [0, D, 0]  as [number,number,number], rotation: [-Math.PI / 2, 0, 0]  as [number,number,number] },
  { label: 'HISTORY',  sub: '증거/데이터', color: '#1e1e2e', position: [0, -D, 0] as [number,number,number], rotation: [Math.PI / 2, 0, 0]   as [number,number,number] },
]

type FaceLabel = 'OUTPUT' | 'INPUT' | 'BARRIER' | 'LOGIC' | 'IDENTITY' | 'HISTORY'

function FacePlane({
  config,
  onSelect,
  isSelected,
}: {
  config: typeof FACE_CONFIG[0]
  onSelect: (label: FaceLabel) => void
  isSelected: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <group position={config.position} rotation={config.rotation}>
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect(config.label as FaceLabel)
        }}
      >
        <planeGeometry args={[1.98, 1.98]} />
        <meshStandardMaterial
          color={config.color}
          roughness={0.85}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <Text
        position={[0, 0.18, 0.01]}
        fontSize={0.2}
        color={config.label === 'IDENTITY' ? '#0f172a' : '#ffffff'}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.05}
      >
        {config.label}
      </Text>
      <Text
        position={[0, -0.15, 0.01]}
        fontSize={0.13}
        color={config.label === 'IDENTITY' ? '#334155' : '#e2e8f0'}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
      >
        {config.sub}
      </Text>
    </group>
  )
}

function Cube({
  selectedFace,
  onFaceSelect,
}: {
  selectedFace: FaceLabel | null
  onFaceSelect: (label: FaceLabel) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current && !selectedFace) {
      groupRef.current.rotation.y += delta * 0.2
    }
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0} />
      </mesh>
      {FACE_CONFIG.map((face) => (
        <FacePlane
          key={face.label}
          config={face}
          onSelect={onFaceSelect}
          isSelected={selectedFace === face.label}
        />
      ))}
    </group>
  )
}

const FACE_META: Record<FaceLabel, { title: string; placeholder: string; emoji: string }> = {
  OUTPUT:   { emoji: '🟢', title: '앞면 — Output (Green)',  placeholder: '내가 가진 기술, 자원, 공급할 수 있는 것을 적어...' },
  INPUT:    { emoji: '🟡', title: '뒷면 — Input (Yellow)',  placeholder: '상대방이 원하는 것, 내가 필요한 것을 적어...' },
  BARRIER:  { emoji: '🔴', title: '왼면 — Barrier (Red)',   placeholder: '해결해야 할 문제, 규제, 리스크를 적어...' },
  LOGIC:    { emoji: '🔵', title: '오른면 — Logic (Blue)',  placeholder: 'A와 B를 잇는 전략적 근거를 적어...' },
  IDENTITY: { emoji: '⚪', title: '윗면 — Identity (White)',placeholder: '이 블록의 이름과 핵심 정의를 적어...' },
  HISTORY:  { emoji: '⚫', title: '밑면 — History (Black)', placeholder: '증거 데이터, 과거 지표를 적어...' },
}

export default function LegoCubeScene() {
  const [selectedFace, setSelectedFace] = useState<FaceLabel | null>(null)
  const [faceData, setFaceData] = useState<Record<FaceLabel, string>>({
    OUTPUT: '', INPUT: '', BARRIER: '', LOGIC: '', IDENTITY: '', HISTORY: '',
  })

  const handleFaceSelect = (label: FaceLabel) =>
    setSelectedFace((prev) => (prev === label ? null : label))

  const filledCount = Object.values(faceData).filter((v) => v.trim().length > 0).length
  const lodPercent = [0, 10, 20, 40, 55, 70, 100][filledCount] ?? 100

  return (
    <div className="flex h-screen w-full text-white overflow-hidden" style={{ background: '#121212' }}>
      {/* 3D 캔버스 영역 */}
      <div className="flex-1 relative">
        <Canvas
          camera={{ position: [3.5, 2.5, 3.5], fov: 50 }}
          style={{ background: '#121212' }}
        >
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 5, 5]} intensity={0.5} />
          <directionalLight position={[-5, -3, -3]} intensity={0.2} />
          <Cube selectedFace={selectedFace} onFaceSelect={handleFaceSelect} />
          <OrbitControls enablePan={false} minDistance={4} maxDistance={9} />
        </Canvas>

        {/* LOD 진행 배지 */}
        <div
          className="absolute top-5 left-5 rounded-xl px-4 py-2 border border-white/10 backdrop-blur"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <p className="text-xs text-slate-400 mb-1">LOD 완성도</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-36 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${lodPercent}%`,
                  background: `hsl(${lodPercent * 1.2}, 80%, 55%)`,
                }}
              />
            </div>
            <span className="text-sm font-bold">{lodPercent}%</span>
          </div>
        </div>

        {/* 하단 안내 */}
        {!selectedFace && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-500 text-sm animate-pulse">
            큐브 면을 클릭하면 내용을 입력할 수 있어요
          </div>
        )}
      </div>

      {/* 사이드 입력 패널 */}
      <div
        className={`transition-all duration-300 border-l border-white/10 overflow-hidden flex flex-col ${
          selectedFace ? 'w-80' : 'w-0'
        }`}
        style={{ background: '#1a1a1a' }}
      >
        {selectedFace && (
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-2xl">{FACE_META[selectedFace].emoji}</span>
                <h2 className="text-sm font-bold text-slate-200 mt-1">
                  {FACE_META[selectedFace].title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedFace(null)}
                className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <textarea
              className="flex-1 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 resize-none border border-white/10 focus:border-indigo-500 focus:outline-none transition-colors"
              style={{ background: '#242424' }}
              placeholder={FACE_META[selectedFace].placeholder}
              value={faceData[selectedFace]}
              onChange={(e) =>
                setFaceData((prev) => ({ ...prev, [selectedFace]: e.target.value }))
              }
            />

            <button
              onClick={() => setSelectedFace(null)}
              className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-xl py-2.5 text-sm font-semibold"
            >
              저장
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
