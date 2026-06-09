'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import DesignPicker from '@/components/DesignPicker'
import { supabase } from '@/lib/supabase'
import type { Design } from '@/types'

// FaceCanvasはSSR不可（WebGL・getUserMedia使用）
const FaceCanvas = dynamic(() => import('@/components/FaceCanvas'), { ssr: false })

export default function TryOnPage() {
  const [designs, setDesigns] = useState<Design[]>([])
  const [selected, setSelected] = useState<Design | null>(null)

  useEffect(() => {
    supabase.from('designs').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDesigns(data) })
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <h1 className="text-center text-2xl font-bold mb-6 text-pink-400">
        フェイスペイント体験
      </h1>
      <FaceCanvas design={selected} />
      <DesignPicker designs={designs} selected={selected} onSelect={setSelected} />
    </main>
  )
}
