'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Canvas, useFrame, ThreeEvent, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import { supabase } from '@/lib/supabase'
import { useStrategyStore, MODE_CONFIG } from '@/lib/store'
import EfficiencyHUD from '@/components/hud/EfficiencyHUD'
import StrategySlider from '@/components/hud/StrategySlider'
import OracleSystem, { type OracleResult } from '@/components/hud/OracleSystem'

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
  is_root: boolean
  is_goal: boolean
  risk: number
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
  OUTPUT:   { emoji: '🟢', title: '앞면 — Output',   placeholder: '내가 가진 기술, 자원, 공급할 수 있는 것을 적어...' },
  INPUT:    { emoji: '🟡', title: '뒷면 — Input',    placeholder: '상대방이 원하는 것, 내가 필요한 것을 적어...' },
  BARRIER:  { emoji: '🔴', title: '왼면 — Barrier',  placeholder: '해결해야 할 문제, 규제, 리스크를 적어...' },
  LOGIC:    { emoji: '🔵', title: '오른면 — Logic',  placeholder: 'A와 B를 잇는 전략적 근거를 적어...' },
  IDENTITY: { emoji: '⚪', title: '윗면 — Identity', placeholder: '이 블록의 이름과 핵심 정의를 적어...' },
  HISTORY:  { emoji: '⚫', title: '밑면 — History',  placeholder: '증거 데이터, 과거 지표를 적어...' },
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

function getSpawnPos(idx: number) {
  return { x: (idx % 3) * 6, y: 0, z: Math.floor(idx / 3) * 6 }
}

// ─── Graph Logic ──────────────────────────────────────────────────────────────

/**
 * 활성화 상태 계산:
 * - is_root 큐브는 항상 활성
 * - 들어오는 연결이 없는 큐브도 활성
 * - 나머지: 모든 선행 큐브(predecessor)가 활성이어야 활성 (AND 조건)
 */
function computeActiveStates(cubes: CubeRow[], conns: ConnRow[]): Set<string> {
  const active = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const cube of cubes) {
      if (active.has(cube.id)) continue
      const incoming = conns.filter(c => c.to_cube_id === cube.id)
      const ok = cube.is_root
        || incoming.length === 0
        || incoming.every(c => active.has(c.from_cube_id))
      if (ok) { active.add(cube.id); changed = true }
    }
  }
  return active
}

/** 사이클 방지 DFS: from → to 까지의 모든 경로 반환 */
function findAllPaths(
  from: string, to: string,
  conns: ConnRow[], visited: Set<string>
): string[][] {
  if (from === to) return [[to]]
  if (visited.has(from)) return []
  const paths: string[][] = []
  for (const c of conns.filter(c => c.from_cube_id === from)) {
    for (const sub of findAllPaths(c.to_cube_id, to, conns, new Set([...visited, from]))) {
      paths.push([from, ...sub])
    }
  }
  return paths
}

/**
 * Critical Path 알고리즘:
 * ROOT → GOAL 까지의 모든 경로 중 risk 합계가 가장 높은 경로를 반환
 */
function computeCriticalPath(cubes: CubeRow[], conns: ConnRow[]): string[] {
  const goal  = cubes.find(c => c.is_goal)
  const roots = cubes.filter(c => c.is_root)
  if (!goal || roots.length === 0) return []
  const riskOf = Object.fromEntries(cubes.map(c => [c.id, c.risk]))
  let maxRisk = -Infinity
  let result: string[] = []
  for (const root of roots) {
    for (const path of findAllPaths(root.id, goal.id, conns, new Set())) {
      const total = path.reduce((s, id) => s + (riskOf[id] ?? 0), 0)
      if (total > maxRisk) { maxRisk = total; result = path }
    }
  }
  return result
}

/** Critical Path에 포함된 연결선 ID 집합 */
function getCriticalConnIds(path: string[], conns: ConnRow[]): Set<string> {
  const ids = new Set<string>()
  for (let i = 0; i < path.length - 1; i++) {
    const c = conns.find(c => c.from_cube_id === path[i] && c.to_cube_id === path[i + 1])
    if (c) ids.add(c.id)
  }
  return ids
}

