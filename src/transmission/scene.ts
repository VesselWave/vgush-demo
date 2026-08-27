import {
  draw,
  effect,
  frame,
  geometry,
  sampler,
  target,
  type Draw,
  type Effect,
  type Gpu,
  type Geometry,
  type Surface,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu/core";
import type { PaintStore } from "./paint-store";
import { box, plane } from "vgpu/scene";

import { FLOOR_MATRIX, MODEL_MATRIX, type CameraView } from "./camera";
import envCommonWgsl from "./env-common.wgsl?raw";
import skySource from "./sky.wgsl?raw";
import blurSource from "./blur.wgsl?raw";
import backgroundSource from "./scene-background.wgsl?raw";
import floorSource from "./floor.wgsl?raw";
import glassSource from "./glass.wgsl?raw";
import presentSource from "./present.wgsl?raw";
import paintSource from "./paint.wgsl?raw";

// The docs app resolves WGSL imports at build time. Vite's raw loader does not,
// so inline the shared module before vgpu compiles each shader.
const envCommonModule = envCommonWgsl.replace(/^export\s+/gm, "");
const inlineEnvCommon = (source: string) =>
  source.replace(/^import\s+\{[^}]+\}\s+from\s+"\.\/env-common\.wgsl";\s*$/m, envCommonModule);

const skyWgsl = inlineEnvCommon(skySource);
const blurWgsl = inlineEnvCommon(blurSource);
const backgroundWgsl = inlineEnvCommon(backgroundSource);
const floorWgsl = inlineEnvCommon(floorSource);
const glassWgsl = inlineEnvCommon(glassSource);
const presentWgsl = inlineEnvCommon(presentSource);
const paintWgsl = paintSource;

type Output = Surface | Target;

export interface TransmissionControls {
  ior: number;
  roughness: number;
  dispersion: boolean;
  refraction: "simple" | "double";
}

export const DEFAULT_CONTROLS: TransmissionControls = {
  ior: 1.5,
  roughness: 0.06,
  dispersion: true,
  refraction: "double",
};

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const ENV_SIZE: readonly [number, number] = [2048, 1024];
const ENV_LEVELS = 8;
const SCENE_LEVELS = 8;
const BLUR_RADIUS = 1.15;
const MAX_PAINT_SEGMENTS = 128;
const CUBE_SIZE = 1.3;
const FLOOR_SIZE = 90;

const SKY = {
  sun_direction: [-0.724, 0.09, -0.684],
  sun_angular_size: 0.018,
  sun_color: [1.0, 0.88, 0.72],
  sun_intensity: 26,
  zenith_color: [0.05, 0.15, 0.44],
  cloud_coverage: 0.56,
  horizon_color: [0.36, 0.48, 0.74],
  cloud_scale: 0.75,
  ground_color: [0.05, 0.05, 0.056],
  ground_scale: 4.6,
} as const;

const GLASS = {
  thickness: 0.85,
  absorption: [0.3, 0.1, 0.16],
  env_size: ENV_SIZE,
  texel_angle: (2 * Math.PI) / ENV_SIZE[0],
  dispersion_spread: 0.09,
} as const;

interface LevelTargets {
  readonly horizontal: Target;
  readonly vertical: Target;
}

interface Targets {
  readonly hdr: Target;
  readonly pyramid: Texture;
  readonly chain: readonly LevelTargets[];
}

interface BlurPair {
  readonly horizontal: Effect;
  readonly vertical: Effect;
}

export interface Scene {
  readonly env: Texture;
  readonly pyramidSampler: GPUSampler;
  readonly cubeGeometry: Geometry;
  readonly floorGeometry: Geometry;
  readonly background: Draw;
  readonly floor: Draw;
  readonly glass: Draw;
  readonly paintLight: Draw;
  readonly paintGlass: Draw;
  readonly present: Effect;
  readonly blurs: readonly BlurPair[];
  targets: Targets;
}

