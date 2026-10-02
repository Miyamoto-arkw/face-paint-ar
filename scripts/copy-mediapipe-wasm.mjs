// @mediapipe/tasks-vision の wasm を public/ にコピーする。
// JSとwasmのバージョンを必ず一致させるため、CDNではなく同梱版を配信する。
import { cpSync, mkdirSync } from 'node:fs'

const src = 'node_modules/@mediapipe/tasks-vision/wasm'
const dest = 'public/mediapipe/wasm'
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`copied ${src} -> ${dest}`)
