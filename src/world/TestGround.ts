/**
 * Gate-1 vertical-slice world: a vast ground plane with multi-scale grid + patchwork fields for speed
 * cues, a lake for water spray, a mini street-canyon of towers, labelled-height pillars, trees, cars
 * and street poles. Every solid prop registers a collider.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng.ts';
import { BoxCollisionWorld } from './collision.ts';
import { NOISE_GLSL, patchMaterial } from '../render/materials.ts';

export const LAKE = { x0: 600, x1: 2600, z0: -800, z1: 800 };

export interface WorldLike {
  readonly group: Group;
  readonly collision: BoxCollisionWorld;
  update(camPos: Vector3, heroPos: Vector3, heroVel: Vector3, dt: number, time: number): void;
  activeChunks(): number;
}

function inLake(x: number, z: number): boolean {
  return x > LAKE.x0 && x < LAKE.x1 && z > LAKE.z0 && z < LAKE.z1;
}

export class TestGround implements WorldLike {
  readonly group = new Group();
  readonly collision: BoxCollisionWorld;
  private water: Mesh;
  private waterMat: MeshStandardMaterial;
  private time = { value: 0 };

  constructor(seed: number) {
    this.group.name = 'TestGround';
    this.collision = new BoxCollisionWorld({
      height: (x, z) => (inLake(x, z) ? -4 : 0),
      water: (x, z) => inLake(x, z),
    });
    const rng = new Rng(seed).fork('testground');
    this.group.add(this.makeGround());
    const { water, mat } = this.makeWater();
    this.water = water;
    this.waterMat = mat;
    this.group.add(water);
    this.group.add(this.makeTowers(rng.fork('towers')));
    this.group.add(this.makeTrees(rng.fork('trees')));
    this.group.add(this.makeCars(rng.fork('cars')));
    this.group.add(this.makePoles());
  }

  private makeGround(): Mesh {
    const geo = new PlaneGeometry(90000, 90000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    patchMaterial(mat, 'testground', (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}`)
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec2 p = vWPos.xz;
          if (p.x > ${LAKE.x0.toFixed(1)} && p.x < ${LAKE.x1.toFixed(1)} && p.y > ${LAKE.z0.toFixed(1)} && p.y < ${LAKE.z1.toFixed(1)}) discard;
          float n1 = fbm2(p / 1400.0);
          float n2 = vnoise(p / 37.0);
          vec2 cell = floor((p + vec2(n1 * 300.0)) / vec2(420.0, 310.0));
          float h = hash12(cell);
          vec3 c0 = vec3(0.19, 0.31, 0.11);
          vec3 c1 = vec3(0.33, 0.37, 0.15);
          vec3 c2 = vec3(0.42, 0.36, 0.22);
          vec3 c3 = vec3(0.15, 0.25, 0.10);
          vec3 field = h < 0.3 ? c0 : h < 0.55 ? c1 : h < 0.75 ? c3 : c2;
          vec3 col = mix(field, field * 1.25, n2 * 0.6);
          // Field furrows (fine stripes) for low-altitude speed sense.
          float fur = gridLine(dot(p, normalize(vec2(1.0, h * 2.0 - 1.0))), 3.0, 0.5);
          col *= 1.0 - fur * 0.12;
          // Roads every 400 m.
          vec2 rd = abs(fract(p / 400.0 + 0.5) - 0.5) * 400.0;
          float rw = fwidth(p.x) + fwidth(p.y);
          float road = 1.0 - smoothstep(7.0, 7.0 + rw, min(rd.x, rd.y));
          col = mix(col, vec3(0.16, 0.16, 0.17), road);
          float dash = road * gridLine(min(rd.x, rd.y) < rd.y ? p.y : p.x, 12.0, 2.5) * (1.0 - smoothstep(0.2, 0.5, min(rd.x, rd.y)));
          col = mix(col, vec3(0.9, 0.85, 0.6), dash * 0.6);
          // Scale grid: 10 m / 100 m / 1 km lines.
          float g10 = max(gridLine(p.x, 10.0, 0.08), gridLine(p.y, 10.0, 0.08));
          float g100 = max(gridLine(p.x, 100.0, 0.3), gridLine(p.y, 100.0, 0.3));
          float g1k = max(gridLine(p.x, 1000.0, 1.6), gridLine(p.y, 1000.0, 1.6));
          col = mix(col, col * 1.35 + 0.02, g10 * 0.25);
          col = mix(col, vec3(0.75, 0.75, 0.7), g100 * 0.35);
          col = mix(col, vec3(0.95, 0.92, 0.8), g1k * 0.55);
          // Spawn pad.
          float pad = 1.0 - smoothstep(18.0, 18.5, length(p));
          col = mix(col, vec3(0.55, 0.55, 0.57), pad);
          diffuseColor.rgb *= col;
          `,
        );
    });
    const m = new Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'ground';
    // Lake bed.
    const bed = new Mesh(
      new PlaneGeometry(LAKE.x1 - LAKE.x0, LAKE.z1 - LAKE.z0).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: 0x23302a, roughness: 1 }),
    );
    bed.position.set((LAKE.x0 + LAKE.x1) / 2, -4, (LAKE.z0 + LAKE.z1) / 2);
    m.add(bed);
    return m;
  }

  private makeWater(): { water: Mesh; mat: MeshStandardMaterial } {
    const geo = new PlaneGeometry(LAKE.x1 - LAKE.x0, LAKE.z1 - LAKE.z0, 1, 1).rotateX(-Math.PI / 2);
    const mat = new MeshStandardMaterial({ color: 0x1b4656, roughness: 0.05, metalness: 0.0 });
    const time = this.time;
    patchMaterial(mat, 'testwater', (s) => {
      s.uniforms.uWaterTime = time;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uWaterTime;')
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `
          {
            vec2 p = vWPos.xz;
            float t = uWaterTime;
            vec2 g = vec2(0.0);
            g += vec2(0.7, 0.3) * cos(dot(p, vec2(0.7, 0.3)) * 0.35 + t * 1.6) * 0.06;
            g += vec2(-0.4, 0.9) * cos(dot(p, vec2(-0.4, 0.9)) * 0.62 + t * 2.1) * 0.04;
            g += vec2(0.2, -1.0) * cos(dot(p, vec2(0.2, -1.0)) * 1.3 + t * 3.0) * 0.025;
            g += vec2(-0.9, -0.2) * cos(dot(p, vec2(-0.9, -0.2)) * 2.7 + t * 4.2) * 0.015;
            vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }
          `,
        );
    });
    const water = new Mesh(geo, mat);
    water.position.set((LAKE.x0 + LAKE.x1) / 2, this.collision.waterLevel, (LAKE.z0 + LAKE.z1) / 2);
    water.receiveShadow = true;
    water.name = 'water';
    return { water, mat };
  }

  private makeTowers(rng: Rng): Group {
    const g = new Group();
    g.name = 'towers';
    interface Tw {
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      color: Color;
      glass: number;
    }
    const towers: Tw[] = [];
    // Labelled-height pillars near spawn: 50, 100, 200, 300 m.
    const pillarColors = [0xd94b3b, 0xe0a030, 0x3b7bd9, 0x2fa36b];
    [50, 100, 200, 300].forEach((h, i) => {
      towers.push({ x: -45, z: -40 - i * 22, w: 6, d: 6, h, color: new Color(pillarColors[i]), glass: 0 });
    });
    // Street-canyon mini city: blocks between avenues every 150 m, central avenue kept open.
    const palette = [0x8fa3b8, 0xb9b2a5, 0x7d8a99, 0xa48f7a, 0xc9c4ba, 0x5f7187, 0x9a6b55, 0xd2d6db];
    for (let bx = -4; bx <= 4; bx++) {
      for (let bz = 0; bz < 20; bz++) {
        const cx = bx * 150;
        const cz = -480 - bz * 150;
        if (Math.abs(cx) < 1) continue; // central avenue (x = 0) stays open as the canyon
        const n = rng.int(1, 4);
        for (let k = 0; k < n; k++) {
          const w = rng.range(26, 52);
          const d = rng.range(26, 52);
          const x = cx + rng.range(-48 + w / 2, 48 - w / 2) * (n > 1 ? 1 : 0.2);
          const z = cz + rng.range(-48 + d / 2, 48 - d / 2) * (n > 1 ? 1 : 0.2);
          const nearAvenue = Math.abs(bx) === 1;
          const h = nearAvenue ? rng.range(140, 330) : rng.range(50, 240);
          towers.push({ x, z, w, d, h, color: new Color(rng.pick(palette)), glass: rng.chance(0.45) ? 1 : 0 });
        }
      }
    }
    // Avenue-flanking towers right at the canyon edges (x = ±(20 + w/2)) for tight threading.
    for (let i = 0; i < 18; i++) {
      for (const side of [-1, 1]) {
        const w = rng.range(28, 40);
        towers.push({
          x: side * (24 + w / 2),
          z: -520 - i * 160 + rng.range(-20, 20),
          w,
          d: rng.range(40, 70),
          h: rng.range(160, 360),
          color: new Color(rng.pick(palette)),
          glass: rng.chance(0.6) ? 1 : 0,
        });
      }
    }

    const geo = new BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.0 });
    patchMaterial(mat, 'testtower', (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nattribute float aGlass;\nvarying float vGlass;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
           vWPos = wp.xyz;
           vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
           vGlass = aGlass;`,
        );
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nvarying float vGlass;\n${NOISE_GLSL}`)
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          float roughnessFactor = roughness;
          vec3 wn = normalize(vWN);
          float isWall = 1.0 - step(0.5, abs(wn.y));
          vec2 fc = abs(wn.x) > 0.5 ? vWPos.zy : vWPos.xy;
          vec2 cellSize = vGlass > 0.5 ? vec2(1.6, 3.8) : vec2(3.2, 3.8);
          vec2 cc = fc / cellSize;
          vec2 f = fract(cc);
          vec2 fw = fwidth(cc) * 1.5;
          vec2 lo = vGlass > 0.5 ? vec2(0.06, 0.1) : vec2(0.2, 0.28);
          vec2 hi = vGlass > 0.5 ? vec2(0.94, 0.92) : vec2(0.8, 0.86);
          vec2 m = smoothstep(lo, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi, f));
          float win = m.x * m.y * isWall * (1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.y)));
          float ground = 1.0 - step(4.5, vWPos.y);
          win *= 1.0 - ground;
          float lit = step(0.72, hash12(floor(cc) + floor(vWPos.y * 0.0)));
          vec3 glassCol = mix(vec3(0.05, 0.08, 0.12), vec3(0.12, 0.16, 0.22), lit * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, win * (vGlass > 0.5 ? 0.92 : 0.85));
          roughnessFactor = mix(roughnessFactor, 0.08, win);
          // roof
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, step(0.5, wn.y));
          `,
        )
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.5, win);');
    });
    const inst = new InstancedMesh(geo, mat, towers.length);
    const glass = new Float32Array(towers.length);
    const m4 = new Matrix4();
    const q = new Quaternion();
    towers.forEach((t, i) => {
      m4.compose(new Vector3(t.x, 0, t.z), q, new Vector3(t.w, t.h, t.d));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, t.color);
      glass[i] = t.glass;
      this.collision.addBox({ cx: t.x, cy: t.h / 2, cz: t.z, hx: t.w / 2, hy: t.h / 2, hz: t.d / 2, yaw: 0, kind: t.glass ? 'glass' : 'solid' });
    });
    inst.geometry.setAttribute('aGlass', new InstancedBufferAttribute(glass, 1));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    g.add(inst);
    return g;
  }

  private makeTrees(rng: Rng): InstancedMesh {
    const trunk = new CylinderGeometry(0.25, 0.35, 3.2, 6).translate(0, 1.6, 0).toNonIndexed();
    const crown = new IcosahedronGeometry(2.6, 1).scale(1, 1.25, 1).translate(0, 5.2, 0);
    colorize(trunk, new Color(0x5a4030));
    colorize(crown, new Color(0x3d6b2a));
    const geo = mergeGeometries([trunk, crown])!;
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const count = 3200;
    const inst = new InstancedMesh(geo, mat, count);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const c = new Color();
    let i = 0;
    while (i < count) {
      const x = rng.range(-2600, 500);
      const z = rng.range(-300, 2200);
      if (Math.hypot(x, z) < 60 || inLake(x, z)) continue;
      const s = rng.range(0.7, 1.5);
      q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      m4.compose(new Vector3(x, 0, z), q, new Vector3(s, s * rng.range(0.85, 1.2), s));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.setHSL(0.25 + rng.range(-0.05, 0.05), 0.35, rng.range(0.75, 1.1)));
      i++;
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    return inst;
  }

  private makeCars(rng: Rng): InstancedMesh {
    const body = new BoxGeometry(4.4, 1.0, 1.9).translate(0, 0.75, 0);
    const cabin = new BoxGeometry(2.4, 0.75, 1.7).translate(-0.2, 1.6, 0);
    const geo = mergeGeometries([body, cabin])!;
    const mat = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
    const count = 260;
    const inst = new InstancedMesh(geo, mat, count);
    inst.instanceMatrix.setUsage(DynamicDrawUsage);
    const colors = [0xc0392b, 0xecf0f1, 0x2c3e50, 0xf1c40f, 0x2980b9, 0x7f8c8d, 0x111111, 0x16a085];
    const m4 = new Matrix4();
    const q = new Quaternion();
    for (let i = 0; i < count; i++) {
      let x: number;
      let z: number;
      let yaw: number;
      if (i < 120) {
        // central canyon avenue
        x = rng.pick([-6, -2.5, 2.5, 6]);
        z = rng.range(-3400, -420);
        yaw = Math.PI / 2;
      } else {
        x = rng.range(-3000, 3000);
        z = 400 * Math.round(rng.range(-3, 3)) + rng.pick([-3, 3]);
        yaw = 0;
        if (inLake(x, z)) x -= 2500;
      }
      q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      m4.compose(new Vector3(x, 0, z), q, new Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, new Color(rng.pick(colors)));
    }
    inst.castShadow = true;
    inst.computeBoundingSphere();
    return inst;
  }

  private makePoles(): InstancedMesh {
    const pole = new CylinderGeometry(0.12, 0.16, 9, 6).translate(0, 4.5, 0);
    const arm = new BoxGeometry(2.2, 0.15, 0.15).translate(1.0, 8.9, 0);
    const geo = mergeGeometries([pole, arm])!;
    const mat = new MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
    const positions: Vector3[] = [];
    for (let z = -440; z > -3400; z -= 36) {
      positions.push(new Vector3(-11, 0, z), new Vector3(11, 0, z));
    }
    const inst = new InstancedMesh(geo, mat, positions.length);
    const m4 = new Matrix4();
    positions.forEach((p, i) => {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.x < 0 ? 0 : Math.PI);
      m4.compose(p, q, new Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
      this.collision.addBox({ cx: p.x, cy: 4.5, cz: p.z, hx: 0.15, hy: 4.5, hz: 0.15, yaw: 0, kind: 'solid' });
    });
    inst.castShadow = true;
    inst.computeBoundingSphere();
    return inst;
  }

  update(_camPos: Vector3, _heroPos: Vector3, _heroVel: Vector3, _dt: number, time: number): void {
    this.time.value = time;
    void this.water;
    void this.waterMat;
  }

  activeChunks(): number {
    return 1;
  }
}

function colorize(geo: BufferGeometry, color: Color): void {
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
}
