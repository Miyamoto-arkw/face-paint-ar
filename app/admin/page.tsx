'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { Design, DesignType } from '@/types'
import { DESIGN_TYPE_LABEL } from '@/types'
import { drawTemplate, recommendedAspect } from '@/lib/regions'

const TYPE_OPTIONS = (Object.keys(DESIGN_TYPE_LABEL) as DesignType[])
  .map(value => ({ value, label: DESIGN_TYPE_LABEL[value] }))

/** 全顔用の展開図テンプレートPNGをダウンロード */
function downloadTemplate() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  drawTemplate(canvas.getContext('2d')!, size)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = 'face-paint-template.png'
  a.click()
}

export default function AdminPage() {
  const [designs, setDesigns] = useState<Design[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<DesignType>('cheek')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('designs').select('*').order('created_at', { ascending: false })
    if (data) setDesigns(data)
  }

  useEffect(() => {
    supabase.from('designs').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDesigns(data) })
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name) return
    setLoading(true)
    setError('')
    try {
      const ext = file.name.split('.').pop()
      const path = `designs/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('face-paint').upload(path, file)
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('face-paint').getPublicUrl(path)
      const { error: insertErr } = await supabase.from('designs').insert({
        name, type, image_url: urlData.publicUrl,
      })
      if (insertErr) throw insertErr

      setName('')
      setFile(null)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(d: Design) {
    if (!confirm(`「${d.name}」を削除しますか？`)) return
    const path = d.image_url.split('/face-paint/')[1]
    await supabase.storage.from('face-paint').remove([path])
    await supabase.from('designs').delete().eq('id', d.id)
    await load()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-2">管理画面 — 絵柄登録</h1>
      <div className="text-sm text-gray-600 mb-6 max-w-md space-y-1">
        <p>頬・目尻〜こめかみ：透過PNGを1枚。自動で範囲に収まり、右側は左右反転で配置されます（左側に置いたときの向きで作成）。</p>
        <p>
          範囲いっぱいに使うには、推奨サイズ（幅×高さ）で作成してください：
          頬 600×{Math.round(600 * recommendedAspect('cheek'))}px、
          目尻〜こめかみ 600×{Math.round(600 * recommendedAspect('eye'))}px
          （右端が額の中央、左端がこめかみ。目と眉の内側は自動で切り抜かれます。形はテンプレートの青枠を参照）
        </p>
        <p>
          全顔：展開図テンプレートに合わせて描いた1024×1024の透過PNG。
          <button type="button" onClick={downloadTemplate} className="ml-1 text-pink-600 underline">
            テンプレートをダウンロード
          </button>
          （ピンク枠＝頬、青枠＝目尻〜こめかみの配置範囲）
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-8 max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">絵柄名</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="例: 桜チーク"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">タイプ</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as DesignType)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">PNG 画像（透過推奨）</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp"
              onChange={handleFile}
              required
              className="w-full text-sm"
            />
            {preview && (
              <div className="mt-2 w-24 h-24 relative border rounded-lg overflow-hidden bg-gray-100">
                <Image src={preview} alt="preview" fill className="object-contain" />
              </div>
            )}
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-500 text-white rounded-lg py-2 font-medium hover:bg-pink-600 disabled:opacity-50"
          >
            {loading ? '登録中...' : '登録する'}
          </button>
        </div>
      </form>

      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">登録済み絵柄</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {designs.map(d => (
            <div key={d.id} className="bg-white rounded-xl shadow p-3 flex flex-col gap-2">
              <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <Image src={d.image_url} alt={d.name} fill className="object-contain" />
              </div>
              <p className="text-sm font-medium truncate">{d.name}</p>
              <p className="text-xs text-gray-400">{DESIGN_TYPE_LABEL[d.type]}</p>
              <button
                onClick={() => handleDelete(d)}
                className="text-xs text-red-400 hover:text-red-600 text-left"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
