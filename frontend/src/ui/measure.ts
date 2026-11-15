import { useEffect, useState } from 'react'

let ctx: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

/** Width in px of `text` set in the app's Archivo at `size` and `weight`, measured on a canvas. Falls back to a per-character guess. */
export function textWidth(text: string, size = 12, weight = 400): number {
  const key = `${weight}|${size}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d')
    } catch {
      ctx = null
    }
  }
  let w: number
  if (ctx) {
    ctx.font = `${weight} ${size}px Archivo, system-ui, sans-serif`
    w = ctx.measureText(text).width
  } else {
    w = text.length * size * 0.58
  }
  cache.set(key, w)
  return w
}

/** Bumps once the web fonts are loaded, so measurements taken before then are redone. */
export function useFontsReady(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => {
      if (live) {
        cache.clear()
        setN((v) => v + 1)
      }
    })
    return () => {
      live = false
    }
  }, [])
  return n
}
