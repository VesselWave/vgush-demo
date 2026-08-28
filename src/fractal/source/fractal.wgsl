struct Params {
  resolution: vec2f,
  yaw: f32,
  pitch: f32,
  zoom: f32,
  time: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const V0 = vec3f(0.0, 1.0, 0.0);
const V1 = vec3f(0.94280904158, -0.33333333333, 0.0);
const V2 = vec3f(-0.47140452079, -0.33333333333, 0.81649658093);
const V3 = vec3f(-0.47140452079, -0.33333333333, -0.81649658093);
const MAX_LEVELS = 16;
const MAX_STEPS = 128;

// Each invocation carries a moving tetrahedral cell. The cell starts at the
// root and ends at one exact child, which makes the cycle boundary identical
// even when the camera sees the branch from an oblique angle.
var<private> activeCellCenter: vec3f;
var<private> activeCellScale: f32;

struct MapResult {
  distance: f32,
  orbit: f32,
}

fn closestVertex(p: vec3f) -> vec3f {
  var vertex = V0;
  var score = dot(p, V0);
  if (dot(p, V1) > score) { vertex = V1; score = dot(p, V1); }
  if (dot(p, V2) > score) { vertex = V2; score = dot(p, V2); }
  if (dot(p, V3) > score) { vertex = V3; }
  return vertex;
}

fn tetraDistance(p: vec3f) -> f32 {
  return max(max(dot(-V0, p), dot(-V1, p)), max(dot(-V2, p), dot(-V3, p))) - 0.33333333333;
}

// The level count follows the ray cone. Detail smaller than a pixel cannot
// affect the image, so the estimator stays stable without a visible depth cap.
fn mapFractal(point: vec3f, footprint: f32) -> MapResult {
  var p = point;
  var scale = 1.0;
  var orbit = 10.0;
  for (var level = 0; level < MAX_LEVELS; level++) {
    orbit = min(orbit, length(p));
    if (scale * footprint > 0.42 || level == MAX_LEVELS - 1) { break; }
    p = 2.0 * p - closestVertex(p);
    scale *= 2.0;
  }
  let fractal = tetraDistance(p) / scale;
  let cell = tetraDistance((point - activeCellCenter) / activeCellScale) * activeCellScale;
  return MapResult(max(fractal, cell), orbit);
}

fn sceneDistance(p: vec3f, footprint: f32) -> f32 {
  return mapFractal(p, footprint).distance;
}

fn normalAt(p: vec3f, footprint: f32) -> vec3f {
  let e = max(footprint * 1.5, 0.000005);
  let k0 = vec3f(1.0, -1.0, -1.0);
  let k1 = vec3f(-1.0, -1.0, 1.0);
  let k2 = vec3f(-1.0, 1.0, -1.0);
  let k3 = vec3f(1.0, 1.0, 1.0);
  return normalize(
    k0 * sceneDistance(p + k0 * e, footprint) +
    k1 * sceneDistance(p + k1 * e, footprint) +
    k2 * sceneDistance(p + k2 * e, footprint) +
    k3 * sceneDistance(p + k3 * e, footprint)
  );
}

fn softShadow(ro: vec3f, rd: vec3f, footprint: f32) -> f32 {
  var shade = 1.0;
  var t = footprint * 4.0;
  for (var i = 0; i < 28; i++) {
    let h = sceneDistance(ro + rd * t, max(footprint, t * 0.001));
    shade = min(shade, 12.0 * h / t);
    t += clamp(h, footprint * 1.5, 0.12);
    if (shade < 0.02 || t > 2.5) { break; }
  }
  return clamp(shade, 0.0, 1.0);
}

fn ambientOcclusion(p: vec3f, n: vec3f, footprint: f32) -> f32 {
  var ao = 0.0;
  var weight = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = max(footprint * 3.0, f32(i) * 0.018);
    ao += (h - sceneDistance(p + n * h, footprint)) * weight;
    weight *= 0.55;
  }
  return clamp(1.0 - ao * 7.0, 0.28, 1.0);
}

