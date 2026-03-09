'use client'

import { useState, useCallback } from 'react'
import { useDoomsdayStore, type ParsedCubeSpec, type PreMortemData } from '@/lib/store'

// ─── CSS ──────────────────────────────────────────────────────────────────────

const INBOX_CSS = `
@keyframes inbox-slide-in {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
@keyframes inbox-tab-pulse {
  0%, 100% { box-shadow: 2px 0 12px rgba(99,102,241,0.15); }
  50%       { box-shadow: 2px 0 24px rgba(99,102,241,0.40); }
}
@keyframes inbox-spawn-pop {
  0%   { transform: scale(0.92); opacity: 0; }
  60%  { transform: scale(1.04); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes inbox-err-shake {
  0%,100% { transform: translateX(0); }
  25%     { transform: translateX(-6px); }
  75%     { transform: translateX(6px); }
}
`

// ─── 파싱 유틸 ────────────────────────────────────────────────────────────────

function parseInboxJSON(raw: string): {
  cubes: ParsedCubeSpec[]
  preMortem: PreMortemData | null
  errors: string[]
} {
  const errors: string[] = []
  const cubes: ParsedCubeSpec[] = []
  let preMortem: PreMortemData | null = null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    errors.push('JSON 형식 오류: 올바른 JSON을 입력하세요.')
    return { cubes, preMortem, errors }
  }

  const items = Array.isArray(parsed) ? parsed : [parsed]

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>

    if (obj.type === 'pre_mortem') {
      if (!obj.fatal_cause || !obj.name) {
        errors.push('pre_mortem 항목에 name, fatal_cause 필드가 필요합니다.')
        continue
      }
      preMortem = {
        name:        String(obj.name),
        fatal_cause: String(obj.fatal_cause),
        risk_index:  typeof obj.risk_index === 'number' ? obj.risk_index : 50,
      }
    } else {
      // 일반 큐브: type이 "cube"이거나 type이 없는 경우 모두 수용
      cubes.push({
        name:   obj.name   ? String(obj.name)   : undefined,
        green:  obj.green  ? String(obj.green)  : undefined,
        yellow: obj.yellow ? String(obj.yellow) : undefined,
        red:    obj.red    ? String(obj.red)    : undefined,
        blue:   obj.blue   ? String(obj.blue)   : undefined,
        white:  obj.white  ? String(obj.white)  : undefined,
        black:  obj.black  ? String(obj.black)  : undefined,
      })
    }
  }

  if (cubes.length === 0 && !preMortem) {
    errors.push('인식된 큐브 또는 pre_mortem 데이터가 없습니다.')
  }

  return { cubes, preMortem, errors }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface InboxPanelProps {
  onSpawn: (specs: ParsedCubeSpec[]) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InboxPanel({ onSpawn }: InboxPanelProps) {
  const [isOpen,   setIsOpen]   = useState(false)
  const [raw,      setRaw]      = useState('')
  const [status,   setStatus]   = useState<'idle' | 'spawning' | 'done' | 'error'>('idle')
  const [message,  setMessage]  = useState('')
  const [preview,  setPreview]  = useState<{ cubes: number; hasPreMortem: boolean } | null>(null)

  // ⚠️ 파싱/소환 단계에서는 setPreMortemData 만 사용.
  // isDoomsdayActive / activateDoomsday 는 절대 호출하지 않음 — Kill Switch 전용
  const { setPreMortemData, preMortemData, resetDoomsday } = useDoomsdayStore()

  // ── 미리보기 (실시간 파싱) ────────────────────────────────────────────────
  const handleTextChange = useCallback((v: string) => {
    setRaw(v)
    if (!v.trim()) { setPreview(null); return }
    try {
      const { cubes, preMortem } = parseInboxJSON(v)
      setPreview({ cubes: cubes.length, hasPreMortem: !!preMortem })
    } catch {
      setPreview(null)
    }
  }, [])

  // ── 소환 ─────────────────────────────────────────────────────────────────
  const handleSpawn = useCallback(async () => {
    if (!raw.trim()) return
    const { cubes, preMortem, errors } = parseInboxJSON(raw)

    if (errors.length > 0 && cubes.length === 0 && !preMortem) {
      setStatus('error')
      setMessage(errors[0])
      setTimeout(() => setStatus('idle'), 3000)
      return
    }

    setStatus('spawning')

    // pre_mortem → Zustand 저장 (화면엔 안 띄움)
    if (preMortem) {
      setPreMortemData(preMortem)
    }

    // 일반 큐브 → 부모 콜백으로 Supabase 저장
    if (cubes.length > 0) {
      try {
        await onSpawn(cubes)
      } catch {
        setStatus('error')
        setMessage('큐브 생성 중 오류가 발생했습니다.')
        setTimeout(() => setStatus('idle'), 3000)
        return
      }
    }

    const parts: string[] = []
    if (cubes.length > 0) parts.push(`✅ 큐브 ${cubes.length}개 소환 완료!`)
    if (preMortem)         parts.push(`☠️ 사전 부검 데이터 탑재 완료`)
    setStatus('done')
    setMessage(parts.join('  '))
    setRaw('')
    setPreview(null)
    setTimeout(() => setStatus('idle'), 4000)
  }, [raw, onSpawn, setPreMortemData])

  return (
    <>
      <style>{INBOX_CSS}</style>

      {/* ── 탭 버튼 (접힌 상태) ─────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'absolute', left: 0, top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 30,
            background: 'rgba(2,6,18,0.92)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderLeft: 'none',
            borderRadius: '0 10px 10px 0',
            padding: '14px 10px',
            cursor: 'pointer',
            backdropFilter: 'blur(14px)',
            animation: 'inbox-tab-pulse 2.5s ease-in-out infinite',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontFamily: 'monospace',
            fontSize: 10,
            color: preMortemData ? '#fbbf24' : '#818cf8',
            letterSpacing: '0.1em',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{ fontSize: 14 }}>📥</span>
          <span>DATA INBOX</span>
          {preMortemData && (
            <span style={{ fontSize: 14, marginTop: 4 }}>☠️</span>
          )}
        </button>
      )}

      {/* ── 펼쳐진 패널 ──────────────────────────────────────────────── */}
      {isOpen && (
        <div style={{
          position: 'absolute', left: 0, top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 30,
          width: 280,
          background: 'rgba(2,6,18,0.95)',
          border: '1px solid rgba(99,102,241,0.35)',
          borderLeft: 'none',
          borderRadius: '0 14px 14px 0',
          padding: '16px 16px 16px 20px',
          backdropFilter: 'blur(20px)',
          boxShadow: '4px 0 40px rgba(99,102,241,0.12)',
          animation: 'inbox-slide-in 0.25s ease-out forwards',
        }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: '0.15em' }}>
                📥 DATA INBOX
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#374151', marginTop: 2, letterSpacing: '0.08em' }}>
                JSON → 3D Cube Spawner
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', fontSize: 16, padding: 0 }}
            >✕</button>
          </div>

          {/* JSON 예시 힌트 */}
          <details style={{ marginBottom: 10 }}>
            <summary style={{ fontFamily: 'monospace', fontSize: 8, color: '#4b5563', cursor: 'pointer', letterSpacing: '0.05em' }}>
              📋 JSON 형식 보기
            </summary>
            <pre style={{
              marginTop: 6, padding: '8px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'monospace', fontSize: 7, color: '#6b7280',
              overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6,
            }}>{`[
  {
    "type": "cube",
    "name": "시장 분석",
    "green": "B2B SaaS 매출",
    "yellow": "엔터프라이즈 수요",
    "red": "경쟁사 진입",
    "blue": "데이터 분석"
  },
  {
    "type": "pre_mortem",
    "name": "프로젝트 붕괴",
    "fatal_cause": "핵심 개발자 이탈",
    "risk_index": 85
  }
]`}</pre>
          </details>

          {/* Textarea */}
          <textarea
            value={raw}
            onChange={e => handleTextChange(e.target.value)}
            placeholder={'[\n  {\n    "type": "cube",\n    "name": "전략 노드",\n    ...\n  }\n]'}
            rows={9}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.25)'}`,
              borderRadius: 8, padding: '8px 10px',
              fontFamily: 'monospace', fontSize: 9, color: '#d1d5db',
              resize: 'vertical', outline: 'none', lineHeight: 1.5,
              animation: status === 'error' ? 'inbox-err-shake 0.4s ease-in-out' : 'none',
            }}
          />

          {/* 미리보기 */}
          {preview && (
            <div style={{
              marginTop: 6, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              fontFamily: 'monospace', fontSize: 8, color: '#818cf8',
              display: 'flex', gap: 10,
            }}>
              {preview.cubes > 0 && <span>📦 큐브 {preview.cubes}개</span>}
              {preview.hasPreMortem && <span>☠️ 사전 부검 포함</span>}
            </div>
          )}

          {/* 상태 메시지 */}
          {status !== 'idle' && message && (
            <div style={{
              marginTop: 6, padding: '5px 8px', borderRadius: 6,
              background: status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              fontFamily: 'monospace', fontSize: 8,
              color: status === 'error' ? '#f87171' : '#4ade80',
              lineHeight: 1.6,
              animation: 'inbox-spawn-pop 0.3s ease-out forwards',
            }}>
              {message}
            </div>
          )}

          {/* 기존 pre_mortem 탑재 표시 */}
          {preMortemData && status === 'idle' && (
            <div style={{
              marginTop: 8, padding: '6px 8px', borderRadius: 6,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
              fontFamily: 'monospace', fontSize: 8, color: '#fca5a5',
            }}>
              ☠️ <strong>사전 부검 탑재됨</strong><br />
              <span style={{ color: '#9ca3af' }}>{preMortemData.name}</span><br />
              <span style={{ color: '#6b7280' }}>risk_index: {preMortemData.risk_index}</span>
            </div>
          )}

          {/* 소환 버튼 */}
          <button
            onClick={handleSpawn}
            disabled={status === 'spawning' || !raw.trim()}
            style={{
              marginTop: 10, width: '100%',
              padding: '9px 0', borderRadius: 8,
              background: status === 'spawning'
                ? 'rgba(99,102,241,0.15)'
                : 'rgba(99,102,241,0.25)',
              border: '1px solid rgba(99,102,241,0.5)',
              color: status === 'spawning' ? '#818cf8' : '#a5b4fc',
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              cursor: status === 'spawning' || !raw.trim() ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.2s',
            }}
          >
            {status === 'spawning' ? '⏳ 소환 중...' : '✨ 큐브 소환 (Spawn)'}
          </button>

          {/* 초기화 버튼 */}
          {preMortemData && (
            <button
              onClick={() => { resetDoomsday() }}
              style={{
                marginTop: 6, width: '100%',
                padding: '6px 0', borderRadius: 8,
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#6b7280',
                fontFamily: 'monospace', fontSize: 9,
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              🗑️ 사전 부검 데이터 초기화
            </button>
          )}
        </div>
      )}
    </>
  )
}
