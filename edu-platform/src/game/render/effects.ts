/**
 * مؤثرات العرض فقط (لا تمس المحاكاة ولا البصمة): نظاما جسيمات بـ draw call واحدة لكلٍّ منهما،
 * وشظايا في InstancedMesh واحدة بلون لكل شظية، وخامات مرسومة إجرائيًا على canvas (لا ملفات صور).
 * المخازن كلها مخصصة مسبقًا، فلا تخصيص في كل إطار.
 */
import * as THREE from "three";
import { ISLAND } from "../core/world";

/* ───────────── جسيمات: نقاط بحجم وشفافية لكل جسيم، draw call واحدة ───────────── */
export type Particles = ReturnType<typeof createParticles>;

export function createParticles(cap: number, additive: boolean) {
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  const size = new Float32Array(cap);
  const alpha = new Float32Array(cap);
  const vel = new Float32Array(cap * 3);
  const life = new Float32Array(cap);
  const maxLife = new Float32Array(cap);
  const grow = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  const attrs = [new THREE.BufferAttribute(pos, 3), new THREE.BufferAttribute(col, 3), new THREE.BufferAttribute(size, 1), new THREE.BufferAttribute(alpha, 1)];
  for (const a of attrs) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", attrs[0]);
  geo.setAttribute("pColor", attrs[1]);
  geo.setAttribute("pSize", attrs[2]);
  geo.setAttribute("pAlpha", attrs[3]);
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute float pSize; attribute float pAlpha; attribute vec3 pColor;
      uniform float scale; varying float vA; varying vec3 vC;
      void main() {
        vA = pAlpha; vC = pColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pSize * scale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  geo.setDrawRange(0, 0);
  let n = 0;
  const c = new THREE.Color();

  function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: number, color: THREE.Color | string, lifeS: number, growPerS = 0) {
    let i = n;
    if (n < cap) n++;
    else {
      // المجمع ممتلئ: نستبدل الجسيم الأقل عمرًا متبقيًا
      let worst = 0;
      for (let k = 1; k < n; k++) if (life[k] < life[worst]) worst = k;
      i = worst;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    size[i] = s;
    if (typeof color === "string") c.set(color);
    else c.copy(color);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    life[i] = lifeS;
    maxLife[i] = lifeS;
    grow[i] = growPerS;
    alpha[i] = 1;
  }

  function update(dt: number, gravity: number, drag: number) {
    const f = Math.max(0, 1 - drag * dt);
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        // نقل آخر جسيم إلى مكانه (المجموعة مضغوطة دائمًا)
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) {
            pos[i * 3 + k] = pos[n * 3 + k];
            vel[i * 3 + k] = vel[n * 3 + k];
            col[i * 3 + k] = col[n * 3 + k];
          }
          size[i] = size[n];
          life[i] = life[n];
          maxLife[i] = maxLife[n];
          grow[i] = grow[n];
        }
        i--;
        continue;
      }
      vel[i * 3 + 1] -= gravity * dt;
      vel[i * 3] *= f;
      vel[i * 3 + 1] *= f;
      vel[i * 3 + 2] *= f;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] += grow[i] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = t < 0.5 ? t * 2 : 1;
    }
    geo.setDrawRange(0, n);
    if (n) for (const a of attrs) a.needsUpdate = true;
  }

  return {
    points,
    spawn,
    update,
    clear() {
      n = 0;
      geo.setDrawRange(0, 0);
    },
    setScale(s: number) {
      mat.uniforms.scale.value = s;
    },
    get count() {
      return n;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ───────────── الشظايا: InstancedMesh واحدة بلون لكل شظية ───────────── */
export type Shards = ReturnType<typeof createShards>;

export function createShards(cap: number, geo: THREE.BufferGeometry, mat: THREE.Material) {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // مخزن الألوان من البداية: إنشاؤه عند أول كسر يغيّر نسخة الظلال فيُعاد ترجمتها وسط اللعب
  mesh.setColorAt(0, new THREE.Color("#ffffff"));
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  const pos = new Float32Array(cap * 3);
  const vel = new Float32Array(cap * 3);
  const rot = new Float32Array(cap * 3);
  const spin = new Float32Array(cap * 3);
  const size = new Float32Array(cap);
  const life = new Float32Array(cap);
  const colors = mesh.instanceColor!.array as Float32Array;
  let n = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  /** شظية واحدة؛ يعيد فهرسها */
  function add(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy: number,
    sz: number,
    sz0: number,
    lifeS: number,
    color: THREE.Color,
  ) {
    let i = n;
    if (n < cap) n++;
    else {
      let worst = 0;
      for (let j = 1; j < n; j++) if (life[j] < life[worst]) worst = j;
      i = worst;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    rot[i * 3] = rx;
    rot[i * 3 + 1] = ry;
    rot[i * 3 + 2] = rz;
    spin[i * 3] = sx;
    spin[i * 3 + 1] = sy;
    spin[i * 3 + 2] = sz;
    size[i] = sz0;
    life[i] = lifeS;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    return i;
  }

  function update(dt: number, gravity: number, seaY: number) {
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        n--;
        if (i !== n) {
          for (let a = 0; a < 3; a++) {
            pos[i * 3 + a] = pos[n * 3 + a];
            vel[i * 3 + a] = vel[n * 3 + a];
            rot[i * 3 + a] = rot[n * 3 + a];
            spin[i * 3 + a] = spin[n * 3 + a];
            colors[i * 3 + a] = colors[n * 3 + a];
          }
          size[i] = size[n];
          life[i] = life[n];
        }
        i--;
        continue;
      }
      vel[i * 3 + 1] -= gravity * dt;
      for (let a = 0; a < 3; a++) {
        pos[i * 3 + a] += vel[i * 3 + a] * dt;
        rot[i * 3 + a] += spin[i * 3 + a] * dt;
      }
      // ارتداد على الجزيرة، وغرق في البحر خارجها
      const onIsland = Math.abs(pos[i * 3]) < ISLAND.hx && Math.abs(pos[i * 3 + 2]) < ISLAND.hz;
      const floor = (onIsland ? 0 : seaY) + size[i] / 2;
      if (pos[i * 3 + 1] < floor) {
        pos[i * 3 + 1] = floor;
        if (onIsland) {
          vel[i * 3 + 1] *= -0.35;
          vel[i * 3] *= 0.6;
          vel[i * 3 + 2] *= 0.6;
          for (let a = 0; a < 3; a++) spin[i * 3 + a] *= 0.6;
        } else life[i] = Math.min(life[i], 0.15);
      }
      const k = life[i] < 0.4 ? life[i] / 0.4 : 1;
      e.set(rot[i * 3], rot[i * 3 + 1], rot[i * 3 + 2]);
      q.setFromEuler(e);
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const sz = size[i] * k;
      s.set(sz, sz * 0.8, sz * 1.1);
      m4.compose(v, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = n;
    if (n) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  return {
    mesh,
    add,
    update,
    clear() {
      n = 0;
      mesh.count = 0;
    },
    get count() {
      return n;
    },
    dispose() {
      mesh.dispose();
    },
  };
}

/* ───────────── خامات إجرائية (canvas) ───────────── */
type Paint = (g: CanvasRenderingContext2D, s: number) => void;

function canvasTexture(size: number, paint: Paint, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  if (g) paint(g, size);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** مولد صغير للرسم الإجرائي (ثابت البذرة: الخامة نفسها في كل تشغيل) */
function lcg(seed: number) {
  let k = seed;
  return () => {
    k = (k * 16807) % 2147483647;
    return k / 2147483647;
  };
}

/** حافة كرتونية داكنة على أطراف كل وجه (الأوجه تأخذ إحداثيات 0..1 كاملة) */
function border(g: CanvasRenderingContext2D, s: number, color: string, w: number) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.strokeRect(w / 2, w / 2, s - w, s - w);
}

/** خشب ساج: ألواح بعروق دافئة */
export function teakTexture() {
  return canvasTexture(128, (g, s) => {
    const r = lcg(7);
    g.fillStyle = "#c27236";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const y = r() * s;
      g.strokeStyle = r() < 0.5 ? "rgba(122,58,20,0.45)" : "rgba(236,160,92,0.35)";
      g.lineWidth = 1 + r() * 2.5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 10, s * 0.7, y + (r() - 0.5) * 10, s, y + (r() - 0.5) * 6);
      g.stroke();
    }
    g.fillStyle = "rgba(90,40,12,0.5)";
    g.fillRect(0, s / 2 - 1, s, 2);
    border(g, s, "#6b3415", 6);
  });
}

/** جريد النخل: أضلاع ذهبية خضراء متوازية */
export function frondTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = "#e9bf55";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      const x = (i + 0.5) * (s / 16);
      g.fillStyle = i % 2 ? "rgba(150,170,60,0.45)" : "rgba(255,226,140,0.55)";
      g.fillRect(x - 3, 0, 5, s);
    }
    g.strokeStyle = "rgba(120,80,20,0.5)";
    g.lineWidth = 2;
    for (let y = 16; y < s; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
    }
    border(g, s, "#8a5a1c", 6);
  });
}

