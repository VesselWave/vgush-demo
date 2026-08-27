export const prism = /* wgsl */ `
    let ro = vec3f(0., 0., -4.2);
    let rd = normalize(vec3f(p, 2.15));
    var travel = 0.; var hit = 0.; var edge = 0.; var glassPoint = vec3f(0.);
    for (var i = 0; i < 80; i++) {
      let q = ro + rd * travel;
      let cy = cos(t * .32 - mouse.x*.65); let sy = sin(t * .32 - mouse.x*.65);
      let cx = cos(.42 + mouse.y*.45); let sx = sin(.42 + mouse.y*.45);
      let yq = vec3f(q.x, cx*q.y-sx*q.z, sx*q.y+cx*q.z);
      let r = vec3f(cy*yq.x-sy*yq.z, yq.y, sy*yq.x+cy*yq.z);
      let b = vec3f(.78);
      let a = abs(r)-b;
      let box = length(max(a, vec3f(0.))) + min(max(a.x,max(a.y,a.z)), 0.);
      if (box < .002) {
        hit = 1.; glassPoint = r;
        let ar = abs(r);
        let secondAxis = max(min(ar.x,ar.y),max(min(ar.y,ar.z),min(ar.x,ar.z)));
        edge = smoothstep(.46,.76,secondAxis);
        break;
      }
      travel += box; if (travel > 8.) { break; }
    }

    let panel = floor((p + vec2f(aspect,1.))*vec2f(3.2,3.));
    let checker = fract(sin(dot(panel,vec2f(19.7,53.1)))*143.8);
    let mortar = max(step(.94,fract((p.x+aspect)*3.2)),step(.93,fract((p.y+1.)*3.)));
    let backdrop = mix(vec3f(.018,.022,.035),vec3f(.09,.035,.075),checker*.72) + mortar*vec3f(.14);

    let lightLine = p.y + p.x*.32 + .28 - mouse.y*.12;
    let incomingLight = exp(-85.*abs(lightLine))*smoothstep(-1.25,.35,p.x);
    let refractOffset = glassPoint.xy*.07;
    let refractedLine = (p.y+refractOffset.y) + (p.x+refractOffset.x)*.32 + .18;
    let refractedLight = exp(-115.*abs(refractedLine))*hit;

    let refractedPanel = floor((p + refractOffset + vec2f(aspect,1.))*vec2f(3.2,3.));
    let refractedChecker = fract(sin(dot(refractedPanel,vec2f(19.7,53.1)))*143.8);
    let transmission = mix(vec3f(.025,.045,.07),vec3f(.13,.045,.11),refractedChecker*.7);

    col = backdrop + incomingLight*vec3f(1.,.48,.16)*.85;
    col = mix(col, transmission + backdrop*.42, hit*.76);
    col += edge*vec3f(.35,.75,1.5) + refractedLight*vec3f(.3,.85,1.8)*1.8;`
