// STAKK — render pipeline: HDR scene RT (premultiplied alpha) → sub-frame motion-blur accumulation →
// depth-of-field gather (scatter-as-gather, no fg bleed) → composite over brand backdrop + ACES + grade + vignette.
import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const mk = (o = {}) => new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, ...o });
    this.rtScene = mk({ samples: 0, depthTexture: new THREE.DepthTexture(W, H) });
    this.rtLDR = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAcc = mk({ depthBuffer: false });
    this.rtDof = mk({ depthBuffer: false });
    this.quadScene = new THREE.Scene(); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.quadScene.add(this.quad);

    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, w: { value: 1 } }, vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tex; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv) * w; }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, toneMapped: false,
    });

    this.dofMat = new THREE.ShaderMaterial({
      uniforms: {
        tCol: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(W, H) },
        near: { value: 0.1 }, far: { value: 100 }, focus: { value: 5 }, aperture: { value: 0 }, maxR: { value: 22 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tCol, tDepth; uniform vec2 res; uniform float near, far, focus, aperture, maxR;
        varying vec2 vUv;
        float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(d, near, far); }
        float coc(float z){ return min(maxR, aperture * abs(1.0 - focus / z)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec4 c0 = texture2D(tCol, vUv); float z0 = viewZ(vUv); float r0 = coc(z0);
          if (aperture <= 0.0 || maxR < 0.5) { gl_FragColor = c0; return; }
          vec4 acc = c0; float wsum = 1.0;
          const int N = 56; float ga = 2.39996323; float rot = hash(gl_FragCoord.xy) * 6.2831853;
          for (int i = 0; i < N; i++) {
            float fi = float(i) + 0.5;
            float rr = sqrt(fi / float(N)) * maxR;
            float a = fi * ga + rot;
            vec2 o = vec2(cos(a), sin(a)) * rr;
            vec2 uv = vUv + o / res;
            float z = viewZ(uv); float rs = coc(z);
            float lim = z < z0 - 0.02 ? rs : min(rs, r0);
            float w = smoothstep(rr - 1.5, rr + 0.5, lim);
            acc += texture2D(tCol, uv) * w; wsum += w;
          }
          gl_FragColor = acc / wsum;
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });

    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tCol: { value: null }, exposure: { value: 0.8 }, bg: { value: new THREE.Vector3(0.886, 0.231, 0.18) }, bgSpot: { value: new THREE.Vector3(0.5, 0.55, 0.18) },
        vignette: { value: 0.28 }, warm: { value: 0.02 }, contrast: { value: 1.06 }, sat: { value: 1.04 }, res: { value: new THREE.Vector2(W, H) },
        flash: { value: 0 }, flashCol: { value: new THREE.Vector3(1, 0.96, 0.88) },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tCol; uniform float exposure, vignette, warm, contrast, sat, flash; uniform vec3 bg, bgSpot, flashCol; uniform vec2 res;
        varying vec2 vUv;
        vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c){
          const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
          const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
          c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec4 c = texture2D(tCol, vUv);
          float a = clamp(c.a, 0.0, 1.0);
          vec3 fg = a > 1e-4 ? toSRGB(aces(c.rgb / max(c.a, 1e-4))) : vec3(0.0);
          // backdrop: brand colour, lit by a soft studio pool (lighting, not a decorative gradient)
          vec2 p = (vUv - bgSpot.xy) * vec2(res.x / res.y, 1.0);
          float pool = exp(-dot(p, p) / (2.0 * bgSpot.z * bgSpot.z));
          vec3 b = bg * (0.86 + 0.16 * pool);
          vec3 col = fg * a + b * (1.0 - a);
          // grade
          col = (col - 0.5) * contrast + 0.5;
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, sat);
          col += vec3(warm, warm * 0.35, -warm);
          vec2 q = (vUv - 0.5) * vec2(1.0, res.y / res.x * 0.62);
          col *= 1.0 - vignette * smoothstep(0.25, 0.95, length(q) * 1.25);
          col = mix(col, flashCol, flash);
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
  }
  makeFXAA() {
    this.fxaa = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: FS_VERT, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
    this.fxaa.uniforms.resolution.value.set(1 / this.W, 1 / this.H);
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.quadScene, this.quadCam); }

  /** render(scene, camera, {sub: [fn] sub-frame state setters (motion blur), dof, grade}). Sub-frames are also sub-pixel jittered (AA). */
  render(scene, camera, { sub = null, dof = {}, grade = {}, fxaa = true } = {}) {
    const r = this.r, W = this.W, H = this.H;
    r.setClearColor(0x000000, 0);
    const N = sub ? sub.length : 1;
    const halton = (i, b) => { let f = 1, x = 0; while (i > 0) { f /= b; x += f * (i % b); i = Math.floor(i / b); } return x; };
    if (N <= 1) {
      if (sub) sub[0]();
      r.setRenderTarget(this.rtScene); r.clear(); r.render(scene, camera);
      this._dof(this.rtScene.texture, camera, dof);
    } else {
      r.setRenderTarget(this.rtAcc); r.clear();
      const order = sub.map((_, i) => i); const mid = Math.floor(N / 2); order.splice(mid, 1); order.push(mid);
      for (const i of order) {
        sub[i]();
        camera.setViewOffset(W, H, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, W, H);
        r.setRenderTarget(this.rtScene); r.clear(); r.render(scene, camera);
        camera.clearViewOffset();
        this.copyMat.uniforms.tex.value = this.rtScene.texture; this.copyMat.uniforms.w.value = 1 / N;
        this.pass(this.copyMat, this.rtAcc);
      }
      this._dof(this.rtAcc.texture, camera, dof);
    }
    const u = this.finalMat.uniforms;
    u.tCol.value = this.rtDof.texture;
    for (const k in grade) { if (!u[k]) continue; const v = grade[k]; if (typeof v === 'number') u[k].value = v; else u[k].value.copy(v); }
    if (fxaa && N <= 1) {
      if (!this.fxaa) this.makeFXAA();
      this.pass(this.finalMat, this.rtLDR);
      this.fxaa.uniforms.tDiffuse.value = this.rtLDR.texture;
      this.pass(this.fxaa, null);
    } else this.pass(this.finalMat, null);
  }
  _dof(tex, camera, { focus = 6, aperture = 0, maxR = 22 } = {}) {
    const u = this.dofMat.uniforms;
    u.tCol.value = tex; u.tDepth.value = this.rtScene.depthTexture;
    u.near.value = camera.near; u.far.value = camera.far; u.focus.value = focus; u.aperture.value = aperture; u.maxR.value = maxR;
    this.pass(this.dofMat, this.rtDof);
  }
}
