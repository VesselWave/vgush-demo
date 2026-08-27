/// <reference types="vite/client" />

interface Navigator {
  readonly gpu?: GPU;
}

type GPU = {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
};

type GPUAdapter = { requestDevice(): Promise<GPUDevice> };
type GPUTextureFormat = string;
