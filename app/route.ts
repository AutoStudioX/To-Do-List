import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

export function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export function GET() {
  redirect('/prehled')
}
