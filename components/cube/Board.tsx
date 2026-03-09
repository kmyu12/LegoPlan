'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Canvas, useFrame, ThreeEvent, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type FaceLabel = 'OUTPUT' | 'INPUT' | 'BARRIER' | 'LOGIC' | 'IDENTITY' | 'HISTORY'

interface CubeRow {
  id: string
  board_id: string
  position_x: number
  position_y: number
  position_z: number
  output: string
  input: string
  barrier: string
  logic: string
  identity: string
  history: string
}

interface ConnRow {
  id: string
  board_id: string
  from_cube_id: string
  from_face: string
  to_cube_id: string
  to_face: string
}

interface ConnectingState {
  cubeId: string
  face: FaceLabel
  worldPos: THREE.Vector3
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_ID = 'default'
const D = 1.002
const PORT_OFFSET = D + 0.12

const FACE_CONFIG = [
  { label: 'OUTPUT',   sub: '소유/공급',   color: '#22c55e', position: [D, 0, 0]  as [number,number,number], rotation: [0, Math.PI / 2, 0]  as [number,number,number] },
  { label: 'INPUT',    sub: '갈망/수요',   color: '#eab308', position: [-D, 0, 0] as [number,number,number], rotation: [0, -Math.PI / 2, 0] as [number,number,number] },
  { label: 'BARRIER',  sub: '결핍/위험',   color: '#ef4444', position: [0, 0, D]  as [number,number,number], rotation: [0, 0, 0]             as [number,number,number] },
  { label: 'LOGIC',    sub: '전략/연결',   color: '#3b82f6', position: [0, 0, -D] as [number,number,number], rotation: [0, Math.PI, 0]       as [number,number,number] },
  { label: 'IDENTITY', sub: '이름/정의',   color: '#f8fafc', position: [0, D, 0]  as [number,number,number], rotation: [-Math.PI / 2, 0, 0]  as [number,number,number] },
  { label: 'HISTORY',  sub: '증거/데이터', color: '#1e1e2e', position: [0, -D, 0] as [number,number,number], rotation: [Math.PI / 2, 0, 0]   as [number,number,number] },
]

const FACE_NORMALS: Record<FaceLabel, THREE.Vector3> = {
  OUTPUT:   new THREE.Vector3(1, 0, 0),
  INPUT:    new THREE.Vector3(-1, 0, 0),
  BARRIER:  new THREE.Vector3(0, 0, 1),
  LOGIC:    new THREE.Vector3(0, 0, -1),
  IDENTITY: new THREE.Vector3(0, 1, 0),
  HISTORY:  new THREE.Vector3(0, -1, 0),
}

const FACE_META: Record<FaceLabel, { title: string; placeholder: string; emoji: string }> = {
  OUTPUT:   { emoji: '🟢', title: '앞면 — Output (Green)',   placeholder: '내가 가진 기술, 자원, 공급할 수 있는 것을 적어...' },
  INPUT:    { emoji: '🟡', title: '뒷면 — Input (Yellow)',   placeholder: '상대방이 원하는 것, 내가 필요한 것을 적어...' },
  BARRIER:  { emoji: '🔴', title: '왼면 — Barrier (Red)',    placeholder: '해결해야 할 문제, 규제, 리스크를 적어...' },
  LOGIC:    { emoji: '🔵', title: '오른면 — Logic (Blue)',   placeholder: 'A와 B를 잇는 전략적 근거를 적어...' },
  IDENTITY: { emoji: '⚪', title: '윗면 — Identity (White)', placeholder: '이 블록의 이름과 핵심 정의를 적어...' },
  HISTORY:  { emoji: '⚫', title: '밑면 — History (Black)',  placeholder: '증거 데이터, 과거 지표를 적어...' },
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function getPortWorldPos(cube: CubeRow, face: FaceLabel): THREE.Vector3 {
  const n = FACE_NORMALS[face]
  return new THREE.Vector3(
    cube.position_x + n.x * PORT_OFFSET,
    cube.position_y + n.y * PORT_OFFSET,
    cube.position_z + n.z * PORT_OFFSET,
  )
}

function getSpawnPos(idx: number): { x: number; y: number; z: number } {
  const col = idx % 3
  const row = Math.floor(idx / 3)
  return { x: col * 6, y: 0, z: row * 6 }
}

// ─── Port (connection sphere on each face) ────────────────────────────────────

function Port({
  faceLabel,
  cubeId,
  isConnecting,
  isSource,
  onPortClick,
}: {
  faceLabel: FaceLabel
  cubeId: string
  isConnecting: boolean
  isSource: boolean
  onPortClick: (cubeId: string, face: FaceLabel) => void
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    if (!ref.current) return
    const target = hovered || isSource ? 1.5 : 1.0
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), dt * 8)
  })

  const color = isSource
    ? '#6366f1'
    : hovered && isConnecting
    ? '#22c55e'
    : faceLabel === 'IDENTITY'
    ? '#0f172a'
    : '#ffffff'

  return (
    <mesh
      ref={ref}
      position={[0, 0, 0.12]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPortClick(cubeId, faceLabel) }}
    >
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0} />
    </mesh>
  )
}

