'use client'

import { useEffect, useRef, useState } from 'react'
import { useStrategyStore, MODE_CONFIG, type EfficiencyData } from '@/lib/store'

// ─── Cyberpunk 키프레임 CSS ───────────────────────────────────────────────────
const HUD_STYLES = `
@keyframes hud-scan {
  0%   { transform: translateY(-100%); opacity: 0.12; }
  100% { transform: translateY(1200%); opacity: 0.02; }
}
@keyframes hud-glow {
  0%, 100% { text-shadow: 0 0 6px currentColor; }
  50%       { text-shadow: 0 0 22px currentColor, 0 0 44px currentColor; }
}
@keyframes hud-flash-up {
  0%   { background: rgba(0,255,157,0.18); }
  100% { background: transparent; }
}
@keyframes hud-flash-down {
  0%   { background: rgba(239,68,68,0.18); }
  100% { background: transparent; }
}
@keyframes hud-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
`

// ─── 점수별 색상 ─────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 5) return '#00e5a0'
  if (s >= 2) return '#22c55e'
  if (s >= 1) return '#eab308'
  return '#ef4444'
}

// ─── 메트릭 셀 ───────────────────────────────────────────────────────────────
function MetricCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: '#4b5563', letterSpacing: '0.12em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// ─── 범례 항목 ────────────────────────────────────────────────────────────────
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

// ─── 메인 HUD ────────────────────────────────────────────────────────────────
export default function EfficiencyHUD({ data }: { data: EfficiencyData }) {
  const { modeIndex }    = useStrategyStore()
  const mode             = MODE_CONFIG[modeIndex]
  const prevScore        = useRef(data.score)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  // 점수 변동 시 플래시 효과
  useEffect(() => {
    if (Math.abs(data.score - prevScore.current) < 0.01) return
    setFlash(data.score > prevScore.current ? 'up' : 'down')
    const t = setTimeout(() => setFlash(null), 700)
    prevScore.current = data.score
    return () => clearTimeout(t)
  }, [data.score])

  const color     = scoreColor(data.score)
  const isOverload = data.critRisk > 1.5 && modeIndex === 3

  return (
    <>
      <style>{HUD_STYLES}</style>
      <div
        style={{
          position: 'absolute', top: 20, left: 20,
          width: 236, fontFamily: 'monospace',
          background: 'rgba(2, 6, 18, 0.90)',
          border: '1px solid rgba(6,182,212,0.25)',
          borderRadius: 12, overflow: 'hidden',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 0 32px rgba(6,182,212,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* 스캔라인 애니메이션 */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 0,
            height: '15%', background: 'linear-gradient(transparent, rgba(6,182,212,0.06), transparent)',
            animation: 'hud-scan 4s linear infinite',
          }} />
        </div>

        {/* 헤더 */}
        <div style={{
          padding: '7px 12px', borderBottom: '1px solid rgba(6,182,212,0.14)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative', zIndex: 1,
        }}>
          <span style={{ color: '#06b6d4', fontSize: 9, letterSpacing: '0.2em', fontWeight: 700 }}>
            LEGOPLAN HUD
          </span>
          <span style={{ fontSize: 10, color: mode.color, fontWeight: 700 }}>
            {mode.icon} {mode.label}
          </span>
        </div>

        {/* Efficiency Score */}
        <div style={{
          padding: '14px 12px 10px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(6,182,212,0.1)',
          position: 'relative', zIndex: 1,
          animation: flash === 'up' ? 'hud-flash-up 0.7s ease-out' : flash === 'down' ? 'hud-flash-down 0.7s ease-out' : 'none',
        }}>
          <div style={{
            fontSize: 48, fontWeight: 900, color,
            lineHeight: 1, transition: 'color 0.4s',
            animation: 'hud-glow 2.5s ease-in-out infinite',
          }}>
            {data.score.toFixed(2)}
          </div>
          <div style={{ fontSize: 8, color: '#374151', letterSpacing: '0.25em', marginTop: 4 }}>
            EFFICIENCY SCORE
          </div>
          <div style={{
            marginTop: 6, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1,
          }}>
            <div style={{
              height: '100%', borderRadius: 1,
              width: `${Math.min(data.score / 10 * 100, 100)}%`,
              background: `linear-gradient(90deg, ${color}80, ${color})`,
              transition: 'width 0.6s ease, background 0.4s',
            }} />
          </div>
        </div>

        {/* 메트릭 그리드 */}
        <div style={{
          padding: '10px 12px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          borderBottom: '1px solid rgba(6,182,212,0.1)',
          position: 'relative', zIndex: 1,
        }}>
          <MetricCell label="TOTAL GAIN"  value={data.totalGain}            color="#22c55e" />
          <MetricCell label="STEP COUNT"  value={data.stepCount}            color="#06b6d4" />
          <MetricCell label="CRIT RISK"   value={data.critRisk.toFixed(2)}  color="#ef4444" />
          <MetricCell label="MODE WEIGHT" value={`${data.modeWeight}×`}     color={mode.color} />
        </div>

        {/* 범례 */}
        <div style={{
          padding: '8px 12px',
          borderBottom: isOverload ? '1px solid rgba(239,68,68,0.25)' : 'none',
          position: 'relative', zIndex: 1,
        }}>
          <LegendItem color="#22c55e" label="ROOT — 항상 활성" />
          <LegendItem color="#f59e0b" label="GOAL — 목표 큐브" />
          <LegendItem color="#ef4444" label="Critical Path 구간" />
          <LegendItem color="#1f2937" label="비활성 — 선행 조건 미충족" />
        </div>

        {/* ⚠ Risk Overload 경고 */}
        {isOverload && (
          <div style={{
            padding: '9px 12px',
            background: 'rgba(239,68,68,0.08)',
            position: 'relative', zIndex: 1,
          }}>
            <div style={{
              color: '#ef4444', fontSize: 10, fontWeight: 700,
              animation: 'hud-blink 1s ease-in-out infinite',
              letterSpacing: '0.05em',
            }}>
              ⚠️ Risk Overload!
            </div>
            <div style={{ color: '#9ca3af', fontSize: 9, marginTop: 2 }}>
              선행 조건을 더 확보하세요!
            </div>
          </div>
        )}
      </div>
    </>
  )
}
