'use client'

import { useState, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OracleResult {
  type:    'bad' | 'good'
  message: string
}

interface OracleSystemProps {
  onSync: () => Promise<OracleResult>
}

// ─── CSS Keyframes ────────────────────────────────────────────────────────────

const ORACLE_CSS = `
@keyframes oracle-scan-line {
  0%   { top: -1%;  opacity: 0; }
  5%   { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 101%; opacity: 0; }
}
@keyframes oracle-grid-flicker {
  0%, 100% { opacity: 0.04; }
  50%       { opacity: 0.09; }
}
@keyframes oracle-toast-slide {
  0%   { transform: translateX(-50%) translateY(24px); opacity: 0; }
  100% { transform: translateX(-50%) translateY(0);    opacity: 1; }
}
@keyframes oracle-btn-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(6,182,212,0.4); }
  50%       { box-shadow: 0 0 24px rgba(6,182,212,0.9), 0 0 48px rgba(6,182,212,0.3); }
}
@keyframes oracle-dot-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
@keyframes oracle-alert-border {
  0%, 100% { border-color: rgba(239,68,68,0.45); }
  50%       { border-color: rgba(239,68,68,0.9); }
}
`

const SCAN_MS = 1800

// ─── Scan Overlay ─────────────────────────────────────────────────────────────

function ScanOverlay() {
  return (
    <>
      <style>{ORACLE_CSS}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
        background: 'rgba(6, 182, 212, 0.035)',
      }}>
        {/* 이동하는 레이저 라인 */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, transparent 0%, #06b6d4 20%, #67e8f9 50%, #06b6d4 80%, transparent 100%)',
          boxShadow: '0 0 18px 8px rgba(6,182,212,0.5), 0 0 60px 24px rgba(6,182,212,0.18)',
          animation: `oracle-scan-line ${SCAN_MS}ms cubic-bezier(0.4, 0, 0.6, 1) forwards`,
        }} />

        {/* 그리드 스캔라인 */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: [
            'repeating-linear-gradient(0deg, rgba(6,182,212,0.04) 0px, transparent 1px, transparent 6px)',
            'repeating-linear-gradient(90deg, rgba(6,182,212,0.02) 0px, transparent 1px, transparent 40px)',
          ].join(', '),
          animation: 'oracle-grid-flicker 0.15s linear infinite',
        }} />

        {/* 코너 장식 */}
        {[
          { top: 16, left: 16,   borderTop: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' },
          { top: 16, right: 16,  borderTop: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' },
          { bottom: 16, left: 16,  borderBottom: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' },
          { bottom: 16, right: 16, borderBottom: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
        ))}

        {/* 중앙 SCANNING 텍스트 */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'monospace', fontSize: 11,
          color: '#06b6d4', letterSpacing: '0.3em',
          animation: 'oracle-dot-blink 0.6s ease-in-out infinite',
          textShadow: '0 0 12px #06b6d4',
        }}>
          ORACLE SCANNING MARKET DATA...
        </div>
      </div>
    </>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function OracleToast({ result, onDismiss }: { result: OracleResult; onDismiss: () => void }) {
  const isBad = result.type === 'bad'
  const borderColor = isBad ? 'rgba(239,68,68,0.5)'  : 'rgba(34,197,94,0.5)'
  const bgColor     = isBad ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.08)'
  const glowColor   = isBad ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.14)'
  const accentColor = isBad ? '#f87171'               : '#4ade80'

  // 5초 후 자동 닫힘
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200, fontFamily: 'monospace',
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 12, padding: '13px 20px',
      maxWidth: 460, width: 'max-content',
      backdropFilter: 'blur(16px)',
      boxShadow: `0 0 40px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      animation: 'oracle-toast-slide 0.3s ease-out forwards',
      ...(isBad ? { animationName: 'oracle-toast-slide, oracle-alert-border' } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, color: accentColor, fontWeight: 700,
            letterSpacing: '0.15em', marginBottom: 5,
          }}>
            {isBad ? '⚠️ ORACLE ALERT' : '✅ ORACLE REPORT'}
          </div>
          <div style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.6 }}>
            {result.message}
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4b5563', fontSize: 14, padding: '0 0 0 8px', flexShrink: 0,
          }}
        >✕</button>
      </div>

      {/* 자동 닫힘 프로그레스 바 */}
      <div style={{ marginTop: 10, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
        <div style={{
          height: '100%', borderRadius: 1,
          background: accentColor,
          animation: `oracle-scan-line 5000ms linear forwards`,
          width: '100%',
          transformOrigin: 'left',
          // 5초간 줄어드는 효과
          animationName: 'none',
          transition: 'width 5s linear',
          '--start': '100%',
        } as React.CSSProperties} />
      </div>
    </div>
  )
}

// ─── Oracle Button ────────────────────────────────────────────────────────────

function OracleButton({ isScanning, dots, onClick }: {
  isScanning: boolean
  dots:       string
  onClick:    () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        disabled={isScanning}
        style={{
          fontFamily: 'monospace',
          fontSize: 11, fontWeight: 700,
          padding: '9px 16px',
          borderRadius: 10,
          border: `1px solid ${isScanning ? 'rgba(6,182,212,0.6)' : 'rgba(6,182,212,0.35)'}`,
          background: isScanning
            ? 'rgba(6,182,212,0.12)'
            : hovered
            ? 'rgba(6,182,212,0.15)'
            : 'rgba(2,6,18,0.88)',
          color: isScanning ? '#67e8f9' : '#06b6d4',
          cursor: isScanning ? 'not-allowed' : 'pointer',
          backdropFilter: 'blur(14px)',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
          animation: isScanning ? 'oracle-btn-pulse 1s ease-in-out infinite' : 'none',
          boxShadow: hovered && !isScanning ? '0 0 16px rgba(6,182,212,0.3)' : 'none',
        }}
      >
        {isScanning
          ? <span style={{ animation: 'oracle-dot-blink 0.5s ease-in-out infinite' }}>
              🔄 Syncing with Oracle{dots}
            </span>
          : '🌐 Update from Oracle'
        }
      </button>

      {/* 툴팁 */}
      {hovered && !isScanning && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: 'rgba(2,6,18,0.95)',
          border: '1px solid rgba(6,182,212,0.25)',
          borderRadius: 8, padding: '6px 10px',
          fontFamily: 'monospace', fontSize: 9,
          color: '#9ca3af', whiteSpace: 'nowrap',
          backdropFilter: 'blur(12px)',
          letterSpacing: '0.05em',
          zIndex: 50,
        }}>
          AI 시장 데이터 수동 동기화 (토큰 절약 모드)
        </div>
      )}
    </div>
  )
}

// ─── Oracle System (메인) ─────────────────────────────────────────────────────

export default function OracleSystem({ onSync }: OracleSystemProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [dots, setDots]             = useState('')
  const [toast, setToast]           = useState<OracleResult | null>(null)

  const handleClick = useCallback(async () => {
    if (isScanning) return
    setIsScanning(true)
    setToast(null)

    // 점멸 닷 애니메이션
    let count = 0
    const dotTimer = setInterval(() => {
      count = (count + 1) % 4
      setDots('.'.repeat(count))
    }, 350)

    // 스캔 애니메이션 대기
    await new Promise(r => setTimeout(r, SCAN_MS))

    // 실제 데이터 변경 실행
    const result = await onSync()

    clearInterval(dotTimer)
    setDots('')
    setIsScanning(false)
    setToast(result)
  }, [isScanning, onSync])

  return (
    <>
      <style>{ORACLE_CSS}</style>

      {/* 스캔 오버레이 */}
      {isScanning && <ScanOverlay />}

      {/* 버튼 — 우측 상단 */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <OracleButton isScanning={isScanning} dots={dots} onClick={handleClick} />
      </div>

      {/* 토스트 알림 */}
      {toast && <OracleToast result={toast} onDismiss={() => setToast(null)} />}
    </>
  )
}
