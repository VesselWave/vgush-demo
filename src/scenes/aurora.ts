export const aurora = /* wgsl */ `
    let wave = sin(p.x * 3.2 + t + mouse.x*2.) * .18 + sin(p.x * 7. + t * .63) * .07 + mouse.y*.08;
    let band = exp(-18. * abs(p.y - wave));
    let band2 = exp(-24. * abs(p.y + .22 - sin(p.x * 4. - t * .7 + mouse.x) * .12));
    let sky = vec3f(.015, .025, .06) + max(0., p.y + .4) * vec3f(.01, .02, .07);
    col = sky + band * vec3f(.1, 1., .58) + band2 * vec3f(.25, .22, 1.);`
