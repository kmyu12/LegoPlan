import { create } from 'zustand'

export const MODE_CONFIG = [
  { label: '보수적',      icon: '🛡️', weight: 0.5, color: '#6366f1' },
  { label: '조금 보수적', icon: '⚖️', weight: 1.0, color: '#06b6d4' },
  { label: '조금 공격적', icon: '📈', weight: 1.5, color: '#f59e0b' },
  { label: '공격적',      icon: '🔥', weight: 2.0, color: '#ef4444' },
] as const

export type ModeIndex = 0 | 1 | 2 | 3

export interface EfficiencyData {
  score:      number
  totalGain:  number
  stepCount:  number
  critRisk:   number
  modeWeight: number
}

interface StrategyStore {
  modeIndex: ModeIndex
  setMode:   (i: ModeIndex) => void
}

export const useStrategyStore = create<StrategyStore>((set) => ({
  modeIndex: 1,
  setMode: (modeIndex) => set({ modeIndex }),
}))

// ─── Doomsday / Pre-Mortem Store ────────────────────────────────────────────

export interface PreMortemData {
  name:        string
  fatal_cause: string
  risk_index:  number
}

/** JSON Inbox 파싱 결과 — 일반 큐브 스펙 */
export interface ParsedCubeSpec {
  name?:   string
  green?:  string
  yellow?: string
  red?:    string
  blue?:   string
  white?:  string
  black?:  string
}

interface DoomsdayStore {
  preMortemData:      PreMortemData | null
  isDoomsdayActive:   boolean
  setPreMortemData:   (data: PreMortemData | null) => void
  setIsDoomsdayActive:(v: boolean) => void
  resetDoomsday:      () => void
}

export const useDoomsdayStore = create<DoomsdayStore>((set) => ({
  preMortemData:      null,
  isDoomsdayActive:   false,
  setPreMortemData:   (data)  => set({ preMortemData: data }),
  setIsDoomsdayActive:(v)     => set({ isDoomsdayActive: v }),
  resetDoomsday:      ()      => set({ isDoomsdayActive: false, preMortemData: null }),
}))
