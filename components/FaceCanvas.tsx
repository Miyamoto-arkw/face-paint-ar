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
    <div className="relative w-full max-w-xs mx-auto">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" width={640} height={480} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full rounded-2xl shadow-xl" />
    </div>
  )
}

// ---- ランドマークセット定義 ----

// 左頬（頬骨下〜口角上、コンパクトな範囲）
const LEFT_LOWER_CHEEK = new Set([
  // 頬の核心部
  117, 118, 101, 50, 205, 187,
  192, 213, 214, 210, 211,
  207, 216, 215,
  // 上端（頬骨）
  116, 123, 147,
  // 内側（鼻寄り）
  203, 206, 216,
])

// 右頬（頬骨下〜口角上、コンパクトな範囲）
const RIGHT_LOWER_CHEEK = new Set([
  // 頬の核心部
  346, 347, 330, 280, 425, 411,
  416, 433, 434, 430, 431,
  427, 436, 435,
  // 上端（頬骨）
  345, 352, 376,
  // 内側（鼻寄り）
  423, 426, 436,
])

const LEFT_OUTER_EYE_TEMPLE = new Set([
  33, 246, 161, 160, 159, 158, 157, 173,
  130, 226, 247, 30, 29, 27, 28, 56, 190, 243,
  21, 54, 162, 127, 234, 93,
  46, 53, 52, 65, 55,
])

const RIGHT_OUTER_EYE_TEMPLE = new Set([
  263, 466, 388, 387, 386, 385, 384, 398,
  359, 446, 467, 260, 259, 257, 258, 286, 414, 463,
  251, 284, 389, 356, 454, 323,
  276, 283, 282, 295, 285,
])

function getActiveSet(type: Design['type'], side: Side): Set<number> {
  if (type === 'full') return new Set(Array.from({ length: 468 }, (_, i) => i))
  if (type === 'cheek') return side === 'left' ? LEFT_LOWER_CHEEK : RIGHT_LOWER_CHEEK
  if (type === 'eye') return side === 'left' ? LEFT_OUTER_EYE_TEMPLE : RIGHT_OUTER_EYE_TEMPLE
  return new Set()
}

function getActiveTriangles(type: Design['type'], side: Side): [number, number, number][] {
  if (type === 'full') return FACE_TRIANGLES
  const set = getActiveSet(type, side)
  // 三角形の全頂点がセット内にある場合のみ使用
  return FACE_TRIANGLES.filter(([i0, i1, i2]) => set.has(i0) && set.has(i1) && set.has(i2))
}

// ---- 顔ローカル座標系 ----

interface FaceAxes {
  right: { x: number; y: number }  // 顔の水平右方向（ミラー後）
  up: { x: number; y: number }     // 顔の上方向
  center: { x: number; y: number }
}

function getFaceAxes(lm: { x: number; y: number }[], w: number, h: number): FaceAxes {
  const pt = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h })
  const chin = pt(152)
  const forehead = pt(10)
  const leftCheek = pt(234)  // ミラー後は画面左
  const rightCheek = pt(454) // ミラー後は画面右

  // 上方向: 顎→額
  const upDx = forehead.x - chin.x
  const upDy = forehead.y - chin.y
  const upLen = Math.hypot(upDx, upDy) || 1

  // 右方向: 左頬→右頬
  const rtDx = rightCheek.x - leftCheek.x
  const rtDy = rightCheek.y - leftCheek.y
  const rtLen = Math.hypot(rtDx, rtDy) || 1

  return {
    up: { x: upDx / upLen, y: upDy / upLen },
    right: { x: rtDx / rtLen, y: rtDy / rtLen },
    center: {
      x: (leftCheek.x + rightCheek.x) / 2,
      y: (forehead.y + chin.y) / 2,
    },
  }
}

// ランドマーク1点を顔ローカル座標（u=横, v=縦上正）に投影
function projectLocal(px: number, py: number, axes: FaceAxes) {
  const dx = px - axes.center.x
  const dy = py - axes.center.y
  return {
    u: dx * axes.right.x + dy * axes.right.y,
    v: -(dx * axes.up.x + dy * axes.up.y), // 画面y=下なので上方向を正に反転
  }
}

// ---- 描画 ----

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
  const axes = getFaceAxes(lm, w, h)
  const activeSet = getActiveSet(type, side)
  const triangles = getActiveTriangles(type, side)

  // アクティブランドマークの顔ローカル座標 bounding box
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const idx of activeSet) {
    if (idx >= lm.length) continue
    const { u, v } = projectLocal(lm[idx].x * w, lm[idx].y * h, axes)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  const uRange = maxU - minU || 1
  const vRange = maxV - minV || 1
  const iw = img.width, ih = img.height

  for (const [i0, i1, i2] of triangles) {
    if (i0 >= lm.length || i1 >= lm.length || i2 >= lm.length) continue

    const dx0 = lm[i0].x * w, dy0 = lm[i0].y * h
    const dx1 = lm[i1].x * w, dy1 = lm[i1].y * h
    const dx2 = lm[i2].x * w, dy2 = lm[i2].y * h

    // 顔ローカル座標 → 画像UV（vは上=0、下=height）
    const p0 = projectLocal(dx0, dy0, axes)
    const p1 = projectLocal(dx1, dy1, axes)
    const p2 = projectLocal(dx2, dy2, axes)

    // v軸: minV=顔上端=画像上(0), maxV=顔下端=画像下(ih)
    const sx0 = ((p0.u - minU) / uRange) * iw
    const sy0 = ((p0.v - minV) / vRange) * ih
    const sx1 = ((p1.u - minU) / uRange) * iw
    const sy1 = ((p1.v - minV) / vRange) * ih
    const sx2 = ((p2.u - minU) / uRange) * iw
    const sy2 = ((p2.v - minV) / vRange) * ih

    drawAffineTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2)
  }
}