fn sky(rd: vec3f) -> vec3f {
  let horizon = pow(max(0.0, 1.0 - abs(rd.y)), 7.0);
  return vec3f(0.003, 0.004, 0.007) + vec3f(0.014, 0.018, 0.026) * horizon;
}

fn renderView(uv: vec2f, phase: f32, cellCenter: vec3f, cellScale: f32) -> vec4f {
  activeCellCenter = cellCenter;
  activeCellScale = cellScale;
  let cameraScale = exp2(-phase);
  let childCenter = V2 * (1.0 - cameraScale);

  let cp = cos(params.pitch);
  let sp = sin(params.pitch);
  let cy = cos(params.yaw);
  let sy = sin(params.yaw);
  let baseTarget = vec3f(0.0, 0.12, 0.0);
  let lookAt = childCenter + baseTarget * cameraScale;
  let orbit = vec3f(3.05 * sy * cp, 3.05 * sp, 3.05 * cy * cp) * cameraScale;
  let ro = lookAt + orbit;
  let forward = normalize(lookAt - ro);
  let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, forward);

  var screen = uv * 2.0 - 1.0;
  screen.y = -screen.y;
  screen.x *= params.resolution.x / max(params.resolution.y, 1.0);
  // Offset the recursive destination toward the opposite side of the frame.
  screen.x -= 0.44;
  let lens = 0.355;
  let rd = normalize(forward + (right * screen.x + up * screen.y) * lens);
  let pixelCone = (2.0 * lens / max(params.resolution.y, 1.0));

  var t = 0.0;
  var hit = false;
  var footprint = pixelCone * cameraScale;
  var sample = MapResult(0.0, 0.0);
  for (var step = 0; step < MAX_STEPS; step++) {
    footprint = max(pixelCone * t, pixelCone * cameraScale);
    sample = mapFractal(ro + rd * t, footprint);
    if (sample.distance < footprint * 0.72) { hit = true; break; }
    t += max(sample.distance * 0.82, footprint * 0.45);
    if (t > 5.0 * cameraScale) { break; }
  }

  if (!hit) { return vec4f(sky(rd), 1.0); }

  let p = ro + rd * t;
  let n = normalAt(p, footprint);
  let lightDirection = normalize(vec3f(-0.48, 0.76, 0.43));
  let diffuse = max(dot(n, lightDirection), 0.0);
  let shadow = softShadow(p + n * footprint * 2.0, lightDirection, footprint);
  let ao = ambientOcclusion(p, n, footprint);
  let halfVector = normalize(lightDirection - rd);
  let specular = pow(max(dot(n, halfVector), 0.0), 46.0) * shadow;
  let rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

  // Normal-based material is scale invariant, so color cannot expose the seam.
  let facing = 0.5 + 0.5 * n.y;
  let cool = vec3f(0.16, 0.24, 0.36);
  let warm = vec3f(0.56, 0.48, 0.36);
  let material = mix(cool, warm, facing * 0.34);
  var color = material * ao * (0.16 + diffuse * shadow * 1.45);
  color += vec3f(0.72, 0.82, 1.0) * (specular * 0.55 + rim * 0.08 * ao);
  color = color / (color + vec3f(1.0));
  color = pow(color, vec3f(0.4545));
  return vec4f(color, 1.0);
}

fn screenNoise(uv: vec2f) -> f32 {
  let pixel = floor(uv * params.resolution);
  return fract(52.9829189 * fract(dot(pixel, vec2f(0.06711056, 0.00583715))));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Most frames use one raymarch. Near the octave boundary a second raymarch
  // renders only the destination child. A static screen-space dissolve replaces
  // the moving clipping plane, then lands on the exact next-cycle image.
  let phase = fract(params.zoom + params.time * 0.115);
  let root = renderView(uv, phase, vec3f(0.0), 1.0);
  if (phase < 0.88) { return root; }

  let child = renderView(uv, phase, V2 * 0.5, 0.5);
  let fade = smoothstep(0.88, 0.995, phase);
  let noise = screenNoise(uv);
  let dissolve = smoothstep(noise - 0.08, noise + 0.08, fade * 1.16 - 0.08);
  return mix(root, child, dissolve);
}
