const MAX_SEGMENTS: i32 = 128;

struct PaintScene {
  view_projection: mat4x4f,
  camera_position: vec3f,
  tan_half_fov: f32,
  forward: vec3f,
  aspect: f32,
  camera_right: vec3f,
  count: f32,
  camera_up: vec3f,
  cursor_visible: f32,
  plane_center: vec3f,
  plane_width: f32,
  plane_right: vec3f,
  plane_height: f32,
  plane_up: vec3f,
  cursor_radius: f32,
  cursor: vec4f,
  cursor_color: vec4f,
  render_material: f32,
  scene_levels: f32,
  segment_a: array<vec4f, 128>,
  segment_b: array<vec4f, 128>,
  segment_c: array<vec4f, 128>,
};
@group(0) @binding(0) var<uniform> paint: PaintScene;
@group(0) @binding(1) var scene_tex: texture_2d<f32>;
@group(0) @binding(2) var scene_samp: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let positions = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  var out: VertexOut;
  out.position = vec4f(positions[index], 0.0, 1.0);
  out.uv = positions[index] * vec2f(0.5, -0.5) + 0.5;
  return out;
}

fn world_from_uv(uv: vec2f) -> vec3f {
  return paint.plane_center
    + (uv.x - 0.5) * paint.plane_right * paint.plane_width
    + (0.5 - uv.y) * paint.plane_up * paint.plane_height;
}

fn sphere_hit(ro: vec3f, rd: vec3f, center: vec3f, radius: f32) -> f32 {
  let oc = ro - center;
  let b = dot(rd, oc);
  let h = b * b - dot(oc, oc) + radius * radius;
  if (h < 0.0) { return 1e9; }
  return -b - sqrt(h);
}

fn capsule_hit(ro: vec3f, rd: vec3f, pa: vec3f, pb: vec3f, radius: f32) -> f32 {
  let ba = pb - pa;
  let oa = ro - pa;
  let baba = dot(ba, ba);
  if (baba < 1e-8) { return sphere_hit(ro, rd, pa, radius); }
  let bard = dot(ba, rd);
  let baoa = dot(ba, oa);
  let rdoa = dot(rd, oa);
  let oaoa = dot(oa, oa);
  let a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - radius * radius * baba;
  let h = b * b - a * c;
  if (h >= 0.0 && abs(a) > 1e-7) {
    let t = (-b - sqrt(h)) / a;
    let y = baoa + t * bard;
    if (t > 0.0 && y > 0.0 && y < baba) { return t; }
  }
  return min(sphere_hit(ro, rd, pa, radius), sphere_hit(ro, rd, pb, radius));
}

struct FragmentOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs_main(in: VertexOut) -> FragmentOut {
  let screen = (in.uv * 2.0 - 1.0) * vec2f(paint.aspect, -1.0);
  let rd = normalize(paint.forward + paint.camera_right * screen.x * paint.tan_half_fov + paint.camera_up * screen.y * paint.tan_half_fov);
  let ro = paint.camera_position;
  var nearest = 1e9;
  var hit_color = vec3f(0.0);
  var material = 0.0;
  var hit_a = vec3f(0.0);
  var hit_b = vec3f(0.0);
  var hit_radius = 0.0;

  for (var i = 0; i < MAX_SEGMENTS; i = i + 1) {
    if (i >= i32(paint.count + 0.5)) { break; }
    let a = paint.segment_a[i].xyz;
    let b = paint.segment_b[i].xyz;
    let t = capsule_hit(ro, rd, a, b, paint.segment_a[i].w);
    if (t > 0.0 && t < nearest) {
      nearest = t;
      hit_color = paint.segment_c[i].xyz;
      material = paint.segment_b[i].w;
      hit_a = a;
      hit_b = b;
      hit_radius = paint.segment_a[i].w;
    }
  }

  if (paint.cursor_visible > 0.5) {
    let center = world_from_uv(paint.cursor.xy);
    let t = sphere_hit(ro, rd, center, paint.cursor_radius);
    if (t > 0.0 && t < nearest) {
      nearest = t;
      hit_color = paint.cursor_color.rgb;
      material = paint.cursor.z;
      hit_a = center;
      hit_b = center;
      hit_radius = paint.cursor_radius;
    }
  }
  if (nearest > 1e8 || abs(material - paint.render_material) > 0.25) { discard; }

  let position = ro + rd * nearest;
  let ba = hit_b - hit_a;
  let h = clamp(dot(position - hit_a, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
  let centerline = hit_a + ba * h;
  let normal = normalize(position - centerline);
  let light = normalize(vec3f(-0.45, 0.8, 0.35));
  let diffuse = 0.24 + 0.76 * max(dot(normal, light), 0.0);
  let rim = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);
  let solid = hit_color * (diffuse + rim * 0.8) * 3.2;
  // Painted glass uses the monolith's optical model in screen space. The capsule
  // normal bends the background, each color channel takes a slightly different
  // path, and the chosen color acts as absorption inside the material.
  let facing = clamp(dot(normal, -rd), 0.0, 1.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  let distortion = normal.xy * (0.012 + hit_radius * 0.018) / max(facing, 0.28);
  let lod = clamp(hit_radius * 22.0, 0.0, max(paint.scene_levels - 1.0, 0.0));
  let red = textureSampleLevel(scene_tex, scene_samp, clamp(in.uv + distortion * 1.12, vec2f(0.002), vec2f(0.998)), lod).r;
  let green = textureSampleLevel(scene_tex, scene_samp, clamp(in.uv + distortion, vec2f(0.002), vec2f(0.998)), lod).g;
  let blue = textureSampleLevel(scene_tex, scene_samp, clamp(in.uv + distortion * 0.88, vec2f(0.002), vec2f(0.998)), lod).b;
  let absorption = exp(-(vec3f(1.0) - clamp(hit_color, vec3f(0.0), vec3f(1.0))) * hit_radius * 3.2);
  let transmitted = vec3f(red, green, blue) * absorption;
  let reflected = vec3f(0.34, 0.48, 0.68) + hit_color * 0.22;
  let glass = mix(transmitted, reflected, fresnel) + rim * hit_color * 0.32;
  let is_glass = step(0.5, material);
  let color = mix(solid, glass, is_glass);
  let alpha = 1.0;
  let clip = paint.view_projection * vec4f(position, 1.0);
  var out: FragmentOut;
  out.color = vec4f(color, alpha);
  out.depth = clip.z / clip.w;
  return out;
}
