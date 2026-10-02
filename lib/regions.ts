import { UV_ASPECT } from './faceModel'
import { EXT_TRIANGLES, EXT_UV } from './extendedMesh'
import type { DesignType } from '@/types'

/**
 * 左右は「ユーザー自身から見た左右」。
 * 鏡表示なので、ユーザーの左頬は画面の左に映る。
 * 正準UVでは被写体の左側 = u > 0.5。
 */
export type Side = 'left' | 'right'

export const TEXTURE_SIZE = 1024

interface Rect { x: number; y: number; w: number; h: number }
type Point = readonly [number, number]
type Polygon = readonly Point[]

/**
 * 配置範囲（ユーザーの左側、UV座標 0..1 の多角形）。
 * 絵柄はこの多角形の外接矩形に収めて配置し、多角形の外は切り抜く。
 * 右側は u=0.5 で鏡像にして使う。調整するときはこの座標だけを触ればよい。
 */
const LEFT_SIDE_REGIONS: Record<Exclude<DesignType, 'full'>, Polygon> = {
  // 目の下〜口角の少し下、鼻翼の横〜フェイスラインまで
  cheek: [[0.61, 0.42], [0.96, 0.42], [0.96, 0.78], [0.61, 0.78]],
  // 目尻を頂点に、上側は眉の上を通って額の中央まで、下側は頬まで開く扇形
  // ※顔メッシュはフェイスラインまでなので、耳や髪の上には描けない
  eye: [
    [0.74, 0.38],  // 目尻のすぐ外（頂点）
    [0.745, 0.31], // 眉尻
    [0.50, 0.215], // 額の中央（眉間の上）
    // 上辺は延長メッシュ（生え際付近）まで使う
    [0.50, -0.02], // 額の中央・上
    [0.80, -0.02], // 額の外側・上
    [1.0, 0.12],   // こめかみ上
    [1.0, 0.72],   // フェイスライン（頬の下の方）
    [0.80, 0.56],  // 頬（目尻の下方向）
  ],
}

function boundsOf(poly: Polygon): Rect {
  const us = poly.map(p => p[0])
  const vs = poly.map(p => p[1])
  const x = Math.min(...us), y = Math.min(...vs)
  return { x, y, w: Math.max(...us) - x, h: Math.max(...vs) - y }
}

/** 管理画面用：範囲に一番ぴったり収まる絵柄の縦横比（高さ / 幅） */
export function recommendedAspect(type: Exclude<DesignType, 'full'>): number {
  const r = boundsOf(LEFT_SIDE_REGIONS[type])
  return (r.h * UV_ASPECT) / r.w
}

/** 画像を縦横比を保ったまま矩形内に中央寄せで収める（UV空間の縦横比補正込み） */
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

const mirrorRect = (r: Rect): Rect => ({ ...r, x: 1 - r.x - r.w })

function regionPolygon(type: Exclude<DesignType, 'full'>, side: Side): Polygon {
  const poly = LEFT_SIDE_REGIONS[type]
  return side === 'left' ? poly : poly.map(([u, v]) => [1 - u, v] as const)
}

/** 絵柄を置く位置（UV）。左側で計算してから右側は鏡像にする */
function placement(type: DesignType, side: Side, imgW: number, imgH: number): Rect {
  if (type === 'full') return { x: 0, y: 0, w: 1, h: 1 }
  const p = fitContain(boundsOf(LEFT_SIDE_REGIONS[type]), imgW, imgH)
  return side === 'left' ? p : mirrorRect(p)
}

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Polygon, size: number) {
  ctx.beginPath()
  poly.forEach(([u, v], i) => (i === 0 ? ctx.moveTo(u * size, v * size) : ctx.lineTo(u * size, v * size)))
  ctx.closePath()
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
  const place = placement(type, side, iw, ih)

  // 画面は鏡表示なので、テクスチャ上で左右反転して描くと画面上で「描いたとおり」に見える。
  // 右側は左側の鏡像にしたいので反転しない（= 画面上で反転して見える）。
  const flip = !(type !== 'full' && side === 'right')

  ctx.save()
  // 範囲の多角形で切り抜く（目や眉の内側に掛からないように）
  if (type !== 'full') {
    tracePolygon(ctx, regionPolygon(type, side), S)
    ctx.clip()
  }
  if (flip) {
    ctx.translate((place.x * 2 + place.w) * S, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(img, place.x * S, place.y * S, place.w * S, place.h * S)
  ctx.restore()

  // 絵柄の範囲に掛かる三角形だけを抽出（全顔は全部）
  const triangles = EXT_TRIANGLES.filter(tri => {
    if (type === 'full') return true
    const us = tri.map(i => EXT_UV[i][0])
    const vs = tri.map(i => EXT_UV[i][1])
    return Math.max(...us) >= place.x && Math.min(...us) <= place.x + place.w
      && Math.max(...vs) >= place.y && Math.min(...vs) <= place.y + place.h
  })

  const srcPoints = new Float32Array(triangles.length * 6)
  triangles.forEach((tri, t) => {
    tri.forEach((i, k) => {
      srcPoints[t * 6 + k * 2] = EXT_UV[i][0] * S
      srcPoints[t * 6 + k * 2 + 1] = EXT_UV[i][1] * S
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
  for (const [a, b, c] of EXT_TRIANGLES) {
    ctx.beginPath()
    ctx.moveTo(EXT_UV[a][0] * size, EXT_UV[a][1] * size)
    ctx.lineTo(EXT_UV[b][0] * size, EXT_UV[b][1] * size)
    ctx.lineTo(EXT_UV[c][0] * size, EXT_UV[c][1] * size)
    ctx.closePath()
    ctx.stroke()
  }

  const colors: Record<string, string> = { cheek: 'rgba(236,72,153,0.8)', eye: 'rgba(59,130,246,0.8)' }
  ctx.lineWidth = 3
  for (const type of ['cheek', 'eye'] as const) {
    for (const side of ['left', 'right'] as const) {
      ctx.strokeStyle = colors[type]
      tracePolygon(ctx, regionPolygon(type, side), size)
      ctx.stroke()
    }
  }
  ctx.restore()
}