// ─── FacePlane ────────────────────────────────────────────────────────────────

function FacePlane({
  config,
  cubeId,
  connecting,
  onFaceClick,
  onPortClick,
}: {
  config: typeof FACE_CONFIG[0]
  cubeId: string
  connecting: ConnectingState | null
  onFaceClick: (cubeId: string, face: FaceLabel) => void
  onPortClick: (cubeId: string, face: FaceLabel) => void
}) {
  const isSource = connecting?.cubeId === cubeId && connecting?.face === (config.label as FaceLabel)

  return (
    <group position={config.position} rotation={config.rotation}>
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (!connecting) onFaceClick(cubeId, config.label as FaceLabel)
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

      {/* 연결 포트 */}
      <Port
        faceLabel={config.label as FaceLabel}
        cubeId={cubeId}
        isConnecting={!!connecting}
        isSource={!!isSource}
        onPortClick={onPortClick}
      />

      <Text
        position={[0, 0.5, 0.01]}
        fontSize={0.2}
        color={config.label === 'IDENTITY' ? '#0f172a' : '#ffffff'}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.05}
      >
        {config.label}
      </Text>
      <Text
        position={[0, 0.22, 0.01]}
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

// ─── CubeInstance ─────────────────────────────────────────────────────────────

function CubeInstance({
  cube,
  connecting,
  onFaceClick,
  onPortClick,
}: {
  cube: CubeRow
  connecting: ConnectingState | null
  onFaceClick: (cubeId: string, face: FaceLabel) => void
  onPortClick: (cubeId: string, face: FaceLabel) => void
}) {
  return (
    <group position={[cube.position_x, cube.position_y, cube.position_z]}>
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0} />
      </mesh>
      {FACE_CONFIG.map(face => (
        <FacePlane
          key={face.label}
          config={face}
          cubeId={cube.id}
          connecting={connecting}
          onFaceClick={onFaceClick}
          onPortClick={onPortClick}
        />
      ))}
    </group>
  )
}

// ─── DragLine: 연결 중 마우스를 따라다니는 임시 선 ───────────────────────────

const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

function DragLine({ connecting }: { connecting: ConnectingState | null }) {
  const [end, setEnd] = useState(() => new THREE.Vector3())
  const { raycaster, camera, gl } = useThree()

  useEffect(() => {
    if (!connecting) return
    const el = gl.domElement
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera)
      const hit = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(DRAG_PLANE, hit)) setEnd(hit.clone())
    }
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [connecting, raycaster, camera, gl])

  if (!connecting) return null

  return (
    <Line
      points={[connecting.worldPos, end]}
      color="#6366f1"
      lineWidth={1.5}
      dashed
      dashScale={5}
      dashSize={0.3}
      gapSize={0.2}
    />
  )
}

