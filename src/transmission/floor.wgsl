import { env_lod, sample_env } from "./env-common.wgsl";

// A real depth-tested checker plane makes refraction distance legible.
const MAX_LIGHTS: i32 = 128;

struct Floor {
  view_projection: mat4x4f,
  model: mat4x4f,
  camera_position: vec3f,
  light_count: f32,
  light_a: array<vec4f, 128>,
  light_b: array<vec4f, 128>,
  light_color: array<vec4f, 128>,
};
@group(0) @binding(0) var<uniform> floor_uniforms: Floor;
@group(0) @binding(1) var env_tex: texture_2d<f32>;
@group(0) @binding(2) var env_samp: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world_position: vec3f,
};

@vertex
fn vs_main(@location(0) position: vec3f) -> VertexOut {
  let world = floor_uniforms.model * vec4f(position, 1.0);
  var out: VertexOut;
  out.position = floor_uniforms.view_projection * world;
  out.world_position = world.xyz;
  return out;
}

fn checker_box(p: vec2f, w: vec2f) -> f32 {
  let i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
  return 0.5 - 0.5 * i.x * i.y;
}

fn segment_distance(p: vec3f, a: vec3f, b: vec3f) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
  return length(p - (a + ab * t));
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = vec3f(0.0, 1.0, 0.0);
  let to_camera = floor_uniforms.camera_position - in.world_position;
  let view_distance = length(to_camera);
  let view = to_camera / max(view_distance, 1e-4);

  let tile = in.world_position.xz * 0.85;
  let checker = checker_box(tile, fwidth(tile) + vec2f(1e-3));
  var color = vec3f(0.052, 0.055, 0.062) * (0.55 + checker * 1.5);

  let sun = normalize(vec3f(-0.724, 0.09, -0.684));
  color *= 0.55 + 0.45 * clamp(sun.y, 0.0, 1.0) * clamp(dot(normal, sun) * 0.5 + 0.5, 0.0, 1.0);

  let reflected = reflect(-view, normal);
  let lod = env_lod(0.045, dpdx(reflected), dpdy(reflected), 0.003067961661145091);
  let reflection = sample_env(env_tex, env_samp, reflected, lod, vec2f(2048.0, 1024.0));
  let facing = clamp(dot(view, normal), 0.0, 1.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  color = mix(color, reflection, fresnel * 0.85);

  // Painted light spills onto the floor. The inverse-square shoulder keeps small
  // strokes bright while broad strokes wash the studio instead of clipping white.
  var painted_light = vec3f(0.0);
  for (var i = 0; i < MAX_LIGHTS; i = i + 1) {
    if (i >= i32(floor_uniforms.light_count + 0.5)) { break; }
    if (floor_uniforms.light_b[i].w > 0.5) { continue; }
    let radius = max(floor_uniforms.light_a[i].w, 0.025);
    let distance = segment_distance(in.world_position, floor_uniforms.light_a[i].xyz, floor_uniforms.light_b[i].xyz);
    let spill = radius * radius / (distance * distance + radius * radius * 1.8);
    painted_light += floor_uniforms.light_color[i].rgb * spill * 7.5;
  }
  color += painted_light * (0.18 + checker * 0.08);

  // The cube anchors itself with a soft contact shadow and a faint focused caustic.
  let cube_delta = in.world_position.xz - vec2f(0.0);
  let contact = exp(-dot(cube_delta, cube_delta) * 1.7);
  color *= 1.0 - contact * 0.56;
  let caustic_axis = cube_delta - vec2f(-0.34, 0.22);
  let caustic = exp(-(caustic_axis.x * caustic_axis.x * 18.0 + caustic_axis.y * caustic_axis.y * 5.0));
  color += vec3f(0.18, 0.26, 0.34) * caustic * 0.36;

  let fade = clamp(view_distance / 26.0, 0.0, 1.0);
  color = mix(color, vec3f(0.12, 0.16, 0.24), fade * fade * 0.7);

  return vec4f(color, 1.0);
}
