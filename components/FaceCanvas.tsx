'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { Design } from '@/types'
import { createFaceLandmarker, LandmarkSmoother } from '@/lib/faceTracker'
import { prepareTexture, type PreparedTexture, type Side } from '@/lib/regions'
import { drawWarpedTexture } from '@/lib/renderer'

export type BlendMode = 'multiply' | 'source-over'

interface Props {
  design: Design | null
  side: Side
  blend: BlendMode
  opacity: number
}

type Status = 'idle' | 'starting' | 'running' | 'error'

export default function FaceCanvas({ design, side, blend, opacity }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const smootherRef = useRef(new LandmarkSmoother())
  const textureRef = useRef<PreparedTexture | null>(null)
  const blendRef = useRef(blend)
  const opacityRef = useRef(opacity)
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const pointsRef = useRef<Float32Array | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [faceFound, setFaceFound] = useState(true)

  useEffect(() => {
    blendRef.current = blend
    opacityRef.current = opacity
  }, [blend, opacity])

  // 絵柄・左右が変わったらテクスチャを作り直す（描画ループは止めない）
  useEffect(() => {
    if (!design) {
      textureRef.current = null
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!cancelled) textureRef.current = prepareTexture(img, design.type, side)
    }
    img.onerror = () => console.error('絵柄画像の読み込みに失敗', design.image_url)
    img.src = design.image_url
    return () => { cancelled = true }
  }, [design, side])

  const renderFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const layer = layerRef.current
    const landmarker = landmarkerRef.current
    if (!video || !canvas || !layer || !landmarker || video.readyState < 2) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      layer.width = w
      layer.height = h
    }

    // 新しいビデオフレームのときだけ検出（結果は保持して毎フレーム描画）
    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      const result = landmarker.detectForVideo(video, performance.now())
      const lm = result.faceLandmarks[0]
      if (lm) {
        pointsRef.current = smootherRef.current.update(lm, w, h)
        setFaceFound(true)
      } else {
        pointsRef.current = null
        smootherRef.current.reset()
        setFaceFound(false)
      }
    }

    const ctx = canvas.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(video, 0, 0, w, h)

    const tex = textureRef.current
    const pts = pointsRef.current
    if (tex && pts) {
      const lctx = layer.getContext('2d')!
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      lctx.clearRect(0, 0, w, h)
      drawWarpedTexture(lctx, tex, pts)
      // 合成は1回だけ（三角形ごとにブレンドしないので継ぎ目・濃淡ムラが出ない）
      ctx.globalCompositeOperation = blendRef.current
      ctx.globalAlpha = opacityRef.current
      ctx.drawImage(layer, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
  }, [])

  // iOS Safari の自動再生制限があるので、タップで開始する
  const start = useCallback(async () => {
    setStatus('starting')
    setError('')
    try {
      const [stream, landmarker] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
        landmarkerRef.current ? Promise.resolve(landmarkerRef.current) : createFaceLandmarker(),
      ])
      landmarkerRef.current = landmarker
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      layerRef.current ??= document.createElement('canvas')
      cancelAnimationFrame(rafRef.current)
      const tick = () => {
        renderFrame()
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      setStatus('running')
    } catch (e) {
      console.error(e)
      const name = e instanceof DOMException ? e.name : ''
      setError(
        name === 'NotAllowedError' ? 'カメラの使用が許可されていません。ブラウザの設定から許可してください。'
          : name === 'NotFoundError' ? 'カメラが見つかりません。'
            : 'カメラまたは顔認識の起動に失敗しました。'
      )
      setStatus('error')
    }
  }, [renderFrame])

  useEffect(() => {
    const video = videoRef.current
    return () => {
      cancelAnimationFrame(rafRef.current)
      const stream = video?.srcObject as MediaStream | null
      stream?.getTracks().forEach(t => t.stop())
      landmarkerRef.current?.close()
    }
  }, [])

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-[3/4] bg-gray-900 rounded-2xl overflow-hidden shadow-xl">
      <video ref={videoRef} playsInline muted className="hidden" />
      {/* 座標計算はカメラ画像そのまま、表示だけ鏡にする */}
      <canvas ref={canvasRef} className="w-full h-full object-cover -scale-x-100" />

      {status !== 'running' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          {status === 'error' && <p className="text-sm text-red-300">{error}</p>}
          <button
            onClick={start}
            disabled={status === 'starting'}
            className="bg-pink-500 hover:bg-pink-600 disabled:opacity-60 text-white px-6 py-3 rounded-full font-medium"
          >
            {status === 'starting' ? '準備中…' : status === 'error' ? 'もう一度試す' : 'カメラを起動'}
          </button>
          {status === 'starting' && <p className="text-xs text-gray-400">初回は顔認識モデルの読み込みに数秒かかります</p>}
        </div>
      )}

      {status === 'running' && !faceFound && (
        <p className="absolute bottom-3 inset-x-0 text-center text-xs text-white/80">顔をカメラに向けてください</p>
      )}
    </div>
  )
}