export async function createScene(gpu: Gpu, output: Output): Promise<Scene> {
  const resources: object[] = [];
  const own = <T extends object>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  try {
    const envSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      // Trilinear: roughness lands on a fractional LOD, so neighbouring levels must blend.
      mipmapFilter: "linear",
      // u wraps the horizon; v must clamp so the poles never bleed across.
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    const pyramidSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      mipmapFilter: "linear",
      // Screen space: a refracted ray that grazes the border must not wrap around.
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const env = own(await bakeEnvironment(gpu, envSampler));
    const targets = createTargets(gpu, output.size);
    resources.push(...targetResources(targets));

    const cubeGeometry = own(geometry(gpu, box({ size: CUBE_SIZE })));
    const floorGeometry = own(
      geometry(
        gpu,
        plane({
          width: FLOOR_SIZE,
          height: FLOOR_SIZE,
          widthSegments: 1,
          heightSegments: 1,
        })
      )
    );

    const background = draw(gpu, {
      shader: backgroundWgsl,
      vertices: 3,
      depth: { write: false, compare: "always" },
    });
    background.set({ env_tex: env, env_samp: envSampler });

    const floor = draw(gpu, {
      shader: floorWgsl,
      geometry: floorGeometry,
      cull: "none",
    });
    floor.set({ env_tex: env, env_samp: envSampler });

    const glass = draw(gpu, {
      shader: glassWgsl,
      geometry: cubeGeometry,
      cull: "back",
    });
    glass.set({ env_tex: env, env_samp: envSampler });

    const paintLight = draw(gpu, {
      shader: paintWgsl,
      vertices: 3,
      cull: "none",
      depth: { write: true, compare: "less" },
    });
    const paintGlass = draw(gpu, {
      shader: paintWgsl,
      vertices: 3,
      cull: "none",
      depth: { write: false, compare: "less" },
    });

    const present = effect(gpu, presentWgsl);

    const blurs: BlurPair[] = [];
    for (let level = 1; level < SCENE_LEVELS; level++) {
      blurs.push({
        horizontal: effect(gpu, blurWgsl),
        vertical: effect(gpu, blurWgsl),
      });
    }

    const scene: Scene = {
      env,
      pyramidSampler,
      cubeGeometry,
      floorGeometry,
      background,
      floor,
      glass,
      paintLight,
      paintGlass,
      present,
      blurs,
      targets,
    };
    bindTargets(scene);

    await Promise.all([
      background.compile(targets.hdr),
      floor.compile(targets.hdr),
      glass.compile(targets.hdr),
      paintLight.compile(targets.hdr),
      paintGlass.compile(targets.hdr),
      present.compile({ colors: [output.format] }),
      ...blurs.flatMap((pair) => [
        pair.horizontal.compile({ colors: [HDR_FORMAT] }),
        pair.vertical.compile({ colors: [HDR_FORMAT] }),
      ]),
    ]);
    return scene;
  } catch (error) {
    rethrow(error, () => destroyResources(resources));
  }
}

// Bake the environment and its Gaussian mip pyramid once at startup.
async function bakeEnvironment(
  gpu: Gpu,
  samplerState: GPUSampler
): Promise<Texture> {
  const resources = new Set<object>();
  const own = <T extends object>(resource: T): T => {
    resources.add(resource);
    return resource;
  };
  const release = (resource: object): void => {
    destroyResources([resource]);
    resources.delete(resource);
  };
  const env = own(
    gpu.device.createTexture({
      size: [...ENV_SIZE],
      format: HDR_FORMAT,
      mipLevelCount: ENV_LEVELS,
      usage: ["texture_binding", "copy_dst"],
    })
  );

  try {
    const sky = effect(gpu, skyWgsl);
    sky.set({ sky: SKY });
    const blur = effect(gpu, blurWgsl);

    let source = own(
      target(gpu, {
        size: [...ENV_SIZE],
        format: HDR_FORMAT,
      })
    );
    await Promise.all([sky.compile(source), blur.compile(source)]);
    frame(gpu, (currentFrame) =>
      currentFrame.pass({ target: source }, (pass) => pass.draw(sky))
    );
    copyIntoLevel(gpu, source, env, 0);

    for (let level = 1; level < ENV_LEVELS; level++) {
      const size: [number, number] = [
        Math.max(1, ENV_SIZE[0] >> level),
        Math.max(1, ENV_SIZE[1] >> level),
      ];
      const horizontal = own(target(gpu, { size, format: HDR_FORMAT }));
      const vertical = own(target(gpu, { size, format: HDR_FORMAT }));
      const texel: [number, number] = [1 / size[0], 1 / size[1]];

      blur.set({
        src: source,
        src_samp: samplerState,
        blur: {
          texel,
          direction: [1, 0],
          radius: BLUR_RADIUS,
          equirect_compensation: 1,
        },
      });
      frame(gpu, (currentFrame) =>
        currentFrame.pass({ target: horizontal }, (pass) => pass.draw(blur))
      );
      blur.set({
        src: horizontal,
        src_samp: samplerState,
        blur: {
          texel,
          direction: [0, 1],
          radius: BLUR_RADIUS,
          equirect_compensation: 0,
        },
      });
      frame(gpu, (currentFrame) =>
        currentFrame.pass({ target: vertical }, (pass) => pass.draw(blur))
      );

      copyIntoLevel(gpu, vertical, env, level);
      release(horizontal);
      release(source);
      source = vertical;
    }
    release(source);
    resources.delete(env);
    return env;
  } catch (error) {
    rethrow(error, () => destroyResources([...resources]));
  }
}

