export interface MetaState {
  currency: number
  upgradeRanks: Record<string, number>
  unlockIds: string[]
  firstClear: boolean
  activeModifiers: string[]
}

const STORAGE_KEY = 'meta'

function defaultState(): MetaState {
  return {
    currency: 0,
    upgradeRanks: {},
    unlockIds: [],
    firstClear: false,
    activeModifiers: [],
  }
}

export function load(): MetaState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    return defaultState()
  }
}

export function save(state: MetaState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function addCurrency(state: MetaState, amount: number): MetaState {
  return { ...state, currency: state.currency + amount }
}

export function purchaseUpgrade(
  state: MetaState,
  id: string,
  cost: number,
  maxRank: number,
): MetaState | null {
  const currentRank = state.upgradeRanks[id] ?? 0
  if (currentRank >= maxRank || state.currency < cost) return null
  return {
    ...state,
    currency: state.currency - cost,
    upgradeRanks: { ...state.upgradeRanks, [id]: currentRank + 1 },
  }
}

export function unlock(state: MetaState, id: string): MetaState {
  if (state.unlockIds.includes(id)) return state
  return { ...state, unlockIds: [...state.unlockIds, id] }
}
