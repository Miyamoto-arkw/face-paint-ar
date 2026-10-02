'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import DesignPicker from '@/components/DesignPicker'
import { supabase } from '@/lib/supabase'
import type { Design } from '@/types'
import type { Side } from '@/lib/regions'
import type { BlendMode } from '@/components/FaceCanvas'

// カメラ・WebGLを使うのでSSRしない
const FaceCanvas = dynamic(() => import('@/components/FaceCanvas'), { ssr: false })

export default function TryOnPage() {
  const [designs, setDesigns] = useState<Design[]>([])
  const [selected, setSelected] = useState<Design | null>(null)
  const [side, setSide] = useState<Side>('left')
  const [blend, setBlend] = useState<BlendMode>('multiply')
  const [opacity, setOpacity] = useState(0.9)

  useEffect(() => {
    supabase.from('designs').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDesigns(data) })
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-6">
      <h1 className="text-center text-xl font-bold mb-4 text-pink-400">フェイスペイント体験</h1>
      <FaceCanvas design={selected} side={side} blend={blend} opacity={opacity} />
      <DesignPicker
        designs={designs}
        selected={selected}
        side={side}
        blend={blend}
        opacity={opacity}
        onSelect={setSelected}
        onSideChange={setSide}
        onBlendChange={setBlend}
        onOpacityChange={setOpacity}
      />
    </main>
  )
}
