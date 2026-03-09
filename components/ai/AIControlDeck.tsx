'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAIStore } from '@/lib/store'
import type { ParsedCubeSpec } from '@/lib/store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CubeContextData {
  name:     string
  green:    string
  yellow:   string
  red:      string
  blue:     string
  risk:     number
  position_x: number
  position_y: number
  position_z: number
}

interface Props {
  criticalPathCubes: CubeContextData[]
  selectedCube:      CubeContextData | null
  onSpawnAICube:     (
    spec:    ParsedCubeSpec,
    pos:     { x: number; y: number; z: number },
    mode:    'A' | 'B'
  ) => Promise<void>
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const AI_CSS = `
/* ── 로딩 오버레이 ─────────────────────────────────────── */
@keyframes ai-scan-x {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100vw); }
}
@keyframes ai-scan-y {
  0%   { top: -3px; opacity: 0; }
  5%   { opacity: 1; }
  95%  { opacity: 1; }
  100% { top: 100vh; opacity: 0; }
}
@keyframes ai-msg-cycle {
  0%,18%  { opacity: 1; transform: translateY(0); }
  20%,98% { opacity: 0; transform: translateY(-8px); }
  100%    { opacity: 1; transform: translateY(0); }
}
@keyframes ai-grid-pulse {
  0%,100% { opacity: 0.03; }
  50%     { opacity: 0.07; }
}
@keyframes ai-cursor-blink {
  0%,50% { opacity: 1; }
  51%,100%{ opacity: 0; }
}

/* ── 소환 이펙트 — Red Team ────────────────────────────── */
@keyframes redteam-flash {
  0%   { opacity: 0.7; }
  100% { opacity: 0; }
}
@keyframes redteam-ring {
  0%   { transform: translate(-50%,-50%) scale(0);   opacity: 0.9; }
  100% { transform: translate(-50%,-50%) scale(3.5); opacity: 0; }
}
@keyframes redteam-spark {
  0%   { transform: translate(-50%,-50%) scale(0.2) rotate(0deg);   opacity: 1; }
  60%  { opacity: 0.8; }
  100% { transform: translate(-50%,-50%) scale(1.8) rotate(120deg); opacity: 0; }
}

/* ── 소환 이펙트 — Lateral Jump ────────────────────────── */
@keyframes lateral-flash {
  0%   { opacity: 0.5; }
  100% { opacity: 0; }
}
@keyframes lateral-wormhole {
  0%   { transform: translate(-50%,-50%) scale(0); opacity: 1;   filter: blur(0px); }
  50%  { transform: translate(-50%,-50%) scale(2); opacity: 0.8; filter: blur(2px); }
  100% { transform: translate(-50%,-50%) scale(0.1); opacity: 0; filter: blur(8px); }
}
@keyframes lateral-ring-expand {
  0%   { transform: translate(-50%,-50%) scale(0.1); opacity: 0.9; }
  100% { transform: translate(-50%,-50%) scale(4);   opacity: 0; }
}

/* ── 버튼 ────────────────────────────────────────────────── */
@keyframes ai-btn-red-pulse {
  0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.35); }
  50%     { box-shadow: 0 0 22px rgba(239,68,68,0.75), 0 0 0 3px rgba(239,68,68,0.1); }
}
@keyframes ai-btn-blue-pulse {
  0%,100% { box-shadow: 0 0 8px rgba(99,102,241,0.35); }
  50%     { box-shadow: 0 0 22px rgba(99,102,241,0.75), 0 0 0 3px rgba(99,102,241,0.1); }
}
@keyframes ai-separator-glow {
  0%,100% { opacity: 0.2; }
  50%     { opacity: 0.5; }
}
`

// ─── 로딩 메시지 ──────────────────────────────────────────────────────────────

const MSGS_A = [
  'AI 에디톨로지스트가 당신의 논리를 해체 중입니다...',
  'Critical Path의 취약점을 스캔하는 중...',
  '레드팀 공격 벡터를 계산 중...',
  '비즈니스 허점과 규제 리스크를 분석 중...',
]

const MSGS_B = [
  '수평 도약 경로를 탐색 중입니다...',
  '타 산업군에서 유사 패턴을 탐색 중...',
  'AI 에디톨로지스트가 영역 간 연결고리를 파악 중...',
  '전혀 다른 세계에서 해답을 찾는 중...',
]

// ─── Loading Overlay ──────────────────────────────────────────────────────────

function LoadingOverlay({ mode }: { mode: 'A' | 'B' }) {
  const [msgIdx, setMsgIdx] = useState(0)
  const msgs = mode === 'A' ? MSGS_A : MSGS_B
  const color = mode === 'A' ? '#ef4444' : '#6366f1'
  const bgTint = mode === 'A' ? 'rgba(60,0,0,0.35)' : 'rgba(10,0,50,0.35)'

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % msgs.length), 1800)
    return () => clearInterval(t)
  }, [msgs.length])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'all',
      background: bgTint,
      backdropFilter: 'blur(2px)',
    }}>
      {/* 수평 스캔 라인 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '100%', overflow: 'hidden',
      }}>
        {[0, 0.3, 0.6].map((delay, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${color} 30%, white 50%, ${color} 70%, transparent 100%)`,
            boxShadow: `0 0 20px 6px ${color}55`,
            top: `${30 + i * 20}%`,
            animation: `ai-scan-x ${1.2 + delay}s ease-in-out infinite`,
            animationDelay: `${delay}s`,
            opacity: 0.6,
          }} />
        ))}
      </div>

      {/* 수직 스캔 라인 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 3, zIndex: 1,
        background: `linear-gradient(180deg, transparent, ${color} 40%, ${color} 60%, transparent)`,
        boxShadow: `0 0 30px 10px ${color}44`,
        animation: `ai-scan-y 2.2s cubic-bezier(0.4,0,0.6,1) infinite`,
      }} />

      {/* 그리드 */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: [
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, transparent 1px, transparent 6px)',
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, transparent 1px, transparent 40px)',
        ].join(', '),
        animation: 'ai-grid-pulse 0.2s linear infinite',
      }} />

      {/* 코너 장식 */}
      {[
        { top: 20, left: 20,   borderTop: `2px solid ${color}`, borderLeft:  `2px solid ${color}` },
        { top: 20, right: 20,  borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
        { bottom: 20, left: 20,  borderBottom: `2px solid ${color}`, borderLeft:  `2px solid ${color}` },
        { bottom: 20, right: 20, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...s }} />
      ))}

      {/* 중앙 메시지 */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.25em',
          color, textShadow: `0 0 20px ${color}`,
          marginBottom: 18,
          animation: 'ai-msg-cycle 1.8s ease-in-out infinite',
          whiteSpace: 'nowrap',
        }}>
          {msgs[msgIdx]}
        </div>

        {/* 프로그레스 도트 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: color,
              animation: `ai-cursor-blink 1s ease-in-out ${i * 0.18}s infinite`,
              boxShadow: `0 0 8px ${color}`,
            }} />
          ))}
        </div>

        <div style={{
          marginTop: 20,
          fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.3em',
        }}>
          {mode === 'A' ? '■ RED TEAM ANALYSIS IN PROGRESS ■' : '■ LATERAL JUMP COMPUTING ■'}
        </div>
      </div>
    </div>
  )
}

// ─── Spawn Effects ────────────────────────────────────────────────────────────

function RedTeamSpawnEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, pointerEvents: 'none' }}>
      {/* 풀스크린 플래시 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(200,0,0,0.25)',
        animation: 'redteam-flash 0.8s ease-out forwards',
      }} />
      {/* 중앙 링 */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 180, height: 180,
        border: '3px solid #ef4444',
        borderRadius: '50%',
        boxShadow: '0 0 40px #ef4444, inset 0 0 40px rgba(239,68,68,0.3)',
        animation: 'redteam-ring 0.7s ease-out forwards',
      }} />
      {/* 스파크 (다이아몬드 모양) */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 120, height: 120,
        border: '2px solid #fca5a5',
        transform: 'translate(-50%,-50%) rotate(45deg)',
        boxShadow: '0 0 30px #ef4444',
        animation: 'redteam-spark 0.9s ease-out forwards',
      }} />
      {/* 4방향 레이 */}
      {[0, 45, 90, 135].map(angle => (
        <div key={angle} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 2, height: 80,
          background: 'linear-gradient(to top, transparent, #ff4444)',
          transformOrigin: 'bottom center',
          transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          boxShadow: '0 0 8px #ef4444',
          animation: `redteam-ring 0.6s ease-out ${angle * 0.01}s forwards`,
        }} />
      ))}
    </div>
  )
}

function LateralJumpSpawnEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1100)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, pointerEvents: 'none' }}>
      {/* 풀스크린 플래시 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(30,0,120,0.22)',
        animation: 'lateral-flash 1s ease-out forwards',
      }} />
      {/* 웜홀 원 */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 200, height: 200,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.6) 0%, rgba(30,0,120,0.3) 50%, transparent 70%)',
        border: '2px solid #6366f1',
        boxShadow: '0 0 60px rgba(99,102,241,0.6), inset 0 0 60px rgba(99,102,241,0.3)',
        animation: 'lateral-wormhole 1s ease-in-out forwards',
      }} />
      {/* 외곽 확장 링 */}
      {[0, 0.15, 0.3].map((delay, i) => (
        <div key={i} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 80 + i * 40, height: 80 + i * 40,
          borderRadius: '50%',
          border: '1px solid rgba(99,102,241,0.6)',
          animation: `lateral-ring-expand 0.9s ease-out ${delay}s forwards`,
        }} />
      ))}
    </div>
  )
}

// ─── AI Control Deck (메인) ───────────────────────────────────────────────────

export default function AIControlDeck({ criticalPathCubes, selectedCube, onSpawnAICube }: Props) {
  const { isAILoading, aiMode, setIsAILoading } = useAIStore()
  const [spawnEffect, setSpawnEffect]           = useState<'A' | 'B' | null>(null)
  const [errorMsg, setErrorMsg]                 = useState<string | null>(null)
  const abortRef = useRef(false)

  // ── API 호출 공통 로직 ───────────────────────────────────────────────────
  const callAPI = useCallback(async (
    mode: 'A' | 'B',
    contextData: CubeContextData[],
    spawnPos: { x: number; y: number; z: number }
  ) => {
    if (isAILoading) return
    abortRef.current = false
    setIsAILoading(true, mode)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/editology', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode, contextData }),
      })

      if (abortRef.current) return

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'API 오류')

      const { cube } = json as {
        cube: { name: string; green: string; yellow: string; red: string; blue: string }
      }

      // spec 변환 (InboxPanel과 동일한 ParsedCubeSpec 형식)
      const spec: ParsedCubeSpec = {
        name:   cube.name,
        green:  cube.green,
        yellow: cube.yellow,
        red:    cube.red,
        blue:   cube.blue,
      }

      setIsAILoading(false)
      setSpawnEffect(mode)

      // 큐브 소환
      await onSpawnAICube(spec, spawnPos, mode)

    } catch (err) {
      if (!abortRef.current) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류'
        setErrorMsg(msg)
        setTimeout(() => setErrorMsg(null), 5000)
      }
      setIsAILoading(false)
    }
  }, [isAILoading, setIsAILoading, onSpawnAICube])

  // ── Mode A: Red Team ──────────────────────────────────────────────────────
  const handleRedTeam = useCallback(() => {
    if (criticalPathCubes.length === 0) {
      setErrorMsg('Critical Path 큐브가 없습니다. Root와 Goal을 지정하고 연결해주세요.')
      setTimeout(() => setErrorMsg(null), 4000)
      return
    }

    // 씬 중앙 계산
    const cx = criticalPathCubes.reduce((s, c) => s + c.position_x, 0) / criticalPathCubes.length
    const cz = criticalPathCubes.reduce((s, c) => s + c.position_z, 0) / criticalPathCubes.length

    const contextData = criticalPathCubes.map(c => ({
      name: c.name, green: c.green, yellow: c.yellow,
      red: c.red, blue: c.blue, risk: c.risk,
      position_x: c.position_x, position_y: c.position_y, position_z: c.position_z,
    }))

    callAPI('A', contextData, { x: cx + (Math.random() - 0.5) * 3, y: 0, z: cz + (Math.random() - 0.5) * 3 })
  }, [criticalPathCubes, callAPI])

  // ── Mode B: Lateral Jump ─────────────────────────────────────────────────
  const handleLateralJump = useCallback(() => {
    if (!selectedCube) return

    const contextData: CubeContextData[] = [{
      name: selectedCube.name, green: selectedCube.green,
      yellow: selectedCube.yellow, red: selectedCube.red,
      blue: selectedCube.blue, risk: selectedCube.risk,
      position_x: selectedCube.position_x, position_y: selectedCube.position_y, position_z: selectedCube.position_z,
    }]

    // 선택된 큐브 바로 옆에 스폰
    const spawnPos = {
      x: selectedCube.position_x + 6,
      y: selectedCube.position_y,
      z: selectedCube.position_z + (Math.random() - 0.5) * 2,
    }

    callAPI('B', contextData, spawnPos)
  }, [selectedCube, callAPI])

  const canRedTeam    = criticalPathCubes.length > 0 && !isAILoading
  const canLateralJump = !!selectedCube && !isAILoading

  return (
    <>
      <style>{AI_CSS}</style>

      {/* ── 로딩 오버레이 ─────────────────────────────────────── */}
      {isAILoading && aiMode && <LoadingOverlay mode={aiMode} />}

      {/* ── 소환 이펙트 ────────────────────────────────────────── */}
      {spawnEffect === 'A' && <RedTeamSpawnEffect onDone={() => setSpawnEffect(null)} />}
      {spawnEffect === 'B' && <LateralJumpSpawnEffect onDone={() => setSpawnEffect(null)} />}

      {/* ── 에러 메시지 ────────────────────────────────────────── */}
      {errorMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 180, fontFamily: 'monospace', fontSize: 11,
          background: 'rgba(60,0,0,0.95)',
          border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: 10, padding: '10px 18px',
          color: '#fca5a5', backdropFilter: 'blur(12px)',
          maxWidth: 480, textAlign: 'center',
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── 버튼 그룹 ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>

        {/* 구분선 */}
        <div style={{
          width: '100%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
          animation: 'ai-separator-glow 2s ease-in-out infinite',
          margin: '2px 0',
        }} />
        <div style={{ fontFamily: 'monospace', fontSize: 7, color: '#374151', letterSpacing: '0.15em', textAlign: 'right' }}>
          ◈ AI EDITOLOGY ENGINE
        </div>

        {/* Mode A — Red Team */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleRedTeam}
            disabled={!canRedTeam}
            title={criticalPathCubes.length === 0 ? 'Root→Goal Critical Path를 먼저 구성하세요' : '현재 논리의 치명적 허점을 공격합니다'}
            style={{
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              padding: '9px 16px', borderRadius: 10,
              border: `1px solid ${canRedTeam ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.2)'}`,
              background: canRedTeam ? 'rgba(40,0,0,0.9)' : 'rgba(20,0,0,0.6)',
              color: canRedTeam ? '#fca5a5' : '#4b2222',
              cursor: canRedTeam ? 'pointer' : 'not-allowed',
              backdropFilter: 'blur(14px)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              transition: 'all 0.25s',
              animation: canRedTeam ? 'ai-btn-red-pulse 2.5s ease-in-out infinite' : 'none',
            }}
          >
            🔥 논리 타격 (Red Team)
          </button>
          {canRedTeam && (
            <div style={{
              position: 'absolute', top: -12, right: 4,
              fontFamily: 'monospace', fontSize: 7, color: '#7f1d1d', letterSpacing: '0.1em',
            }}>
              Path {criticalPathCubes.length}개 분석
            </div>
          )}
        </div>

        {/* Mode B — Lateral Jump */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleLateralJump}
            disabled={!canLateralJump}
            title={!selectedCube ? '큐브 면을 클릭하여 선택하세요' : '이 큐브를 다른 산업 시각으로 확장합니다'}
            style={{
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              padding: '9px 16px', borderRadius: 10,
              border: `1px solid ${canLateralJump ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.2)'}`,
              background: canLateralJump ? 'rgba(10,0,40,0.9)' : 'rgba(5,0,20,0.6)',
              color: canLateralJump ? '#a5b4fc' : '#1e1b4b',
              cursor: canLateralJump ? 'pointer' : 'not-allowed',
              backdropFilter: 'blur(14px)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              transition: 'all 0.25s',
              animation: canLateralJump ? 'ai-btn-blue-pulse 2.5s ease-in-out infinite' : 'none',
            }}
          >
            🌌 수평 도약 (Lateral Jump)
          </button>
          <div style={{
            position: 'absolute', top: -12, right: 4,
            fontFamily: 'monospace', fontSize: 7, letterSpacing: '0.1em',
            color: canLateralJump ? '#312e81' : '#1e1b4b',
          }}>
            {selectedCube ? `"${selectedCube.name || '?'}" 선택됨` : '큐브 선택 필요'}
          </div>
        </div>

      </div>
    </>
  )
}
