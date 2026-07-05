export interface Task {
  id: string
  user_id: string
  nazev: string
  priorita: 'High' | 'Medium' | 'Low'
  deadline: string | null
  status: 'Todo' | 'In Progress' | 'Done'
  projekt: string | null
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  nazev: string
  deadline: string | null
  popis: string | null
  progress: number
  status: 'active' | 'completed'
  created_at: string
}

export interface Milestone {
  id: string
  goal_id: string
  user_id: string
  nazev: string
  deadline: string | null
  done: boolean
  created_at: string
}

export interface Income {
  id: string
  user_id: string
  klient: string
  castka: number
  datum: string
  typ: 'jednorazovy' | 'mesicni'
  status: 'zaplaceno' | 'ceka'
  created_at: string
}

export interface Expense {
  id: string
  user_id: string
  nazev: string
  castka: number
  datum: string
  kategorie: string
  opakovani: boolean
  created_at: string
}

export interface FixedCost {
  id: string
  user_id: string
  nazev: string
  castka: number
  created_at: string
}

export interface TimeBlock {
  id: string
  user_id: string
  nazev: string
  den: number
  od: string
  do: string
  barva: string
  kategorie: string
  created_at: string
}

export interface Debt {
  id: string
  user_id: string
  smer: 'moje' | 'mne'
  komu_kdo: string
  castka: number
  datum: string
  popis: string | null
  status: 'splaceno' | 'nesplaceno'
  created_at: string
}