export function createTargets(
  gpu: Gpu,
  size: readonly [number, number]
): Targets {
  const full: readonly [number, number] = [
    Math.max(1, Math.floor(size[0])),
    Math.max(1, Math.floor(size[1])),
  ];
  const levels = Math.max(
    1,
    Math.min(
      SCENE_LEVELS,
      Math.floor(Math.log2(Math.max(full[0], full[1]))) + 1
    )
  );
  const created: object[] = [];
  try {
    const hdr = target(gpu, {
      size: full,
      format: HDR_FORMAT,
      depth: true,
    });
    created.push(hdr);
    const pyramid = gpu.device.createTexture({
      size: [...full],
      format: HDR_FORMAT,
      mipLevelCount: levels,
      usage: ["texture_binding", "copy_dst"],
    });
    created.push(pyramid);
    const chain: LevelTargets[] = [];
    for (let level = 1; level < levels; level++) {
      const levelSize: [number, number] = [
        Math.max(1, full[0] >> level),
        Math.max(1, full[1] >> level),
      ];
      const horizontal = target(gpu, {
        size: levelSize,
        format: HDR_FORMAT,
      });
      created.push(horizontal);
      const vertical = target(gpu, {
        size: levelSize,
        format: HDR_FORMAT,
      });
      created.push(vertical);
      chain.push({ horizontal, vertical });
    }
    return { hdr, pyramid, chain };
  } catch (error) {
    rethrow(error, () => destroyResources(created));
  }
}

export function replaceTargets(
  gpu: Gpu,
  scene: Scene,
  size: readonly [number, number]
): void {
  const previous = scene.targets;
  const next = createTargets(gpu, size);
  try {
    scene.targets = next;
    bindTargets(scene);
  } catch (error) {
    scene.targets = previous;
    rethrow(
      error,
      () => bindTargets(scene),
      () => destroyTargets(next)
    );
  }
  destroyTargets(previous);
}

function bindTargets(scene: Scene): void {
  const { targets } = scene;
  scene.glass.set({
    scene_tex: targets.pyramid,
    scene_samp: scene.pyramidSampler,
  });
  scene.paintLight.set({
    scene_tex: targets.pyramid,
    scene_samp: scene.pyramidSampler,
  });
  scene.paintGlass.set({
    scene_tex: targets.pyramid,
    scene_samp: scene.pyramidSampler,
  });
  scene.present.set({
    color_tex: targets.hdr,
    color_samp: scene.pyramidSampler,
  });

  for (let index = 0; index < scene.blurs.length; index++) {
    const level = targets.chain[index];
    if (!level) break;
    const source =
      index === 0 ? targets.hdr : targets.chain[index - 1].vertical;
    const texel: [number, number] = [
      1 / level.vertical.size[0],
      1 / level.vertical.size[1],
    ];
    scene.blurs[index].horizontal.set({
      src: source,
      src_samp: scene.pyramidSampler,
      blur: {
        texel,
        direction: [1, 0],
        radius: BLUR_RADIUS,
        equirect_compensation: 0,
      },
    });
    scene.blurs[index].vertical.set({
      src: level.horizontal,
      src_samp: scene.pyramidSampler,
      blur: {
        texel,
        direction: [0, 1],
        radius: BLUR_RADIUS,
        equirect_compensation: 0,
      },
    });
  }
}

