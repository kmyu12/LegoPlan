'use client'

import { useStrategyStore, MODE_CONFIG, type ModeIndex } from '@/lib/store'

export default function StrategySlider() {
  const { modeIndex, setMode } = useStrategyStore()
  const current = MODE_CONFIG[modeIndex]

  return (
    <div
      style={{
        position: 'absolute', bottom: 84, right: 20,
        width: 288, fontFamily: 'monospace',
        background: 'rgba(2, 6, 18, 0.90)',
        border: '1px solid rgba(6,182,212,0.25)',
        borderRadius: 12, padding: '12px 14px',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 0 32px rgba(6,182,212,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* 헤더 */}
      <div style={{ fontSize: 9, color: '#06b6d4', letterSpacing: '0.2em', fontWeight: 700, marginBottom: 12 }}>
        STRATEGY SPECTRUM
      </div>

      {/* 트랙 + 노드 */}
      <div style={{ position: 'relative', marginBottom: 6, padding: '0 10px' }}>
        {/* 트랙 배경 */}
        <div style={{
          height: 2, background: 'rgba(255,255,255,0.08)',
          borderRadius: 1, position: 'relative', margin: '11px 0',
        }}>
          {/* 활성 트랙 */}
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            background: current.color,
            borderRadius: 1,
            width: `${(modeIndex / 3) * 100}%`,
            transition: 'width 0.35s ease, background 0.35s',
            boxShadow: `0 0 8px ${current.color}60`,
          }} />
        </div>

        {/* 4개 노드 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          position: 'absolute', top: 0, left: 10, right: 10,
        }}>
          {MODE_CONFIG.map((mode, i) => {
            const isActive   = i === modeIndex
            const isPast     = i < modeIndex
            return (
              <button
                key={i}
                onClick={() => setMode(i as ModeIndex)}
                title={`${mode.label} (×${mode.weight})`}
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: `2px solid ${isActive ? current.color : isPast ? `${current.color}60` : 'rgba(255,255,255,0.12)'}`,
                  background: isActive ? current.color : isPast ? `${current.color}18` : 'rgba(2,6,18,0.9)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, lineHeight: 1,
                  transition: 'all 0.25s',
                  boxShadow: isActive ? `0 0 14px ${current.color}90` : 'none',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                {mode.icon}
              </button>
            )
          })}
        </div>
      </div>

      {/* 라벨 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 8, color: '#4b5563', marginBottom: 10, marginTop: 2,
      }}>
        {MODE_CONFIG.map((m, i) => (
          <span key={i} style={{ color: i === modeIndex ? current.color : '#4b5563', transition: 'color 0.3s', maxWidth: 60, textAlign: 'center' }}>
            {m.label}
          </span>
        ))}
      </div>

      {/* 현재 모드 배지 */}
      <div style={{
        textAlign: 'center', padding: '7px 10px',
        background: `${current.color}12`,
        border: `1px solid ${current.color}30`,
        borderRadius: 8, transition: 'all 0.35s',
      }}>
        <span style={{ color: current.color, fontSize: 12, fontWeight: 700 }}>
          {current.icon} {current.label} MODE
        </span>
        <span style={{ color: '#4b5563', fontSize: 10, marginLeft: 8 }}>
          weight: {current.weight}×
        </span>
      </div>
    </div>
  )
}
