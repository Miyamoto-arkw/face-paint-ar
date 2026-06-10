'use client'

import { useEffect, useRef } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { FACE_TRIANGLES } from '@/lib/faceMeshTriangles'
import type { Design } from '@/types'

interface Props {
  design: Design | null
}

export default function FaceCanvas({ design }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const designImgRef = useRef<HTMLImageElement | null>(null)
  const designRef = useRef<Design | null>(null)
  const rafRef = useRef<number>(0)
  const lastVideoTimeRef = useRef(-1)
  const lastLandmarksRef = useRef<{ x: number; y: number }[] | null>(null)

  useEffect(() => {
    designRef.current = design
    if (!design) {
      designImgRef.current = null
      return
    }
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
      } catch (e) {
        console.error('カメラアクセス失敗', e)
      }
    }
    startCamera()
    return () => {
      const video = videoRef.current
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  useEffect(() => {
    function render() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const landmarker = landmarkerRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const ctx = canvas.getContext('2d')!
      const w = canvas.width
      const h = canvas.height

      // ミラー描画
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -w, 0, w, h)
      ctx.restore()

      // 新フレームのみ検出
      if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        const result = landmarker.detectForVideo(video, performance.now())
        lastLandmarksRef.current = result.faceLandmarks.length > 0
          ? result.faceLandmarks[0].map(p => ({ x: 1 - p.x, y: p.y }))
          : null
      }

      // メッシュワープ描画
      const img = designImgRef.current
      const d = designRef.current
      const lm = lastLandmarksRef.current
      if (lm && img && d) {
        drawMeshWarp(ctx, lm, img, d.type, w, h)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
        width={640}
        height={480}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full rounded-2xl shadow-xl"
      />
    </div>
  )
}

// 顔のバウンディングボックスを計算
function getFaceBounds(lm: { x: number; y: number }[], w: number, h: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of lm) {
    if (p.x * w < minX) minX = p.x * w
    if (p.y * h < minY) minY = p.y * h
    if (p.x * w > maxX) maxX = p.x * w
    if (p.y * h > maxY) maxY = p.y * h
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

// 三角形1つをアフィン変換で描画
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  // 画像上のソース三角形 (ピクセル座標)
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  // キャンバス上のデスティネーション三角形
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number,
) {
  // ソース→デスティネーションへのアフィン変換行列を求める
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
  ctx.setTransform(a, b, c, d, e, f)
  ctx.globalAlpha = 0.88
  ctx.drawImage(img, 0, 0, img.width, img.height)
  ctx.restore()
}

function drawMeshWarp(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number }[],
  img: HTMLImageElement,
  type: Design['type'],
  w: number,
  h: number
) {
  const bounds = getFaceBounds(lm, w, h)
  const iw = img.width
  const ih = img.height

  // タイプ別にどのランドマーク範囲をマスクするか決める
  // 全三角形のうち、タイプに応じてフィルタリング
  const activeTriangles = getActiveTriangles(type)

  for (const [i0, i1, i2] of activeTriangles) {
    if (i0 >= lm.length || i1 >= lm.length || i2 >= lm.length) continue

    // デスティネーション: キャンバス上の実際の顔座標
    const dx0 = lm[i0].x * w, dy0 = lm[i0].y * h
    const dx1 = lm[i1].x * w, dy1 = lm[i1].y * h
    const dx2 = lm[i2].x * w, dy2 = lm[i2].y * h

    // ソース: 顔バウンディングボックスを基準に画像座標へ正規化
    const sx0 = ((lm[i0].x * w - bounds.minX) / bounds.width) * iw
    const sy0 = ((lm[i0].y * h - bounds.minY) / bounds.height) * ih
    const sx1 = ((lm[i1].x * w - bounds.minX) / bounds.width) * iw
    const sy1 = ((lm[i1].y * h - bounds.minY) / bounds.height) * ih
    const sx2 = ((lm[i2].x * w - bounds.minX) / bounds.width) * iw
    const sy2 = ((lm[i2].y * h - bounds.minY) / bounds.height) * ih

    drawAffineTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2)
  }
}

// タイプ別に使用する三角形を選択
function getActiveTriangles(type: Design['type']): [number, number, number][] {
  if (type === 'full') {
    return FACE_TRIANGLES
  }

  if (type === 'cheek') {
    // 頬エリアのランドマーク（左右の頬骨周辺）
    const leftCheek = new Set([50, 101, 118, 117, 116, 123, 147, 213, 192, 214, 210, 211, 32, 208, 199, 175, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 264, 447, 376, 433, 416, 434, 430, 431, 262, 428, 199])
    const rightCheek = new Set([280, 330, 347, 346, 345, 352, 376, 433, 421, 443, 439, 440, 261, 436, 199, 175, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 264, 447])
    const cheekSet = new Set([...leftCheek, ...rightCheek,
      // 左頬コア
      36, 31, 228, 229, 230, 231, 232, 233, 244, 189, 221, 222, 223, 224, 225, 226, 227,
      // 右頬コア
      266, 261, 448, 449, 450, 451, 452, 453, 464, 413, 441, 442, 443, 444, 445, 446, 342,
      // 共通の頬中央
      50, 187, 207, 216, 215, 214, 192, 213, 212, 202, 204, 194,
      280, 411, 427, 436, 435, 434, 416, 433, 432, 422, 424, 418,
    ])
    return FACE_TRIANGLES.filter(([i0, i1, i2]) =>
      cheekSet.has(i0) || cheekSet.has(i1) || cheekSet.has(i2)
    )
  }

  if (type === 'eye') {
    // 目周辺のランドマーク
    const eyeSet = new Set([
      // 左目周辺
      33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
      // 左眉
      70, 63, 105, 66, 107, 55, 65, 52, 53, 46,
      // 右目周辺
      263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
      // 右眉
      300, 293, 334, 296, 336, 285, 295, 282, 283, 276,
      // 目頭・目尻付近
      130, 25, 110, 24, 23, 22, 26, 112, 243, 190, 56, 28, 27, 29, 30, 247,
      359, 255, 339, 254, 253, 252, 256, 341, 463, 414, 286, 258, 257, 259, 260, 467,
    ])
    return FACE_TRIANGLES.filter(([i0, i1, i2]) =>
      eyeSet.has(i0) || eyeSet.has(i1) || eyeSet.has(i2)
    )
  }

  return FACE_TRIANGLES
}
