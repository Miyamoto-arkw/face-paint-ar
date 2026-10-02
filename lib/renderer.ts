import type { PreparedTexture } from './regions'

/** 継ぎ目の細線を消すため、描画先三角形のクリップを重心から外側へ広げる量（px） */
const SEAM_EXPAND = 0.75

/**
 * テクスチャを顔メッシュに沿ってワープ描画する。
 * layer は透明でクリアしてから描く（合成は呼び出し側で1回だけ行う）。
 * @param pts 顔ランドマークのピクセル座標 [x0,y0,x1,y1,...]
 */
export function drawWarpedTexture(
  layer: CanvasRenderingContext2D,
  tex: PreparedTexture,
  pts: Float32Array,
) {
  const { canvas: img, triangles, srcPoints: s } = tex

  for (let t = 0; t < triangles.length; t++) {
    const [i0, i1, i2] = triangles[t]
    const o = t * 6
    const sx0 = s[o], sy0 = s[o + 1], sx1 = s[o + 2], sy1 = s[o + 3], sx2 = s[o + 4], sy2 = s[o + 5]
    const dx0 = pts[i0 * 2], dy0 = pts[i0 * 2 + 1]
    const dx1 = pts[i1 * 2], dy1 = pts[i1 * 2 + 1]
    const dx2 = pts[i2 * 2], dy2 = pts[i2 * 2 + 1]

    // テクスチャ座標 → 画面座標 のアフィン変換
    const det = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1)
    if (Math.abs(det) < 1e-6) continue
    const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / det
    const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / det
    const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / det
    const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / det
    const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / det
    const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / det

    // 画面上の三角形を少し膨らませてクリップ
    const cx = (dx0 + dx1 + dx2) / 3
    const cy = (dy0 + dy1 + dy2) / 3
    const grow = (x: number, y: number): [number, number] => {
      const vx = x - cx, vy = y - cy
      const len = Math.hypot(vx, vy) || 1
      return [x + (vx / len) * SEAM_EXPAND, y + (vy / len) * SEAM_EXPAND]
    }
    const [ex0, ey0] = grow(dx0, dy0)
    const [ex1, ey1] = grow(dx1, dy1)
    const [ex2, ey2] = grow(dx2, dy2)

    layer.save()
    layer.beginPath()
    layer.moveTo(ex0, ey0)
    layer.lineTo(ex1, ey1)
    layer.lineTo(ex2, ey2)
    layer.closePath()
    layer.clip()
    layer.setTransform(a, b, c, d, e, f)
    layer.drawImage(img, 0, 0)
    layer.restore()
  }
}
