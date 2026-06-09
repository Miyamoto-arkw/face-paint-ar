'use client'

import { useEffect, useRef, useCallback } from 'react'
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision'
import type { Design } from '@/types'

interface Props {
  design: Design | null
}

// MediaPipe Face Mesh landmark indices
const LANDMARKS = {
  // 頬: 左頬・右頬の代表点
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  LEFT_CHEEK_TOP: 116,
  RIGHT_CHEEK_TOP: 345,
  // 目: 左目・右目の外角・内角・上下
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  // 全顔: 顔の上下左右
  FACE_TOP: 10,
  FACE_BOTTOM: 152,
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
}

export default function FaceCanvas({ design }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const designImgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number>(0)
  const lastVideoTimeRef = useRef(-1)

  // 絵柄画像をプリロード
  useEffect(() => {
    if (!design) {
      designImgRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = design.image_url
    img.onload = () => { designImgRef.current = img }
  }, [design])

  // MediaPipe 初期化
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

  // カメラ起動
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
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

  const drawDesign = useCallback((
    ctx: CanvasRenderingContext2D,
    lm: { x: number; y: number }[],
    img: HTMLImageElement,
    type: Design['type'],
    w: number,
    h: number
  ) => {
    const pt = (idx: number) => ({ x: lm[idx].x * w, y: lm[idx].y * h })

    if (type === 'full') {
      const top = pt(LANDMARKS.FACE_TOP)
      const bottom = pt(LANDMARKS.FACE_BOTTOM)
      const left = pt(LANDMARKS.FACE_LEFT)
      const right = pt(LANDMARKS.FACE_RIGHT)
      const cx = (left.x + right.x) / 2
      const cy = (top.y + bottom.y) / 2
      const fw = (right.x - left.x) * 1.2
      const fh = (bottom.y - top.y) * 1.15
      ctx.save()
      ctx.globalAlpha = 0.85
      ctx.drawImage(img, cx - fw / 2, cy - fh / 2, fw, fh)
      ctx.restore()

    } else if (type === 'cheek') {
      const cheekSize = (pt(LANDMARKS.RIGHT_CHEEK).x - pt(LANDMARKS.LEFT_CHEEK).x) * 0.28
      for (const idx of [LANDMARKS.LEFT_CHEEK, LANDMARKS.RIGHT_CHEEK]) {
        const c = pt(idx)
        ctx.save()
        ctx.globalAlpha = 0.85
        ctx.drawImage(img, c.x - cheekSize / 2, c.y - cheekSize / 2, cheekSize, cheekSize)
        ctx.restore()
      }

    } else if (type === 'eye') {
      const drawEye = (outerIdx: number, innerIdx: number, topIdx: number, bottomIdx: number, flip: boolean) => {
        const outer = pt(outerIdx)
        const inner = pt(innerIdx)
        const top = pt(topIdx)
        const bottom = pt(bottomIdx)
        const cx = (outer.x + inner.x) / 2
        const cy = (outer.y + inner.y) / 2
        const ew = Math.abs(outer.x - inner.x) * 1.6
        const eh = Math.abs(bottom.y - top.y) * 3.5
        const angle = Math.atan2(inner.y - outer.y, inner.x - outer.x)
        ctx.save()
        ctx.globalAlpha = 0.85
        ctx.translate(cx, cy)
        ctx.rotate(angle)
        if (flip) ctx.scale(-1, 1)
        ctx.drawImage(img, -ew / 2, -eh / 2, ew, eh)
        ctx.restore()
      }
      drawEye(LANDMARKS.LEFT_EYE_OUTER, LANDMARKS.LEFT_EYE_INNER, LANDMARKS.LEFT_EYE_TOP, LANDMARKS.LEFT_EYE_BOTTOM, false)
      drawEye(LANDMARKS.RIGHT_EYE_OUTER, LANDMARKS.RIGHT_EYE_INNER, LANDMARKS.RIGHT_EYE_TOP, LANDMARKS.RIGHT_EYE_BOTTOM, true)
    }
  }, [])

  // レンダリングループ
  const render = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const landmarker = landmarkerRef.current
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(render)
      return
    }

    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height

    // ミラー表示
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(video, -w, 0, w, h)
    ctx.restore()

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      const result = landmarker.detectForVideo(video, performance.now())
      const img = designImgRef.current
      if (result.faceLandmarks.length > 0 && img && design) {
        // ミラー座標に変換（x を反転）
        const lm = result.faceLandmarks[0].map(p => ({ x: 1 - p.x, y: p.y }))
        drawDesign(ctx, lm, img, design.type, w, h)
      }
    }

    rafRef.current = requestAnimationFrame(render)
  }, [design, drawDesign])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

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
