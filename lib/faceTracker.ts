import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/models/face_landmarker.task'
export const LANDMARK_COUNT = 468

/** GPUで初期化し、失敗したらCPUにフォールバック */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
  try {
    return await FaceLandmarker.createFromOptions(vision, options('GPU'))
  } catch (e) {
    console.warn('GPU delegate failed, falling back to CPU', e)
    return await FaceLandmarker.createFromOptions(vision, options('CPU'))
  }
}

/**
 * ランドマークのジッターを抑える適応型スムージング。
 * 動きが小さいときは強く平滑化（震え除去）、大きいときは弱めて追従遅れを防ぐ。
 * 出力はピクセル座標の [x0,y0,x1,y1,...]。
 */
export class LandmarkSmoother {
  private prev: Float32Array | null = null

  reset() {
    this.prev = null
  }

  update(landmarks: { x: number; y: number }[], width: number, height: number): Float32Array {
    const n = LANDMARK_COUNT
    const cur = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      cur[i * 2] = landmarks[i].x * width
      cur[i * 2 + 1] = landmarks[i].y * height
    }
    const prev = this.prev
    if (!prev) {
      this.prev = cur
      return cur
    }

    let disp = 0
    for (let i = 0; i < n * 2; i += 2) disp += Math.hypot(cur[i] - prev[i], cur[i + 1] - prev[i + 1])
    disp /= n
    // 顔の大きさに対する相対移動量で追従度を決める
    const scale = Math.max(width, height) / 640
    const alpha = Math.min(0.9, 0.3 + (disp / scale) * 0.12)

    for (let i = 0; i < n * 2; i++) prev[i] += (cur[i] - prev[i]) * alpha
    return prev
  }
}
