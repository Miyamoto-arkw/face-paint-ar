'use client'

import { useEffect, useRef } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { FACE_TRIANGLES } from '@/lib/faceMeshTriangles'
import type { Design } from '@/types'

export type Side = 'left' | 'right'

interface Props {
  design: Design | null
  side: Side
}

export default function FaceCanvas({ design, side }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const designImgRef = useRef<HTMLImageElement | null>(null)
  const designRef = useRef<Design | null>(null)
  const sideRef = useRef<Side>(side)
  const rafRef = useRef<number>(0)
  const lastVideoTimeRef = useRef(-1)
  const lastLandmarksRef = useRef<{ x: number; y: number }[] | null>(null)

  useEffect(() => { sideRef.current = side }, [side])

  useEffect(() => {
    designRef.current = design
    if (!design) { designImgRef.current = null; return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = design.image_url
    img.onload = () => { designImgRef.current = img }
    img.onerror = () => { designImgRef.current = null }
  }, [design])

  useEffect(() => {
    let destroyed = false
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: false,
        runningMode: 'VIDEO',
        numFaces: 1,
      })
      if (!destroyed) landmarkerRef.current = landmarker
    }
    init()
    return () => { destroyed = true }
  }, [])

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        })
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) { console.error('カメラアクセス失敗', e) }
    }
    startCamera()
    return () => {
      const video = videoRef.current
      if (video?.srcObject) (video.srcObject as MediaStream).getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => {
    function render() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const landmarker = landmarkerRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(render); return
      }
      const ctx = canvas.getContext('2d')!
      const w = canvas.width, h = canvas.height

      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -w, 0, w, h)
      ctx.restore()

      if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        const result = landmarker.detectForVideo(video, performance.now())
        lastLandmarksRef.current = result.faceLandmarks.length > 0
          ? result.faceLandmarks[0].map(p => ({ x: 1 - p.x, y: p.y }))
          : null
      }

      const img = designImgRef.current
      const d = designRef.current
      const lm = lastLandmarksRef.current
      if (lm && img && d) {
        drawMeshWarp(ctx, lm, img, d.type, sideRef.current, w, h)
      }
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" width={640} height={480} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full rounded-2xl shadow-xl" />
    </div>
  )
}

// ---- ランドマーク定義 ----

// 左頬下（頬骨より下、顔の左 = ミラーで画面左）
const LEFT_LOWER_CHEEK = new Set([
  // 頬骨ライン下縁
  116, 117, 118, 101, 50, 36, 205, 187,
  // 頬の中央〜下
  192, 213, 214, 210, 211, 32, 208,
  // 鼻翼〜口角
  207, 216, 215, 206, 203, 204, 194,
  // 顎ライン上
  175, 199, 200, 208, 18, 83, 182, 106, 43, 57, 61,
  136, 172, 150, 149, 176, 148, 152,
  // 内側
  147, 123, 50,
])

// 右頬下（顔の右 = ミラーで画面右）
const RIGHT_LOWER_CHEEK = new Set([
  // 頬骨ライン下縁
  345, 346, 347, 330, 280, 266, 425, 411,
  // 頬の中央〜下
  416, 433, 434, 430, 431, 261, 436,
  // 鼻翼〜口角
  427, 436, 435, 426, 423, 424, 418,
  // 顎ライン上
  175, 199, 200, 428, 18, 313, 406, 335, 273, 287, 291,
  365, 397, 379, 378, 400, 377, 152,
  // 内側
  376, 352, 280,
])

// 左目尻〜こめかみ（目の外角から外側）
const LEFT_OUTER_EYE_TEMPLE = new Set([
  // 目の外角
  33, 246, 161, 160, 159, 158, 157, 173,
  // 外角〜こめかみ橋渡し
  130, 226, 247, 30, 29, 27, 28, 56, 190, 243,
  // こめかみ
  21, 54, 162, 127, 234, 93,
  // 眉尻
  46, 53, 52, 65, 55,
])

// 右目尻〜こめかみ
const RIGHT_OUTER_EYE_TEMPLE = new Set([
  // 目の外角
  263, 466, 388, 387, 386, 385, 384, 398,
  // 外角〜こめかみ橋渡し
  359, 446, 467, 260, 259, 257, 258, 286, 414, 463,
  // こめかみ
  251, 284, 389, 356, 454, 323,
  // 眉尻
  276, 283, 282, 295, 285,
])

function getActiveTriangles(type: Design['type'], side: Side): [number, number, number][] {
  if (type === 'full') return FACE_TRIANGLES

  if (type === 'cheek') {
    const set = side === 'left' ? LEFT_LOWER_CHEEK : RIGHT_LOWER_CHEEK
    return FACE_TRIANGLES.filter(([i0, i1, i2]) => set.has(i0) && set.has(i1) && set.has(i2))
  }

  if (type === 'eye') {
    const set = side === 'left' ? LEFT_OUTER_EYE_TEMPLE : RIGHT_OUTER_EYE_TEMPLE
    return FACE_TRIANGLES.filter(([i0, i1, i2]) => set.has(i0) && set.has(i1) && set.has(i2))
  }

  return FACE_TRIANGLES
}

// ---- 描画 ----

function getFaceBounds(lm: { x: number; y: number }[], w: number, h: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of lm) {
    const px = p.x * w, py = p.y * h
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number,
  dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number,
) {
  const det = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1)
  if (Math.abs(det) < 1e-6) return

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / det
  const c = (sx0 * (dx1 - dx2) + sx1 * (dx2 - dx0) + sx2 * (dx0 - dx1)) / det
  const e = (sx0 * (sy1 * dx2 - sy2 * dx1) + sx1 * (sy2 * dx0 - sy0 * dx2) + sx2 * (sy0 * dx1 - sy1 * dx0)) / det
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / det
  const d = (sx0 * (dy1 - dy2) + sx1 * (dy2 - dy0) + sx2 * (dy0 - dy1)) / det
  const f = (sx0 * (sy1 * dy2 - sy2 * dy1) + sx1 * (sy2 * dy0 - sy0 * dy2) + sx2 * (sy0 * dy1 - sy1 * dy0)) / det

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.lineTo(dx2, dy2)
  ctx.closePath()
  ctx.clip()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.9
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(img, 0, 0, img.width, img.height)
  ctx.restore()
}

function drawMeshWarp(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number }[],
  img: HTMLImageElement,
  type: Design['type'],
  side: Side,
  w: number,
  h: number
) {
  const bounds = getFaceBounds(lm, w, h)
  const iw = img.width, ih = img.height
  const triangles = getActiveTriangles(type, side)

  for (const [i0, i1, i2] of triangles) {
    if (i0 >= lm.length || i1 >= lm.length || i2 >= lm.length) continue
    const dx0 = lm[i0].x * w, dy0 = lm[i0].y * h
    const dx1 = lm[i1].x * w, dy1 = lm[i1].y * h
    const dx2 = lm[i2].x * w, dy2 = lm[i2].y * h
    const sx0 = ((lm[i0].x * w - bounds.minX) / bounds.width) * iw
    const sy0 = ((lm[i0].y * h - bounds.minY) / bounds.height) * ih
    const sx1 = ((lm[i1].x * w - bounds.minX) / bounds.width) * iw
    const sy1 = ((lm[i1].y * h - bounds.minY) / bounds.height) * ih
    const sx2 = ((lm[i2].x * w - bounds.minX) / bounds.width) * iw
    const sy2 = ((lm[i2].y * h - bounds.minY) / bounds.height) * ih
    drawAffineTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2)
  }
}
