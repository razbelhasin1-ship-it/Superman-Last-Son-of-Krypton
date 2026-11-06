/**
 * Camera-following ground mesh with geometric ring spacing: dense near the viewer, coarse far away.
 * Giant two-triangle planes break varying interpolation (world position, shadow coords) in float32;
 * this keeps every triangle's span proportional to its distance from the camera. Shading must use
 * world-space positions so patterns stay locked to the world while the mesh follows the camera.
 */
import { BufferAttribute, BufferGeometry } from 'three';

export function radialGroundGeometry(maxRadius = 45000, rings = 72, segments = 96, inner = 0.75): BufferGeometry {
  const k = Math.pow(maxRadius / inner, 1 / (rings - 1));
  const verts: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  for (let r = 0; r < rings; r++) {
    const rad = inner * Math.pow(k, r);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      verts.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      normals.push(0, 1, 0);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + r * segments + s;
      const b = 1 + r * segments + ((s + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setIndex(idx);
  return g;
}
