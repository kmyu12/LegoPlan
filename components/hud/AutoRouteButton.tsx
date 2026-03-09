'use client'

import { useStrategyStore, MODE_CONFIG } from '@/lib/store'

// ─── CSS ──────────────────────────────────────────────────────────────────────

const AUTO_ROUTE_CSS = `
@keyframes ar-spin {
  from { transform: rotate(0deg);   }
  to   { transform: rotate(360deg); }
}
@keyframes ar-pulse-border {
  0%, 100% { box-shadow: 0 0 8px rgba(99,102,241,0.4); }
  50%       { box-shadow: 0 0 24px rgba(99,102,241,0.9), 0 0 48px rgba(99,102,241,0.3); }
}
@keyframes ar-done-flash {
  0%   { box-shadow: 0 0 0 rgba(34,197,94,0); }
  30%  { box-shadow: 0 0 32px rgba(34,197,94,0.6); }
  100% { box-shadow: 0 0 8px rgba(34,197,94,0.2); }
}
@keyframes ar-text-scan {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
@keyframes ar-err-shake {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-4px); }
  40%     { transform: translateX(4px); }
  60%     { transform: translateX(-3px); }
  80%     { transform: translateX(3px); }
}
`

export type RoutePhase = 'idle' | 'exploring' | 'routing' | 'done' | 'error'

interface Props {
  phase:   RoutePhase
  errorMsg: string
  onClick: () => void
}

export default function AutoRouteButton({ phase, errorMsg, onClick }: Props) {
  const { modeIndex } = useStrategyStore()
  const mode = MODE_CONFIG[modeIndex]

  const isDisabled = phase === 'exploring' || phase === 'routing'

  const label =
    phase === 'exploring' ? '🔍 탐색 중...'  :
    phase === 'routing'   ? '⚡ 경로 확정...' :
    phase === 'done'      ? '✅ 라우팅 완료'   :
    phase === 'error'     ? `⚠️ ${errorMsg}`   :
    '✨ Auto-Route'

  const borderColor =
    phase === 'done'  ? 'rgba(34,197,94,0.7)'   :
    phase === 'error' ? 'rgba(239,68,68,0.7)'    :
    `${mode.color}55`

  const bgColor =
    phase === 'done'  ? 'rgba(34,197,94,0.10)'   :
    phase === 'error' ? 'rgba(239,68,68,0.10)'   :
    isDisabled        ? 'rgba(99,102,241,0.10)'  :
    'rgba(2,6,18,0.88)'

  const textColor =
    phase === 'done'  ? '#4ade80' :
    phase === 'error' ? '#f87171' :
    isDisabled        ? '#818cf8' :
    '#a5b4fc'

  const animation =
    phase === 'exploring' || phase === 'routing' ? 'ar-pulse-border 1s ease-in-out infinite' :
    phase === 'done'                             ? 'ar-done-flash 0.6s ease-out forwards'    :
    phase === 'error'                            ? 'ar-err-shake 0.5s ease-in-out'           :
    'none'

  return (
    <>
      <style>{AUTO_ROUTE_CSS}</style>
      <div style={{ position: 'relative' }}>
        <button
          onClick={onClick}
          disabled={isDisabled}
          style={{
            fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
            padding: '9px 16px', borderRadius: 10, whiteSpace: 'nowrap',
            border: `1px solid ${borderColor}`,
            background: bgColor, color: textColor,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            backdropFilter: 'blur(14px)',
            letterSpacing: '0.05em',
            transition: 'background 0.3s, color 0.3s, border-color 0.3s',
            animation,
          }}
        >
          {/* 탐색 중 스피너 */}
          {(phase === 'exploring' || phase === 'routing') && (
            <span style={{ display: 'inline-block', marginRight: 6, animation: 'ar-spin 1s linear infinite' }}>
              ◌
            </span>
          )}
          <span style={{ animation: isDisabled ? 'ar-text-scan 0.7s ease-in-out infinite' : 'none' }}>
            {label}
          </span>
        </button>

        {/* 모드 힌트 */}
        {phase === 'idle' && (
          <div style={{
            marginTop: 4, textAlign: 'right',
            fontSize: 8, color: '#374151', fontFamily: 'monospace', letterSpacing: '0.05em',
          }}>
            {modeIndex <= 1 ? '보수적: 최대 경유 경로' : '공격적: 최단 경로'}
            &nbsp;{mode.icon}
          </div>
        )}
      </div>
    </>
  )
}