// ─── Board (main export) ──────────────────────────────────────────────────────

export default function Board() {
  const [cubes, setCubes] = useState<CubeRow[]>([])
  const [connections, setConnections] = useState<ConnRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFaceInfo, setSelectedFaceInfo] = useState<{ cubeId: string; face: FaceLabel } | null>(null)
  const [connecting, setConnecting] = useState<ConnectingState | null>(null)
  const [editText, setEditText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // ── 초기 로드 + 실시간 구독 ────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const [{ data: cubeData }, { data: connData }] = await Promise.all([
        supabase.from('cubes').select('*').eq('board_id', BOARD_ID).order('created_at'),
        supabase.from('connections').select('*').eq('board_id', BOARD_ID),
      ])
      if (cubeData) setCubes(cubeData)
      if (connData)  setConnections(connData)
      setIsLoading(false)
    }
    load()

    const cubeCh = supabase
      .channel('cubes_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cubes' }, (payload) => {
        if (payload.eventType === 'INSERT') setCubes(p => [...p, payload.new as CubeRow])
        if (payload.eventType === 'UPDATE') setCubes(p => p.map(c => c.id === payload.new.id ? payload.new as CubeRow : c))
        if (payload.eventType === 'DELETE') setCubes(p => p.filter(c => c.id !== (payload.old as CubeRow).id))
      })
      .subscribe()

    const connCh = supabase
      .channel('conns_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'INSERT') setConnections(p => [...p, payload.new as ConnRow])
        if (payload.eventType === 'DELETE') setConnections(p => p.filter(c => c.id !== (payload.old as ConnRow).id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(cubeCh)
      supabase.removeChannel(connCh)
    }
  }, [])

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  const handleAddCube = async () => {
    const pos = getSpawnPos(cubes.length)
    const { data } = await supabase
      .from('cubes')
      .insert({ board_id: BOARD_ID, position_x: pos.x, position_y: pos.y, position_z: pos.z })
      .select()
      .single()
    if (data) setCubes(p => [...p, data])
  }

  const handleFaceClick = (cubeId: string, face: FaceLabel) => {
    if (connecting) return
    const cube = cubes.find(c => c.id === cubeId)
    if (!cube) return
    setSelectedFaceInfo({ cubeId, face })
    setEditText((cube[face.toLowerCase() as keyof CubeRow] as string) ?? '')
    setSaveStatus('idle')
  }

  const handlePortClick = useCallback((cubeId: string, face: FaceLabel) => {
    setSelectedFaceInfo(null)

    if (!connecting) {
      const cube = cubes.find(c => c.id === cubeId)
      if (!cube) return
      setConnecting({ cubeId, face, worldPos: getPortWorldPos(cube, face) })
      return
    }

    // 같은 포트 → 취소
    if (connecting.cubeId === cubeId && connecting.face === face) {
      setConnecting(null)
      return
    }

    // 연결 생성
    const create = async () => {
      const { data } = await supabase.from('connections').insert({
        board_id: BOARD_ID,
        from_cube_id: connecting.cubeId,
        from_face: connecting.face,
        to_cube_id: cubeId,
        to_face: face,
      }).select().single()
      if (data) setConnections(p => [...p, data])
    }
    create()
    setConnecting(null)
  }, [connecting, cubes])

  const handleSave = async () => {
    if (!selectedFaceInfo) return
    setIsSaving(true)
    const col = selectedFaceInfo.face.toLowerCase()
    const { error } = await supabase
      .from('cubes')
      .update({ [col]: editText, updated_at: new Date().toISOString() })
      .eq('id', selectedFaceInfo.cubeId)
    setIsSaving(false)
    if (error) {
      setSaveStatus('error')
    } else {
      setCubes(p => p.map(c =>
        c.id === selectedFaceInfo.cubeId ? { ...c, [col]: editText } : c
      ))
      setSaveStatus('saved')
      setTimeout(() => { setSaveStatus('idle'); setSelectedFaceInfo(null) }, 800)
    }
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center" style={{ background: '#121212' }}>
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div
      className="relative h-screen w-full text-white overflow-hidden"
      style={{ background: '#121212', cursor: connecting ? 'crosshair' : 'default' }}
      onKeyDown={(e) => e.key === 'Escape' && setConnecting(null)}
      tabIndex={0}
    >
      {/* ── 3D Canvas ── */}
      <Canvas camera={{ position: [8, 6, 8], fov: 50 }} style={{ background: '#121212' }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />
        <directionalLight position={[-5, -3, -3]} intensity={0.2} />

        {cubes.map(cube => (
          <CubeInstance
            key={cube.id}
            cube={cube}
            connecting={connecting}
            onFaceClick={handleFaceClick}
            onPortClick={handlePortClick}
          />
        ))}

        {/* 확정된 연결선 */}
        {connections.map(conn => {
          const from = cubes.find(c => c.id === conn.from_cube_id)
          const to   = cubes.find(c => c.id === conn.to_cube_id)
          if (!from || !to) return null
          return (
            <Line
              key={conn.id}
              points={[
                getPortWorldPos(from, conn.from_face as FaceLabel),
                getPortWorldPos(to,   conn.to_face   as FaceLabel),
              ]}
              color="#6366f1"
              lineWidth={2}
            />
          )
        })}

        {/* 드래그 중 임시 선 */}
        <DragLine connecting={connecting} />

        <OrbitControls
          enablePan
          minDistance={3}
          maxDistance={40}
          enableRotate={!connecting}
          enableZoom
        />
      </Canvas>

      {/* ── Add Cube 버튼 ── */}
      <button
        onClick={handleAddCube}
        className="absolute bottom-6 left-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all rounded-xl px-4 py-3 text-sm font-semibold shadow-lg"
      >
        <span className="text-base">＋</span> Add Cube
      </button>

      {/* ── 큐브 없을 때 안내 ── */}
      {cubes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-slate-500 text-sm">아직 큐브가 없어요</p>
            <p className="text-slate-600 text-xs mt-1">좌측 하단 Add Cube 버튼을 눌러 시작하세요</p>
          </div>
        </div>
      )}

      {/* ── 연결 모드 안내 배너 ── */}
      {connecting && (
        <div
          className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl px-5 py-2.5 text-sm border border-indigo-500/40 backdrop-blur select-none"
          style={{ background: 'rgba(99,102,241,0.12)' }}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-indigo-300">연결할 다른 큐브의 포트를 클릭하세요</span>
          <button
            onClick={() => setConnecting(null)}
            className="text-slate-500 hover:text-white transition-colors ml-1"
          >
            취소 (Esc)
          </button>
        </div>
      )}

      {/* ── 사이드 패널 ── */}
      <div
        className={`absolute top-0 right-0 h-full transition-all duration-300 border-l border-white/10 overflow-hidden flex flex-col ${
          selectedFaceInfo && !connecting ? 'w-80' : 'w-0'
        }`}
        style={{ background: '#1a1a1a' }}
      >
        {selectedFaceInfo && !connecting && (
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-2xl">{FACE_META[selectedFaceInfo.face].emoji}</span>
                <h2 className="text-sm font-bold text-slate-200 mt-1">
                  {FACE_META[selectedFaceInfo.face].title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedFaceInfo(null)}
                className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <textarea
              className="flex-1 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 resize-none border border-white/10 focus:border-indigo-500 focus:outline-none transition-colors"
              style={{ background: '#242424' }}
              placeholder={FACE_META[selectedFaceInfo.face].placeholder}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />

            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`mt-4 w-full transition-colors rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 ${
                saveStatus === 'saved'  ? 'bg-green-600' :
                saveStatus === 'error'  ? 'bg-red-600'   :
                'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {isSaving ? '저장 중...' : saveStatus === 'saved' ? '✓ 저장됨' : saveStatus === 'error' ? '저장 실패' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
