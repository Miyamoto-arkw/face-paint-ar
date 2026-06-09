'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { Design, DesignType } from '@/types'

const TYPE_OPTIONS: { value: DesignType; label: string }[] = [
  { value: 'cheek', label: '頬' },
  { value: 'eye', label: '目元' },
  { value: 'full', label: '全顔' },
]

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

  useEffect(() => { load() }, [])

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
      <h1 className="text-2xl font-bold mb-6">管理画面 — 絵柄登録</h1>

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
              <p className="text-xs text-gray-400">{d.type === 'cheek' ? '頬' : d.type === 'eye' ? '目元' : '全顔'}</p>
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
