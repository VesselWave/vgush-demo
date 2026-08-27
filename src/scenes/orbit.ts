export const orbit = /* wgsl */ `
    let orbitMouse = vec2f(mouse.x, -mouse.y);
    let orbitp = p - orbitMouse*.1;
    let r = length(orbitp);
    let a = atan2(orbitp.y, orbitp.x);
    let waveAmount = .012 + length(orbitMouse)*.028;
    let waveSpeed = 1. + orbitMouse.x*.35;
    var glow = 0.;
    for (var i = 0; i < 5; i++) {
      let fi = f32(i);
      let rr = .16 + fi * (.105 + orbitMouse.y*.008);
      let arc = sin(a * (2. + fi) + t * waveSpeed * (1.2 - fi * .12) + orbitMouse.x*2.);
      glow += exp(-95. * abs(r - rr - arc * waveAmount));
    }
    let core = .018 / max(.012, r * r);
    col = vec3f(.006, .008, .018) + glow * vec3f(.25, .48, 1.) + core * vec3f(1., .34, .08);`
