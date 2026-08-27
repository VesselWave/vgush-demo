export const torus = /* wgsl */ `
    let torusPointer = vec2f(-mouse.x, mouse.y);
    let ro = vec3f(0., 0., -3.5);
    let rd = normalize(vec3f(p + torusPointer*.1, 2.05));
    var travel = 0.; var hit = 0.; var shade = 0.;
    for (var i = 0; i < 88; i++) {
      var q = ro + rd * travel;
      let ax = t*.31; let cx = cos(ax); let sx = sin(ax);
      q = vec3f(q.x, cx*q.y-sx*q.z, sx*q.y+cx*q.z);
      let ay = t*.23; let cy = cos(ay); let sy = sin(ay);
      q = vec3f(cy*q.x-sy*q.z, q.y, sy*q.x+cy*q.z);
      let az = t*.17; let cz = cos(az); let sz = sin(az);
      q = vec3f(cz*q.x-sz*q.y, sz*q.x+cz*q.y, q.z);
      let ring = vec2f(length(q.xy)-.82, q.z);
      let d = length(ring)-.22;
      if (d < .002) {
        hit = 1.;
        shade = .5 + .5*sin(atan2(q.y,q.x)*12. + t*2.);
        break;
      }
      travel += d; if (travel > 8.) { break; }
    }
    col = hit * mix(vec3f(.02,.2,.9), vec3f(1.,.08,.32), shade) * (1.25-travel*.13);`
