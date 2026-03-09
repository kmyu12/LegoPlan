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