// ─── Port ─────────────────────────────────────────────────────────────────────

function Port({ faceLabel, cubeId, isConnecting, isSource, onPortClick }: {
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
    const t = hovered || isSource ? 1.5 : 1.0
    ref.current.scale.lerp(new THREE.Vector3(t, t, t), dt * 8)
  })

  const color = isSource ? '#6366f1'
    : hovered && isConnecting ? '#22c55e'
    : faceLabel === 'IDENTITY' ? '#0f172a' : '#ffffff'

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

function FacePlane({ config, cubeId, connecting, isActive, onFaceClick, onPortClick }: {
  config: typeof FACE_CONFIG[0]
  cubeId: string
  connecting: ConnectingState | null
  isActive: boolean
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
          transparent
          opacity={isActive ? 1 : 0.2}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <Port
        faceLabel={config.label as FaceLabel}
        cubeId={cubeId}
        isConnecting={!!connecting}
        isSource={!!isSource}
        onPortClick={onPortClick}
      />

      <Text
        position={[0, 0.5, 0.01]} fontSize={0.2}
        color={config.label === 'IDENTITY' ? (isActive ? '#0f172a' : '#1e293b') : (isActive ? '#ffffff' : '#374151')}
        anchorX="center" anchorY="middle" letterSpacing={0.05}
      >
        {config.label}
      </Text>
      <Text
        position={[0, 0.22, 0.01]} fontSize={0.13}
        color={config.label === 'IDENTITY' ? (isActive ? '#334155' : '#1e293b') : (isActive ? '#e2e8f0' : '#2d3748')}
        anchorX="center" anchorY="middle" letterSpacing={0.02}
      >
        {config.sub}
      </Text>
    </group>
  )
}

// ─── CubeInstance ─────────────────────────────────────────────────────────────

function CubeInstance({ cube, connecting, isActive, isOnCritPath, onFaceClick, onPortClick }: {
  cube: CubeRow
  connecting: ConnectingState | null
  isActive: boolean
  isOnCritPath: boolean
  onFaceClick: (cubeId: string, face: FaceLabel) => void
  onPortClick: (cubeId: string, face: FaceLabel) => void
}) {
  return (
    <group position={[cube.position_x, cube.position_y, cube.position_z]}>
      {/* 큐브 본체 */}
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color={isActive ? '#0f172a' : '#07070f'} roughness={0.9} metalness={0} />
      </mesh>

      {/* ROOT 표시 — 초록 링 */}
      {cube.is_root && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.58, 0.055, 8, 48]} />
          <meshStandardMaterial color="#22c55e" roughness={0.5} metalness={0} />
        </mesh>
      )}

      {/* GOAL 표시 — 금색 링 */}
      {cube.is_goal && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.7, 0.055, 8, 48]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.5} metalness={0} />
        </mesh>
      )}

      {/* Critical Path 표시 — 빨간 링 */}
      {isOnCritPath && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.82, 0.04, 8, 48]} />
          <meshStandardMaterial color="#ef4444" roughness={0.5} metalness={0} />
        </mesh>
      )}

      {/* 비활성 잠금 오버레이 */}
      {!isActive && (
        <mesh scale={[1.005, 1.005, 1.005]}>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial
            color="#000000" transparent opacity={0.6}
            depthWrite={false} side={THREE.BackSide}
          />
        </mesh>
      )}

      {FACE_CONFIG.map(face => (
        <FacePlane
          key={face.label}
          config={face}
          cubeId={cube.id}
          connecting={connecting}
          isActive={isActive}
          onFaceClick={onFaceClick}
          onPortClick={onPortClick}
        />
      ))}
    </group>
  )
}

// ─── DragLine ─────────────────────────────────────────────────────────────────

const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