// Render the opaque scene, build its blur pyramid, then composite the refractive cube.
export function renderScene(
  gpu: Gpu,
  scene: Scene,
  output: Output,
  camera: CameraView | (() => CameraView),
  controls: TransmissionControls,
  paintStore?: PaintStore
): void {
  frame(gpu, (currentFrame) => {
    const view = typeof camera === "function" ? camera() : camera;
    const { targets } = scene;
    scene.background.set({
      scene_camera: {
        tan_half_fov: view.tanHalfFov,
        forward: view.forward,
        aspect: view.aspect,
        right: view.right,
        up: view.up,
      },
    });
    const distance = Math.hypot(view.position[0], view.position[1] - 0.05, view.position[2]);
    const currentPlane = {
      right: [...view.right],
      up: [...view.up],
      width: 2 * distance * view.tanHalfFov * view.aspect,
      height: 2 * distance * view.tanHalfFov,
    };
    const toWorld = (uv: readonly [number, number]): [number, number, number] => [
      (uv[0] - .5) * currentPlane.right[0] * currentPlane.width + (.5 - uv[1]) * currentPlane.up[0] * currentPlane.height,
      .05 + (uv[0] - .5) * currentPlane.right[1] * currentPlane.width + (.5 - uv[1]) * currentPlane.up[1] * currentPlane.height,
      (uv[0] - .5) * currentPlane.right[2] * currentPlane.width + (.5 - uv[1]) * currentPlane.up[2] * currentPlane.height,
    ];
    for (const segment of paintStore?.segments ?? []) {
      if (!segment.worldFrom) {
        segment.worldFrom = toWorld(segment.from);
        segment.worldTo = toWorld(segment.to);
        segment.worldRadius = segment.radius * currentPlane.height;
      }
    }
    const visibleSegments = paintStore?.segments.slice(-MAX_PAINT_SEGMENTS) ?? [];
    const segmentA = Array.from({ length: MAX_PAINT_SEGMENTS }, (_, index) => {
      const segment = visibleSegments[index];
      return segment ? [...segment.worldFrom!, segment.worldRadius!] : [0, 0, 0, 0];
    });
    const segmentB = Array.from({ length: MAX_PAINT_SEGMENTS }, (_, index) => {
      const segment = visibleSegments[index];
      return segment ? [...segment.worldTo!, segment.material] : [0, 0, 0, 0];
    });
    const segmentC = Array.from({ length: MAX_PAINT_SEGMENTS }, (_, index) => {
      const segment = visibleSegments[index];
      return segment ? [...segment.color, 0] : [0, 0, 0, 0];
    });
    scene.floor.set({
      floor_uniforms: {
        view_projection: view.viewProjection,
        model: FLOOR_MATRIX,
        camera_position: view.position,
        light_count: visibleSegments.length,
        light_a: segmentA,
        light_b: segmentB,
        light_color: segmentC,
      },
    });
    const paintUniforms = {
      view_projection: view.viewProjection,
      model: MODEL_MATRIX,
      camera_position: view.position,
      tan_half_fov: view.tanHalfFov,
      forward: view.forward,
      aspect: view.aspect,
      camera_right: view.right,
      count: visibleSegments.length,
      camera_up: view.up,
      cursor_visible: paintStore?.cursorVisible ? 1 : 0,
      plane_center: [0, 0.05, 0],
      plane_width: currentPlane.width,
      plane_right: currentPlane.right,
      plane_height: currentPlane.height,
      plane_up: currentPlane.up,
      cursor_radius: (paintStore?.cursorRadius ?? 0) * currentPlane.height,
      cursor: [...(paintStore?.cursor ?? [.5, .5]), paintStore?.cursorMaterial ?? 0, 0],
      cursor_color: [...(paintStore?.cursorColor ?? [1, 1, 1]), 0],
      scene_levels: targets.chain.length + 1,
      segment_a: segmentA,
      segment_b: segmentB,
      segment_c: segmentC,
    };
    scene.paintLight.set({ paint: { ...paintUniforms, render_material: 0 } });
    scene.paintGlass.set({ paint: { ...paintUniforms, render_material: 1 } });
    scene.glass.set({
      glass: {
        ...GLASS,
        view_projection: view.viewProjection,
        model: MODEL_MATRIX,
        camera_position: view.position,
        ior: controls.ior,
        roughness: controls.roughness,
        dispersion: controls.dispersion ? 1 : 0,
        refraction_mode: controls.refraction === "double" ? 1 : 0,
        scene_levels: targets.chain.length + 1,
        light_count: visibleSegments.length,
        light_a: segmentA,
        light_b: segmentB,
        light_color: segmentC,
      },
    });

    currentFrame.pass({ target: targets.hdr, clear: [0, 0, 0, 1] }, (pass) => {
      pass.draw(scene.background);
      pass.draw(scene.floor);
      pass.draw(scene.paintLight);
    });
    for (let index = 0; index < targets.chain.length; index++) {
      const level = targets.chain[index];
      currentFrame.pass({ target: level.horizontal }, (pass) =>
        pass.draw(scene.blurs[index].horizontal)
      );
      currentFrame.pass({ target: level.vertical }, (pass) =>
        pass.draw(scene.blurs[index].vertical)
      );
    }
  });

  const { targets } = scene;
  copyPyramid(gpu, targets);

  frame(gpu, (currentFrame) => {
    currentFrame.pass({ target: targets.hdr, clear: false }, (pass) => {
      pass.draw(scene.glass);
      pass.draw(scene.paintGlass);
    });
    currentFrame.pass({ target: output }, (pass) => pass.draw(scene.present));
  });
}

