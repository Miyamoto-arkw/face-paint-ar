import { CANONICAL_UV, FACE_TRIANGLES, UV_ASPECT } from './faceModel'
import type { DesignType } from '@/types'

/**
 * 左右は「ユーザー自身から見た左右」。
 * 鏡表示なので、ユーザーの左頬は画面の左に映る。
 * 正準UVでは被写体の左側 = u > 0.5。
 */
export type Side = 'left' | 'right'

export const TEXTURE_SIZE = 1024

interface Rect { x: number; y: number; w: number; h: number }

/**
 * 配置プリセット（ユーザーの左側、UV座標 0..1）。
 * 右側は u=0.5 で鏡像にして使う。
 * 調整するときはこの数値だけを触ればよい。
 */
const LEFT_SIDE_RECTS: Record<Exclude<DesignType, 'full'>, Rect> = {
  // 頬骨の下〜口角の上、鼻翼の外側〜フェイスライン手前
  cheek: { x: 0.63, y: 0.47, w: 0.29, h: 0.21 },
  // 目尻の外側〜こめかみ〜耳の手前
  // ※顔メッシュは耳の手前（フェイスライン）までなので、耳そのものには描けない
  eye: { x: 0.75, y: 0.22, w: 0.245, h: 0.28 },
}

function regionRect(type: DesignType, side: Side): Rect {
  if (type === 'full') return { x: 0, y: 0, w: 1, h: 1 }
  const r = LEFT_SIDE_RECTS[type]
  return side === 'left' ? r : { ...r, x: 1 - r.x - r.w }
}

/** 画像を縦横比を保ったまま矩形内に収める（UV空間の縦横比補正込み） */
function fitContain(rect: Rect, imgW: number, imgH: number): Rect {
  // UV上で h/w = (imgH/imgW) / UV_ASPECT にすると実際の顔で元の比率になる
  const targetRatio = imgH / imgW / UV_ASPECT
  let w = rect.w
  let h = w * targetRatio
  if (h > rect.h) {
    h = rect.h
    w = h / targetRatio
  }
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
}

export interface PreparedTexture {
  canvas: HTMLCanvasElement
  /** 描画対象の三角形（ランドマークインデックス） */
  triangles: (readonly [number, number, number])[]
  /** triangles と同順のテクスチャ上ピクセル座標 [x0,y0,x1,y1,x2,y2, ...] */
  srcPoints: Float32Array
}

/**
 * 絵柄PNGを正準UV展開図上の所定位置に描いたテクスチャを作る。
 * 絵柄選択・左右切替のときに1回だけ呼ぶ。
 */
export function prepareTexture(img: HTMLImageElement, type: DesignType, side: Side): PreparedTexture {
  const S = TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!

  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  // 全顔はテンプレート準拠で展開図全体に引き伸ばす。ワンポイントは比率維持で収める
  const place = type === 'full' ? regionRect(type, side) : fitContain(regionRect(type, side), iw, ih)

  // 画面は鏡表示なので、テクスチャ上で左右反転して描くと画面上で「描いたとおり」に見える。
  // 右側は左側の鏡像にしたいので反転しない（= 画面上で反転して見える）。
  const flip = !(type !== 'full' && side === 'right')

  ctx.save()
  if (flip) {
    ctx.translate((place.x * 2 + place.w) * S, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(img, place.x * S, place.y * S, place.w * S, place.h * S)
  ctx.restore()

  // 絵柄の範囲に掛かる三角形だけを抽出（全顔は全部）
  const triangles = FACE_TRIANGLES.filter(tri => {
    if (type === 'full') return true
    const us = tri.map(i => CANONICAL_UV[i][0])
    const vs = tri.map(i => CANONICAL_UV[i][1])
    return Math.max(...us) >= place.x && Math.min(...us) <= place.x + place.w
      && Math.max(...vs) >= place.y && Math.min(...vs) <= place.y + place.h
  })

  const srcPoints = new Float32Array(triangles.length * 6)
  triangles.forEach((tri, t) => {
    tri.forEach((i, k) => {
      srcPoints[t * 6 + k * 2] = CANONICAL_UV[i][0] * S
      srcPoints[t * 6 + k * 2 + 1] = CANONICAL_UV[i][1] * S
    })
  })

  return { canvas, triangles, srcPoints }
}

/** 管理画面用：展開図テンプレート（メッシュ線＋配置枠）を描く。画面上の見え方と同じ向き */
export function drawTemplate(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  // 鏡表示と同じ向きにするため左右反転
  ctx.translate(size, 0)
  ctx.scale(-1, 1)

  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  for (const [a, b, c] of FACE_TRIANGLES) {
    ctx.beginPath()
    ctx.moveTo(CANONICAL_UV[a][0] * size, CANONICAL_UV[a][1] * size)
    ctx.lineTo(CANONICAL_UV[b][0] * size, CANONICAL_UV[b][1] * size)
    ctx.lineTo(CANONICAL_UV[c][0] * size, CANONICAL_UV[c][1] * size)
    ctx.closePath()
    ctx.stroke()
  }

  const colors: Record<string, string> = { cheek: 'rgba(236,72,153,0.8)', eye: 'rgba(59,130,246,0.8)' }
  ctx.lineWidth = 3
  for (const type of ['cheek', 'eye'] as const) {
    for (const side of ['left', 'right'] as const) {
      const r = regionRect(type, side)
      ctx.strokeStyle = colors[type]
      ctx.strokeRect(r.x * size, r.y * size, r.w * size, r.h * size)
    }
  }
  ctx.restore()
}
