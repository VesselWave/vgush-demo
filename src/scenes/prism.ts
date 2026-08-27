export const prism = /* wgsl */ `
    let ro = vec3f(0., 0., -4.2);
    let rd = normalize(vec3f(p, 2.15));
    var travel = 0.; var hit = 0.; var edge = 0.;
    var glassPoint = vec3f(0.); var glassNormal = vec3f(0.,0.,-1.);

    for (var i = 0; i < 88; i++) {
      let q = ro + rd * travel;
      let cy = cos(t*.28-mouse.x*.5); let sy = sin(t*.28-mouse.x*.5);
      let cx = cos(.38+mouse.y*.32); let sx = sin(.38+mouse.y*.32);
      let yq = vec3f(q.x,cx*q.y-sx*q.z,sx*q.y+cx*q.z);
      let r = vec3f(cy*yq.x-sy*yq.z,yq.y,sy*yq.x+cy*yq.z);
      let a = abs(r)-vec3f(.78);
      let box = length(max(a,vec3f(0.)))+min(max(a.x,max(a.y,a.z)),0.);
      if (box < .002) {
        hit = 1.; glassPoint = r;
        let ar = abs(r);
        if (ar.x > ar.y && ar.x > ar.z) { glassNormal = vec3f(sign(r.x),0.,0.); }
        else if (ar.y > ar.z) { glassNormal = vec3f(0.,sign(r.y),0.); }
        else { glassNormal = vec3f(0.,0.,sign(r.z)); }
        let secondAxis = max(min(ar.x,ar.y),max(min(ar.y,ar.z),min(ar.x,ar.z)));
        edge = smoothstep(.46,.76,secondAxis);
        break;
      }
      travel += box; if (travel > 8.) { break; }
    }

    // A bright perspective checkerboard makes transmission readable at a glance.
    let floorMask = smoothstep(-.5,-.24,p.y);
    let floorDepth = 1./max(.12,p.y+.58);
    let floorUv = vec2f(p.x*floorDepth*1.7,floorDepth*1.15);
    let floorCheck = f32((i32(floor(floorUv.x))+i32(floor(floorUv.y))) & 1);
    let sky = mix(vec3f(.42,.55,.72),vec3f(.12,.2,.34),clamp((p.y+1.)*.55,0.,1.));
    let floorColor = mix(vec3f(.13,.2,.34),vec3f(.48,.6,.76),floorCheck);
    var backdrop = mix(sky,floorColor,floorMask);

    // The pointer is an HDR emitter. The cube blocks direct light but catches it at the edges.
    let emitter = vec2f(mouse.x,-mouse.y);
    let lightDelta = p-emitter;
    let direct = .012/max(.008,dot(lightDelta,lightDelta));
    let emitterCore = exp(-170.*dot(lightDelta,lightDelta));
    backdrop += direct*(1.-hit*.72)*vec3f(1.,.32,.07)+emitterCore*vec3f(1.,.78,.4)*2.4;

    // Sample the checkerboard again through a bent ray. RGB uses three offsets for dispersion.
    let fresnel = pow(1.-clamp(abs(dot(normalize(glassNormal),-rd)),0.,1.),3.);
    let bend = glassNormal.xy*.14 + glassPoint.xy*.035;
    let uvR = p+bend*1.22;
    let uvG = p+bend;
    let uvB = p+bend*.78;
    let depthR = 1./max(.12,uvR.y+.58);
    let depthG = 1./max(.12,uvG.y+.58);
    let depthB = 1./max(.12,uvB.y+.58);
    let gridR = vec2f(uvR.x*depthR*1.7,depthR*1.15);
    let gridG = vec2f(uvG.x*depthG*1.7,depthG*1.15);
    let gridB = vec2f(uvB.x*depthB*1.7,depthB*1.15);
    let checkR = f32((i32(floor(gridR.x))+i32(floor(gridR.y))) & 1);
    let checkG = f32((i32(floor(gridG.x))+i32(floor(gridG.y))) & 1);
    let checkB = f32((i32(floor(gridB.x))+i32(floor(gridB.y))) & 1);
    let transmitted = vec3f(.16+checkR*.48,.24+checkG*.44,.34+checkB*.4);

    // Reflection lives on the faces while the high-contrast backdrop remains visible inside.
    let environment = mix(vec3f(.08,.2,.34),vec3f(.5,.68,.86),clamp(glassNormal.y*.5+.5,0.,1.));
    let innerLight = exp(-30.*length(lightDelta-bend))*.35;
    let glass = transmitted+innerLight*vec3f(1.,.28,.06);
    let reflectedGlass = mix(glass,environment,fresnel*.58);
    let bounced = edge*(.055/max(.045,length(p-emitter)));

    col = mix(backdrop,reflectedGlass,hit);
    col += edge*vec3f(.42,.82,1.3)+bounced*vec3f(1.,.3,.08);`