function copyPyramid(gpu: Gpu, targets: Targets): void {
  const encoder = gpu.gpu.createCommandEncoder();
  encoder.copyTextureToTexture(
    { texture: targets.hdr.color.gpu },
    { texture: targets.pyramid.gpu, mipLevel: 0 },
    [targets.hdr.size[0], targets.hdr.size[1], 1]
  );
  for (let index = 0; index < targets.chain.length; index++) {
    const level = targets.chain[index];
    encoder.copyTextureToTexture(
      { texture: level.vertical.color.gpu },
      { texture: targets.pyramid.gpu, mipLevel: index + 1 },
      [level.vertical.size[0], level.vertical.size[1], 1]
    );
  }
  gpu.gpu.queue.submit([encoder.finish()]);
}

function copyIntoLevel(
  gpu: Gpu,
  source: Target,
  texture: Texture,
  level: number
): void {
  const encoder = gpu.gpu.createCommandEncoder();
  encoder.copyTextureToTexture(
    { texture: source.color.gpu },
    { texture: texture.gpu, mipLevel: level },
    [source.size[0], source.size[1], 1]
  );
  gpu.gpu.queue.submit([encoder.finish()]);
}

export function normalizeControls(
  controls: Readonly<TransmissionControls>
): TransmissionControls {
  return {
    ior: Math.max(
      1,
      Math.min(
        2.4,
        Number.isFinite(controls.ior) ? controls.ior : DEFAULT_CONTROLS.ior
      )
    ),
    roughness: Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(controls.roughness)
          ? controls.roughness
          : DEFAULT_CONTROLS.roughness
      )
    ),
    dispersion: Boolean(controls.dispersion),
    refraction: controls.refraction === "double" ? "double" : "simple",
  };
}

export function aspectOf(output: Output): number {
  return output.size[0] / Math.max(1, output.size[1]);
}

export function destroyScene(scene: Scene): void {
  destroyResources([
    scene.env,
    scene.cubeGeometry,
    scene.floorGeometry,
    ...targetResources(scene.targets),
  ]);
}

export function destroyTargets(targets: Targets): void {
  destroyResources(targetResources(targets));
}

function targetResources(targets: Targets): object[] {
  const resources: object[] = [targets.hdr, targets.pyramid];
  for (const level of targets.chain) {
    resources.push(level.horizontal, level.vertical);
  }
  return resources;
}

function destroyResources(resources: readonly object[]): void {
  let firstError: unknown;
  let failed = false;
  for (let index = resources.length - 1; index >= 0; index--) {
    try {
      (resources[index] as { destroy?: () => void }).destroy?.();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
  }
  if (failed) throw firstError;
}

function rethrow(error: unknown, ...cleanups: readonly (() => void)[]): never {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // Cleanup must not mask the primary failure.
    }
  }
  throw error;
}
