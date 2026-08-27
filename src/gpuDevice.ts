let devicePromise: Promise<any> | undefined

export function getSharedGpuDevice(): Promise<any> {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.')
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw new Error('No compatible GPU adapter was found.')
      const device = await adapter.requestDevice()
      device.lost.then(() => { devicePromise = undefined })
      return device
    })()
  }
  return devicePromise
}