function DragLine({ connecting }: { connecting: ConnectingState | null }) {
  const [end, setEnd] = useState(() => new THREE.Vector3())
  const { raycaster, camera, gl } = useThree()

  useEffect(() => {
    if (!connecting) return
    const el = gl.domElement
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1
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
      color="#6366f1" lineWidth={1.5}
      dashed dashScale={5} dashSize={0.3} gapSize={0.2}
    />
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

export default function Board() {
  const [cubes, setCubes]           = useState<CubeRow[]>([])
  const [connections, setConnections] = useState<ConnRow[]>([])
  const [isLoading, setIsLoading]   = useState(true)
  const [selectedFaceInfo, setSelectedFaceInfo] = useState<{ cubeId: string; face: FaceLabel } | null>(null)
  const [connecting, setConnecting] = useState<ConnectingState | null>(null)
  const [editText, setEditText]     = useState('')
  const [localRisk, setLocalRisk]   = useState(0.3)
  const [isSaving, setIsSaving]     = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // ── Graph 계산 (메모이제이션) ────────────────────────────────────────────────
  const activeSet       = useMemo(() => computeActiveStates(cubes, connections),        [cubes, connections])
  const criticalPath    = useMemo(() => computeCriticalPath(cubes, connections),         [cubes, connections])
  const criticalConnIds = useMemo(() => getCriticalConnIds(criticalPath, connections),   [criticalPath, connections])
  const critPathSet     = useMemo(() => new Set(criticalPath),                           [criticalPath])

  // ── Strategy & Efficiency (Zustand) ──────────────────────────────────────────
  const { modeIndex } = useStrategyStore()

  const efficiencyData = useMemo(() => {
    const modeWeight = MODE_CONFIG[modeIndex].weight

    // Total Gain: 활성 큐브 간 OUTPUT/INPUT 포트 연결 수 × 10
    const totalGain = connections.filter(c => {
      const bothActive  = activeSet.has(c.from_cube_id) && activeSet.has(c.to_cube_id)
      const isGainPort  = c.from_face === 'OUTPUT' || c.from_face === 'INPUT'
                       || c.to_face   === 'OUTPUT' || c.to_face   === 'INPUT'
      return bothActive && isGainPort
    }).length * 10

    // Total Step Count: 활성 큐브 개수
    const stepCount = activeSet.size

    // Critical Path Risk Sum
    const critRisk = criticalPath.reduce(
      (s, id) => s + (cubes.find(c => c.id === id)?.risk ?? 0), 0
    )

    // Efficiency Score = (Total Gain × Mode Weight) / (Step Count + Crit Risk)
    const denominator = stepCount + critRisk
    const score = denominator > 0 ? (totalGain * modeWeight) / denominator : 0

    return { score, totalGain, stepCount, critRisk, modeWeight }
  }, [connections, activeSet, criticalPath, cubes, modeIndex])

  const selectedCube = selectedFaceInfo ? cubes.find(c => c.id === selectedFaceInfo.cubeId) : null

  // ── 초기 로드 + 실시간 ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [{ data: cd }, { data: nd }] = await Promise.all([
        supabase.from('cubes').select('*').eq('board_id', BOARD_ID).order('created_at'),
        supabase.from('connections').select('*').eq('board_id', BOARD_ID),
      ])
      if (cd) setCubes(cd)
      if (nd) setConnections(nd)
      setIsLoading(false)
    }
    load()

    const cubeCh = supabase.channel('cubes_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cubes' }, ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT') setCubes(p => [...p, n as CubeRow])
        if (eventType === 'UPDATE') setCubes(p => p.map(c => c.id === (n as CubeRow).id ? n as CubeRow : c))
        if (eventType === 'DELETE') setCubes(p => p.filter(c => c.id !== (o as CubeRow).id))
      }).subscribe()

    const connCh = supabase.channel('conns_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT') setConnections(p => [...p, n as ConnRow])
        if (eventType === 'DELETE') setConnections(p => p.filter(c => c.id !== (o as ConnRow).id))
      }).subscribe()

    return () => { supabase.removeChannel(cubeCh); supabase.removeChannel(connCh) }
  }, [])

  // selectedCube 바뀌면 localRisk 동기화
  useEffect(() => {
    if (selectedCube) setLocalRisk(selectedCube.risk ?? 0.3)
  }, [selectedCube?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  const handleAddCube = async () => {
    const pos = getSpawnPos(cubes.length)
    const { data } = await supabase.from('cubes')
      .insert({ board_id: BOARD_ID, ...pos, is_root: false, is_goal: false, risk: 0.3 })
      .select().single()
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
    if (connecting.cubeId === cubeId && connecting.face === face) { setConnecting(null); return }

    supabase.from('connections').insert({
      board_id: BOARD_ID,
      from_cube_id: connecting.cubeId, from_face: connecting.face,
      to_cube_id: cubeId, to_face: face,
    }).select().single().then(({ data }) => { if (data) setConnections(p => [...p, data]) })
    setConnecting(null)
  }, [connecting, cubes])

  const handleSaveFace = async () => {
    if (!selectedFaceInfo) return
    setIsSaving(true)
    const col = selectedFaceInfo.face.toLowerCase()
    const { error } = await supabase.from('cubes')
      .update({ [col]: editText, updated_at: new Date().toISOString() })
      .eq('id', selectedFaceInfo.cubeId)
    setIsSaving(false)
    if (error) { setSaveStatus('error') } else {
      setCubes(p => p.map(c => c.id === selectedFaceInfo.cubeId ? { ...c, [col]: editText } : c))
      setSaveStatus('saved')
      setTimeout(() => { setSaveStatus('idle'); setSelectedFaceInfo(null) }, 800)
    }
  }

  const toggleCubeProp = async (prop: 'is_root' | 'is_goal') => {
    if (!selectedCube) return
    const val = !selectedCube[prop]
    await supabase.from('cubes').update({ [prop]: val }).eq('id', selectedCube.id)
    setCubes(p => p.map(c => c.id === selectedCube.id ? { ...c, [prop]: val } : c))
  }

  const saveRisk = async (risk: number) => {
    if (!selectedCube) return
    await supabase.from('cubes').update({ risk }).eq('id', selectedCube.id)
    setCubes(p => p.map(c => c.id === selectedCube.id ? { ...c, risk } : c))
  }

  // Critical Path 통계
  const critTotalRisk = criticalPath.reduce((s, id) => s + (cubes.find(c => c.id === id)?.risk ?? 0), 0)
  const critAvgRisk   = criticalPath.length > 0 ? (critTotalRisk / criticalPath.length) * 100 : 0

  // ── Oracle Sync 핸들러 ────────────────────────────────────────────────────

  const BAD_TEMPLATES = [
    (n: string) => `🚨 오라클 경고: 빅테크의 AI 학습 데이터 규제안 발표! [${n}]의 Risk가 급증했습니다.`,
    (n: string) => `🚨 오라클 경고: 글로벌 금리 인상 우려로 투자 심리 냉각! [${n}]에 위험 신호 감지.`,
    (n: string) => `🚨 오라클 경고: 경쟁사 유사 제품 출시 임박! [${n}]의 시장 포지션이 위협받고 있습니다.`,
    (n: string) => `🚨 오라클 경고: 핵심 규제 기관의 감사 착수 예정! [${n}] 실행 전 법적 검토 필요.`,
  ]
  const GOOD_TEMPLATES = [
    (n: string) => `📈 오라클 분석: 중기부 딥테크 지원금 예산 확대! [${n}]의 가치가 상승했습니다.`,
    (n: string) => `📈 오라클 분석: 해당 분야 VC 투자 급증! [${n}]의 성장 가능성이 재평가됐습니다.`,
    (n: string) => `📈 오라클 분석: 정부 R&D 인센티브 확대 발표! [${n}]에 유리한 시장 환경이 조성됐습니다.`,
    (n: string) => `📈 오라클 분석: 글로벌 파트너십 체결 기회 포착! [${n}]의 레버리지 효과 증대 예상.`,
  ]

  const handleOracleSync = useCallback(async (): Promise<OracleResult> => {
    // 활성 큐브 중 랜덤 1~2개 선정
    const activeCubes = cubes.filter(c => activeSet.has(c.id))
    if (activeCubes.length === 0) {
      return { type: 'good', message: '📡 오라클: 분석 가능한 활성 큐브가 없습니다. 큐브를 추가하세요.' }
    }

    const shuffled = [...activeCubes].sort(() => Math.random() - 0.5)
    const targets  = shuffled.slice(0, Math.min(2, 1 + Math.floor(Math.random() * 2)))
    const isBad    = Math.random() > 0.45 // 55% 악재, 45% 호재

    // Supabase + 로컬 상태 동시 업데이트
    for (const cube of targets) {
      const newRisk = isBad
        ? Math.min(1.0,  cube.risk + 0.15 + Math.random() * 0.35)
        : Math.max(0.05, cube.risk - 0.12 - Math.random() * 0.25)

      await supabase.from('cubes').update({ risk: newRisk }).eq('id', cube.id)
      setCubes(prev => prev.map(c => c.id === cube.id ? { ...c, risk: newRisk } : c))
    }

    // 대표 큐브 이름 (IDENTITY 면 내용 or 순번)
    const primary   = targets[0]
    const cubeName  = primary.identity?.trim() || `Cube ${cubes.findIndex(c => c.id === primary.id) + 1}`
    const templates = isBad ? BAD_TEMPLATES : GOOD_TEMPLATES
    const message   = templates[Math.floor(Math.random() * templates.length)](cubeName)

    return { type: isBad ? 'bad' : 'good', message }
  }, [cubes, activeSet, setCubes])

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
            isActive={activeSet.has(cube.id)}
            isOnCritPath={critPathSet.has(cube.id)}
            onFaceClick={handleFaceClick}
            onPortClick={handlePortClick}
          />
        ))}

        {connections.map(conn => {
          const from = cubes.find(c => c.id === conn.from_cube_id)
          const to   = cubes.find(c => c.id === conn.to_cube_id)
          if (!from || !to) return null
          const isCrit = criticalConnIds.has(conn.id)
          const fromActive = activeSet.has(conn.from_cube_id)
          const toActive   = activeSet.has(conn.to_cube_id)
          return (
            <Line
              key={conn.id}
              points={[getPortWorldPos(from, conn.from_face as FaceLabel), getPortWorldPos(to, conn.to_face as FaceLabel)]}
              color={isCrit ? '#ef4444' : (fromActive && toActive) ? '#6366f1' : '#2d2d3d'}
              lineWidth={isCrit ? 3 : (fromActive && toActive) ? 1.5 : 1}
            />
          )
        })}

        <DragLine connecting={connecting} />
        <OrbitControls enablePan minDistance={3} maxDistance={40} enableRotate={!connecting} enableZoom />
      </Canvas>

      {/* ── Efficiency HUD (범례 통합) ── */}
      <EfficiencyHUD data={efficiencyData} />

      {/* ── Strategy Spectrum Slider ── */}
      <StrategySlider />

      {/* ── Oracle Sync System ── */}
      <OracleSystem onSync={handleOracleSync} />

      {/* ── Add Cube ── */}
      <button
        onClick={handleAddCube}
        className="absolute bottom-6 left-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all rounded-xl px-4 py-3 text-sm font-semibold shadow-lg"
      >
        <span>＋</span> Add Cube
      </button>

      {/* ── 큐브 없을 때 ── */}
      {cubes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-slate-500 text-sm">아직 큐브가 없어요</p>
            <p className="text-slate-600 text-xs mt-1">좌측 하단 Add Cube 버튼을 눌러 시작하세요</p>
          </div>
        </div>
      )}

      {/* ── 연결 모드 배너 ── */}
      {connecting && (
        <div
          className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl px-5 py-2.5 text-sm border border-indigo-500/40 backdrop-blur select-none"
          style={{ background: 'rgba(99,102,241,0.12)' }}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-indigo-300">연결할 다른 큐브의 포트를 클릭하세요</span>
          <button onClick={() => setConnecting(null)} className="text-slate-500 hover:text-white ml-1">취소 (Esc)</button>
        </div>
      )}

      {/* ── Critical Path 패널 ── */}
      {criticalPath.length > 0 && (
        <div
          className="absolute bottom-6 left-24 rounded-xl px-5 py-3 border border-red-500/30 backdrop-blur text-xs max-w-lg"
          style={{ background: 'rgba(239,68,68,0.07)' }}
        >
          <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
            <span>⚠</span> Critical Path
            <span className="ml-auto text-slate-400 font-normal">
              평균 위험도: <span className="text-red-400 font-mono font-bold">{critAvgRisk.toFixed(0)}%</span>
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {criticalPath.map((id, i) => {
              const cube  = cubes.find(c => c.id === id)
              const label = cube?.identity?.trim() || `Cube ${cubes.findIndex(c => c.id === id) + 1}`
              const risk  = ((cube?.risk ?? 0) * 100).toFixed(0)
              return (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-red-700">→</span>}
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      cube?.is_goal ? 'bg-amber-500/20 text-amber-300' :
                      cube?.is_root ? 'bg-green-500/20 text-green-300' :
                      'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {label} <span className="text-red-400 font-mono">{risk}%</span>
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 사이드 패널 ── */}
      <div
        className={`absolute top-0 right-0 h-full transition-all duration-300 border-l border-white/10 overflow-hidden flex flex-col ${
          selectedFaceInfo && !connecting ? 'w-80' : 'w-0'
        }`}
        style={{ background: '#1a1a1a' }}
      >
        {selectedFaceInfo && !connecting && selectedCube && (
          <div className="p-5 flex flex-col h-full gap-4 overflow-y-auto">

            {/* ── Cube Settings ── */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Cube Settings
              </h3>

              {/* ROOT / GOAL 토글 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => toggleCubeProp('is_root')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    selectedCube.is_root
                      ? 'bg-green-600 text-white ring-1 ring-green-400 shadow-green-900 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  style={{ background: selectedCube.is_root ? undefined : '#242424' }}
                >
                  ○ ROOT
                </button>
                <button
                  onClick={() => toggleCubeProp('is_goal')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    selectedCube.is_goal
                      ? 'bg-amber-500 text-white ring-1 ring-amber-400 shadow-amber-900 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  style={{ background: selectedCube.is_goal ? undefined : '#242424' }}
                >
                  ◎ GOAL
                </button>
              </div>

              {/* Risk Factor 슬라이더 */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Risk Factor</span>
                  <span
                    className="font-mono font-bold"
                    style={{ color: `hsl(${(1 - localRisk) * 120}, 80%, 55%)` }}
                  >
                    {(localRisk * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={localRisk}
                  onChange={(e) => setLocalRisk(parseFloat(e.target.value))}
                  onMouseUp={(e) => saveRisk(parseFloat((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => saveRisk(parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>안전 (0%)</span><span>위험 (100%)</span>
                </div>
              </div>

              {/* 활성 상태 표시 */}
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${activeSet.has(selectedCube.id) ? 'bg-green-400' : 'bg-slate-600'}`}
                />
                <span className="text-xs text-slate-400">
                  {activeSet.has(selectedCube.id) ? '활성 — 선행 조건 충족' : '비활성 — 선행 큐브 미연결'}
                </span>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* ── Face Editor ── */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xl">{FACE_META[selectedFaceInfo.face].emoji}</span>
                <h2 className="text-xs font-bold text-slate-200 mt-1">{FACE_META[selectedFaceInfo.face].title}</h2>
              </div>
              <button
                onClick={() => setSelectedFaceInfo(null)}
                className="text-slate-500 hover:text-white transition-colors text-lg leading-none"
              >✕</button>
            </div>

            <textarea
              className="flex-1 min-h-[120px] rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 resize-none border border-white/10 focus:border-indigo-500 focus:outline-none transition-colors"
              style={{ background: '#242424' }}
              placeholder={FACE_META[selectedFaceInfo.face].placeholder}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />

            <button
              onClick={handleSaveFace}
              disabled={isSaving}
              className={`w-full transition-colors rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 ${
                saveStatus === 'saved' ? 'bg-green-600' :
                saveStatus === 'error' ? 'bg-red-600'   :
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
