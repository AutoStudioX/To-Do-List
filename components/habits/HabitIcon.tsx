'use client'
import {
  Droplets, Utensils, MonitorOff, GlassWater, Timer, Dumbbell, Circle,
  BookOpen, Moon, Footprints, Pill, Brush, Sprout, Wallet, Music, Phone,
  Sunrise, Coffee, ShowerHead,
} from 'lucide-react'

/**
 * `habits.ikona` drží název lucide komponenty (kebab-case, jak je má README).
 * Mapa je schválně explicitní, ne dynamický import — bundler tak vezme jen
 * těch pár ikon, které opravdu používáme, a neznámý název nespadne.
 */
const MAP = {
  'sunrise': Sunrise,
  'droplets': Droplets,
  'coffee': Coffee,
  'shower-head': ShowerHead,
  'utensils': Utensils,
  'monitor-off': MonitorOff,
  'glass-water': GlassWater,
  'timer': Timer,
  'dumbbell': Dumbbell,
  'book-open': BookOpen,
  'moon': Moon,
  'footprints': Footprints,
  'pill': Pill,
  'brush': Brush,
  'sprout': Sprout,
  'wallet': Wallet,
  'music': Music,
  'phone': Phone,
  'circle': Circle,
} as const

/** Nabídka ve formuláři nového návyku. */
export const ICON_CHOICES = Object.keys(MAP) as (keyof typeof MAP)[]

export default function HabitIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Cmp = MAP[name as keyof typeof MAP] ?? Circle
  return <Cmp size={size} />
}
