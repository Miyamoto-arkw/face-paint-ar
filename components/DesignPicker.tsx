'use client'

import Image from 'next/image'
import type { Design, DesignType } from '@/types'
import { DESIGN_TYPE_LABEL } from '@/types'
import type { Side } from '@/lib/regions'
import type { BlendMode } from './FaceCanvas'

interface Props {
  designs: Design[]
  selected: Design | null
  side: Side
  blend: BlendMode
  opacity: number
  onSelect: (design: Design | null) => void
  onSideChange: (side: Side) => void
  onBlendChange: (blend: BlendMode) => void
  onOpacityChange: (opacity: number) => void
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex bg-gray-800 rounded-full p-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
            value === o.value ? 'bg-pink-500 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function DesignPicker(props: Props) {
  const { designs, selected, side, blend, opacity } = props
  const grouped = designs.reduce<Record<DesignType, Design[]>>(
    (acc, d) => { acc[d.type]?.push(d); return acc },
    { cheek: [], eye: [], full: [] }
  )

  return (
    <div className="w-full max-w-sm mx-auto mt-4 space-y-5">
      {selected && (
        <div className="flex flex-col items-center gap-3">
          {selected.type !== 'full' && (
            <Segmented
              value={side}
              onChange={props.onSideChange}
              options={[{ value: 'left', label: '左' }, { value: 'right', label: '右' }]}
            />
          )}
          <div className="flex items-center gap-3">
            <Segmented
              value={blend}
              onChange={props.onBlendChange}
              options={[{ value: 'multiply', label: '肌になじませる' }, { value: 'source-over', label: 'そのまま' }]}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 w-full max-w-60">
            濃さ
            <input
              type="range" min={0.2} max={1} step={0.05} value={opacity}
              onChange={e => props.onOpacityChange(Number(e.target.value))}
              className="flex-1 accent-pink-500"
            />
          </label>
        </div>
      )}

      {(Object.keys(grouped) as DesignType[]).map(type => grouped[type].length > 0 && (
        <div key={type}>
          <h3 className="text-xs font-semibold text-gray-500 mb-2">{DESIGN_TYPE_LABEL[type]}</h3>
          <div className="flex gap-2 flex-wrap">
            {grouped[type].map(d => (
              <button
                key={d.id}
                onClick={() => props.onSelect(selected?.id === d.id ? null : d)}
                aria-label={d.name}
                className={`relative w-16 h-16 rounded-xl border-2 overflow-hidden bg-white/90 transition-all ${
                  selected?.id === d.id ? 'border-pink-500 scale-105' : 'border-gray-700 hover:border-pink-400'
                }`}
              >
                <Image src={d.image_url} alt={d.name} fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {designs.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">絵柄がまだありません</p>
      )}
    </div>
  )
}
