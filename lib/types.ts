export interface Task {
  id: string
  user_id: string
  nazev: string
  priorita: 'High' | 'Medium' | 'Low'
  deadline: string | null
  deadline_time?: string | null
  status: 'Todo' | 'In Progress' | 'Done'
  projekt: string | null
  created_at: string
  dokonceno_at?: string | null
}

export type SplitType = 'Push' | 'Pull' | 'Legs'

export interface Exercise {
  id: string
  user_id: string | null
  name: string
  muscle_group: string | null
  is_custom: boolean
  created_at?: string
}

export interface Workout {
  id: string
  user_id: string
  date: string
  split_type: string | null
  note: string | null
  duration_min: number | null
  created_at?: string
}

export interface WorkoutSet {
  id: string
  workout_id: string
  exercise_id: string
  order_index: number
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  is_warmup: boolean
  created_at?: string
}

export interface Projekt {
  id: string
  user_id: string
  nazev: string
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
  typ: 'manual' | 'number' | 'income' | null
  current_value: number | null
  target_value: number | null
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
  status: 'zaplaceno' | 'ceka' | 'dluh'
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  nazev: string
  castka: number
  datum: string | null
  typ: 'prijem' | 'vydaj' | 'fixni_naklad' | 'dluh'
  kategorie: string | null
  smer: string | null
  opakovani: 'jednorazovy' | 'mesicni' | 'rocni' | null
  status: string | null
  klient: string | null
  poznamka: string | null
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
