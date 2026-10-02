'use client'

// 開発用: カメラなしで、顔写真に本番と同じパイプライン（regions → renderer）を当てて確認する
import { useEffect, useRef, useState } from 'react'
import { createFaceLandmarker, LandmarkSmoother } from '@/lib/faceTracker'
import { prepareTexture, drawTemplate, type Side } from '@/lib/regions'
import { drawWarpedTexture } from '@/lib/renderer'
import type { DesignType } from '@/types'

const CASES: { type: DesignType; side: Side }[] = [
  { type: 'cheek', side: 'left' }, { type: 'cheek', side: 'right' },
  { type: 'eye', side: 'left' }, { type: 'eye', side: 'right' },
  { type: 'full', side: 'left' },
]

/** 向きが分かるテスト絵柄：「L→」と矢印 */
function makeTestImage(): Promise<HTMLImageElement> {
  const c = document.createElement('canvas')
  c.width = 300; c.height = 200
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(220,30,60,0.95)'
  g.beginPath(); g.ellipse(150, 100, 145, 95, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#1e40af'; g.font = 'bold 110px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('L→', 150, 105)
  const img = new Image()
  img.src = c.toDataURL()
  return new Promise(r => { img.onload = () => r(img) })
}

function makeTemplateImage(): Promise<HTMLImageElement> {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 1024
  drawTemplate(c.getContext('2d')!, 1024)
  const img = new Image()
  img.src = c.toDataURL()
  return new Promise(r => { img.onload = () => r(img) })
}

export default function DebugPage() {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])
  const [msg, setMsg] = useState('loading…')

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    (async () => {
      const face = new Image()
      face.src = '/debug-face.jpg'
      await face.decode()
      const lmk = await createFaceLandmarker()
      const res = lmk.detectForVideo(face, performance.now())
      if (!res.faceLandmarks[0]) { setMsg('no face'); return }
      const w = face.naturalWidth, h = face.naturalHeight
      const pts = new LandmarkSmoother().update(res.faceLandmarks[0], w, h)
      const test = await makeTestImage()
      const tmpl = await makeTemplateImage()

      // 顔周辺だけ切り出して表示
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let k = 0; k < pts.length; k += 2) {
        x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k])
        y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1])
      }
      const pad = (x1 - x0) * 0.25
      const crop = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }

      CASES.forEach((cs, i) => {
        const full = document.createElement('canvas')
        full.width = w; full.height = h
        const ctx = full.getContext('2d')!
        ctx.drawImage(face, 0, 0)
        const tex = prepareTexture(cs.type === 'full' ? tmpl : test, cs.type, cs.side)
        const layer = document.createElement('canvas')
        layer.width = w; layer.height = h
        drawWarpedTexture(layer.getContext('2d')!, tex, pts)
        ctx.globalCompositeOperation = 'multiply'
        ctx.globalAlpha = 0.9
        ctx.drawImage(layer, 0, 0)

        const canvas = refs.current[i]!
        canvas.width = crop.w * 2; canvas.height = crop.h * 2
        canvas.getContext('2d')!.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w * 2, crop.h * 2)
        canvas.dataset.triangles = String(tex.triangles.length)
      })
      setMsg('done')
    })().catch(e => setMsg(String(e)))
  }, [])

  return (
    <main className="p-4 bg-gray-100 min-h-screen">
      <p id="status" className="mb-2">{msg}</p>
      <div className="grid grid-cols-3 gap-2">
        {CASES.map((cs, i) => (
          <figure key={i}>
            <canvas ref={el => { refs.current[i] = el }} className="w-full -scale-x-100" />
            <figcaption className="text-xs">{cs.type} / {cs.side}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}
