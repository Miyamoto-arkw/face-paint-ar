import { CANONICAL_UV, FACE_TRIANGLES } from './faceModel'

/**
 * MediaPipe の顔メッシュは額の途中までしかないので、外周を外側へ1周延長する。
 * 延長頂点は「外周の重心から外向き」に、UV と画面座標の両方で同じ比率だけ押し出す。
 * 上方向（額）は大きく、横・下は控えめに延ばす（横に大きく延ばすと背景に絵柄が浮くため）。
 */
const EXTEND_UP = 0.4
const EXTEND_OTHER = 0.06

type Tri = readonly [number, number, number]

function findOuterLoop(): number[] {
  // 1つの三角形にしか属さない辺 = 境界辺
  const count = new Map<string, number>()
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  for (const [a, b, c] of FACE_TRIANGLES) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) count.set(key(p, q), (count.get(key(p, q)) ?? 0) + 1)
  }
  const adj = new Map<number, number[]>()
  for (const [k, n] of count) {
    if (n !== 1) continue
    const [a, b] = k.split('-').map(Number)
    adj.set(a, [...(adj.get(a) ?? []), b])
    adj.set(b, [...(adj.get(b) ?? []), a])
  }
  // 境界は外周・目・口の複数ループになる。頂点数が最大のものが外周
  const seen = new Set<number>()
  let best: number[] = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const loop = [start]
    seen.add(start)
    let prev = -1, cur = start
    for (;;) {
      const next = (adj.get(cur) ?? []).find(n => n !== prev && !seen.has(n))
      if (next === undefined) break
      loop.push(next)
      seen.add(next)
      prev = cur
      cur = next
    }
    if (loop.length > best.length) best = loop
  }
  return best
}

const OUTER_LOOP = findOuterLoop()
const BASE = CANONICAL_UV.length

const uvCentroid = OUTER_LOOP.reduce(
  (acc, i) => [acc[0] + CANONICAL_UV[i][0] / OUTER_LOOP.length, acc[1] + CANONICAL_UV[i][1] / OUTER_LOOP.length],
  [0, 0],
)

/** 外周頂点ごとの押し出し率（上向きほど大きい） */
const EXTEND_SCALE = OUTER_LOOP.map(i => {
  const dx = CANONICAL_UV[i][0] - uvCentroid[0]
  const dy = CANONICAL_UV[i][1] - uvCentroid[1]
  const up = Math.max(0, -dy / (Math.hypot(dx, dy) || 1)) // 1 = 真上
  return EXTEND_OTHER + (EXTEND_UP - EXTEND_OTHER) * up ** 2
})

/** 延長頂点を含むUV（インデックス 468 以降が延長頂点） */
export const EXT_UV: readonly (readonly [number, number])[] = [
  ...CANONICAL_UV,
  ...OUTER_LOOP.map((i, k) => {
    const s = EXTEND_SCALE[k]
    const [u, v] = CANONICAL_UV[i]
    return [u + (u - uvCentroid[0]) * s, v + (v - uvCentroid[1]) * s] as const
  }),
]

/** 延長部分の三角形を含む全三角形 */
export const EXT_TRIANGLES: readonly Tri[] = [
  ...FACE_TRIANGLES,
  ...OUTER_LOOP.flatMap((a, k) => {
    const k2 = (k + 1) % OUTER_LOOP.length
    const b = OUTER_LOOP[k2]
    const ea = BASE + k, eb = BASE + k2
    return [[a, b, eb] as const, [a, eb, ea] as const]
  }),
]

export const EXT_VERTEX_COUNT = EXT_UV.length

/** 画面上のランドマーク座標 [x0,y0,...]（468点）に延長頂点の座標を追加して返す */
export function extendPoints(pts: Float32Array, out?: Float32Array): Float32Array {
  const res = out && out.length === EXT_VERTEX_COUNT * 2 ? out : new Float32Array(EXT_VERTEX_COUNT * 2)
  res.set(pts.subarray(0, BASE * 2))
  let cx = 0, cy = 0
  for (const i of OUTER_LOOP) { cx += pts[i * 2]; cy += pts[i * 2 + 1] }
  cx /= OUTER_LOOP.length
  cy /= OUTER_LOOP.length
  OUTER_LOOP.forEach((i, k) => {
    const s = EXTEND_SCALE[k]
    const x = pts[i * 2], y = pts[i * 2 + 1]
    res[(BASE + k) * 2] = x + (x - cx) * s
    res[(BASE + k) * 2 + 1] = y + (y - cy) * s
  })
  return res
}
