'use client'

import Image from 'next/image'
import type { Design, DesignType } from '@/types'

interface Props {
  designs: Design[]
  selected: Design | null
  onSelect: (design: Design | null) => void
}

const TYPE_LABEL: Record<DesignType, string> = {
  cheek: '頬',
  eye: '目元',
  full: '全顔',
}

export default function DesignPicker({ designs, selected, onSelect }: Props) {
  const grouped = designs.reduce<Record<DesignType, Design[]>>(
    (acc, d) => { acc[d.type].push(d); return acc },
    { cheek: [], eye: [], full: [] }
  )

  return (
    <div className="w-full max-w-lg mx-auto mt-4 space-y-4">
      {(Object.keys(grouped) as DesignType[]).map(type => (
        grouped[type].length > 0 && (
          <div key={type}>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">{TYPE_LABEL[type]}</h3>
            <div className="flex gap-2 flex-wrap">
              {grouped[type].map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelect(selected?.id === d.id ? null : d)}
                  className={`relative w-16 h-16 rounded-xl border-2 overflow-hidden transition-all ${
                    selected?.id === d.id
                      ? 'border-pink-500 scale-105 shadow-md'
                      : 'border-gray-200 hover:border-pink-300'
                  }`}
                >
                  <Image src={d.image_url} alt={d.name} fill className="object-cover" />
                </button>
              ))}
            </div>
          </div>
        )
      ))}
      {designs.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">絵柄がまだありません</p>
      )}
    </div>
  )
}
