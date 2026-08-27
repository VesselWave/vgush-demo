export const city = /* wgsl */ `
    let ro = vec3f(.5 + mouse.x*.28, 1.65, -3.5 + t*.08);
    let rd = normalize(vec3f(p.x + mouse.x*.08, -.24-p.y*.48 - mouse.y*.1, 1.65));
    var hit = 0.; var structure = 0.; var windows = 0.; var travel = 0.; var local = vec2f(0.);
    for (var i = 0; i < 160; i++) {
      travel = f32(i)*.045;
      let q = ro + rd*travel;
      let cell = floor(q.xz);
      local = fract(q.xz)-.5;
      let hash = fract(sin(dot(cell,vec2f(41.3,73.1)))*913.7);
      let footprint = step(max(abs(local.x),abs(local.y)),.34);
      let h = footprint*(.35 + hash*1.25);
      if (q.y <= max(h,0.)) {
        hit = 1.; structure = step(.01,h);
        let rows = step(.42,fract(q.y*7.5));
        let columns = step(.38,fract((local.x+local.y)*6.));
        windows = structure*rows*columns;
        break;
      }
      if (travel > 9.) { break; }
    }
    let sky = mix(vec3f(.008,.015,.04),vec3f(.12,.035,.16),clamp(1.-p.y,0.,1.));
    let edge = smoothstep(.34,.27,max(abs(local.x),abs(local.y)));
    let buildings = vec3f(.055,.12,.26)*(1.+edge*.65) + windows*vec3f(1.,.22,.035)*3.4;
    let roadLine = step(.465,max(abs(local.x),abs(local.y)));
    let floor = vec3f(.012,.02,.045) + roadLine*vec3f(.08,.18,.38);
    let scene = mix(floor,buildings,structure);
    col = mix(sky,scene,hit*exp(-travel*.1));`