/** حجر بحري مرجاني: وردي كريمي بمسام */
export function coralTexture() {
  return canvasTexture(128, (g, s) => {
    const r = lcg(19);
    g.fillStyle = "#f4c2ab";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 1.5 + r() * 4;
      g.fillStyle = r() < 0.6 ? "rgba(196,110,92,0.55)" : "rgba(255,236,214,0.7)";
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    border(g, s, "#b0675a", 7);
  });
}

/** زجاج معشّق: شبكة معينات ودوائر بألوان مشبعة وخطوط رصاص داكنة */
export function stainedGlassTexture(colors: readonly string[]) {
  return canvasTexture(256, (g, s) => {
    const cells = 4;
    const c = s / cells;
    let k = 0;
    for (let i = 0; i < cells; i++)
      for (let j = 0; j < cells; j++) {
        g.fillStyle = colors[(i * 2 + j * 3 + k++) % colors.length];
        g.fillRect(i * c, j * c, c, c);
        // معيّن داخلي بلون آخر، ودائرة صغيرة في الوسط
        g.fillStyle = colors[(i + j * 2 + 3) % colors.length];
        g.beginPath();
        g.moveTo(i * c + c / 2, j * c + 6);
        g.lineTo(i * c + c - 6, j * c + c / 2);
        g.lineTo(i * c + c / 2, j * c + c - 6);
        g.lineTo(i * c + 6, j * c + c / 2);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.beginPath();
        g.arc(i * c + c / 2, j * c + c / 2, c * 0.13, 0, Math.PI * 2);
        g.fill();
      }
    g.strokeStyle = "#241634";
    g.lineWidth = 5;
    for (let i = 0; i <= cells; i++) {
      g.beginPath();
      g.moveTo(i * c, 0);
      g.lineTo(i * c, s);
      g.moveTo(0, i * c);
      g.lineTo(s, i * c);
      g.stroke();
    }
    g.lineWidth = 3;
    for (let i = 0; i < cells; i++)
      for (let j = 0; j < cells; j++) {
        g.beginPath();
        g.moveTo(i * c + c / 2, j * c + 6);
        g.lineTo(i * c + c - 6, j * c + c / 2);
        g.lineTo(i * c + c / 2, j * c + c - 6);
        g.lineTo(i * c + 6, j * c + c / 2);
        g.closePath();
        g.stroke();
      }
    border(g, s, "#241634", 12);
  });
}

