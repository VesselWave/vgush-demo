export interface StrokeSegment {
  from: [number, number]
  to: [number, number]
  color: [number, number, number]
  radius: number
  material: number
  worldFrom?: [number, number, number]
  worldTo?: [number, number, number]
  worldRadius?: number
}

export interface PaintStore {
  segments: StrokeSegment[]
  cursor: [number, number]
  cursorColor: [number, number, number]
  cursorRadius: number
  cursorMaterial: number
  cursorVisible: boolean
  version: number
}

export function createPaintStore(): PaintStore {
  return {
    segments: [],
    cursor: [.5, .5],
    cursorColor: [1, .08, .55],
    cursorRadius: .025,
    cursorMaterial: 0,
    cursorVisible: false,
    version: 0,
  }
}

export function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [16, 8, 0].map(shift => {
    const srgb = ((value >> shift) & 255) / 255
    return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4
  }) as [number, number, number]
}