/** صندوق الضوء: شبكة خشبية على ضوء ذهبي (للخامة والتوهج معًا) */
export function lightboxTexture() {
  return canvasTexture(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.7);
    grd.addColorStop(0, "#fff6c2");
    grd.addColorStop(1, "#ffc93a");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#8a4b14";
    g.lineWidth = 4;
    for (let i = 1; i < 6; i++) {
      const p = (i * s) / 6;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(0, p);
      g.moveTo(s - p, 0);
      g.lineTo(s, p);
      g.moveTo(p, s);
      g.lineTo(0, s - p);
      g.moveTo(s - p, s);
      g.lineTo(s, s - p);
      g.stroke();
    }
    border(g, s, "#8a4b14", 10);
  });
}

/** رمل الجزيرة: حبيبات ناعمة تتكرر */
export function sandTexture() {
  const t = canvasTexture(128, (g, s) => {
    const r = lcg(31);
    g.fillStyle = "#f2d39c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(214,170,110,0.35)" : "rgba(255,248,226,0.6)";
      g.fillRect(r() * s, r() * s, 1.5 + r() * 2, 1.5 + r() * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}

/** نقطة مستديرة ناعمة (للدليل ونجوم السماء) */
export function dotTexture() {
  return canvasTexture(32, (g, s) => {
    const d = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    d.addColorStop(0, "rgba(255,255,255,1)");
    d.addColorStop(0.55, "rgba(255,255,255,0.95)");
    d.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = d;
    g.fillRect(0, 0, s, s);
  });
}

/** نقطة الدليل: قلب فاتح بحلقة داكنة (تُلوَّن بلون القذيفة)، فتُقرأ على الرمل نهارًا وعلى الليل */
export function guideDotTexture() {
  return canvasTexture(64, (g, s) => {
    const c = s / 2;
    g.fillStyle = "rgba(255,255,255,1)";
    g.beginPath();
    g.arc(c, c, c * 0.62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(40,24,8,0.85)";
    g.lineWidth = s * 0.12;
    g.beginPath();
    g.arc(c, c, c * 0.72, 0, Math.PI * 2);
    g.stroke();
  });
}

/** قرص بهالة (القمر والشمس): القرص في الوسط والهالة تتلاشى نحو الأطراف */
export function discTexture(core: string, halo: string, coreFrac: number, craters: boolean) {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    const h = g.createRadialGradient(c, c, c * coreFrac * 0.9, c, c, c);
    h.addColorStop(0, halo);
    h.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = h;
    g.fillRect(0, 0, s, s);
    g.fillStyle = core;
    g.beginPath();
    g.arc(c, c, c * coreFrac, 0, Math.PI * 2);
    g.fill();
    if (craters) {
      g.fillStyle = "rgba(170,180,215,0.35)";
      for (const [dx, dy, r] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.1, 0.13],
        [-0.05, 0.35, 0.1],
        [0.35, -0.3, 0.08],
      ] as const) {
        g.beginPath();
        g.arc(c + dx * c * coreFrac, c + dy * c * coreFrac, r * c * coreFrac, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** خريطة تدرج كرتونية بأربع درجات (MeshToonMaterial) */
export function toonGradient(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([96, 168, 222, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** نجمة لامعة رباعية الرؤوس (لا رموز دينية أو وطنية): القنديل المحرَّر يصير واحدة منها */
export function sparkleGeometry(): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  const R = 0.5;
  const r = 0.14;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 ? r : R;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
}
