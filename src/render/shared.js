// 渲染层共享：全局着色器参数（时间、战争迷雾），以及给内置材质打补丁的工具
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uFow: { value: null },
  uFowOn: { value: 0 },
};

const SWAY = (amt) => `
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float hh = max(transformed.y, 0.0);
    transformed.x += sin(uTime * 1.7 + ip.x * 0.61 + ip.z * 0.37) * hh * ${amt.toFixed(3)};
    transformed.z += cos(uTime * 1.3 + ip.x * 0.29 + ip.z * 0.53) * hh * ${(amt * 0.7).toFixed(3)};
  }`;

/**
 * 给 Lambert/Phong/Standard 材质加：世界坐标 → 战争迷雾变暗、可选细节噪声、可选随风摆动。
 * opts: { fog=true, sway=0, detail=null(Texture), detailScale=1/7, fogDim=0.4 }
 */
export function patchMaterial(mat, opts = {}) {
  const fog = opts.fog !== false;
  const sway = opts.sway || 0;
  const detail = opts.detail || null;
  const ds = opts.detailScale || 1 / 7;
  const dim = opts.fogDim ?? 0.4;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uFow = U.uFow;
    sh.uniforms.uFowOn = U.uFowOn;
    if (detail) sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWPos;\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + (sway ? SWAY(sway) : ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp4 = instanceMatrix * wp4;
          #endif
          wp4 = modelMatrix * wp4;
          vWPos = wp4.xz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWPos;\nuniform sampler2D uFow;\nuniform float uFowOn;' + (detail ? '\nuniform sampler2D uDetail;' : ''))
      .replace('#include <map_fragment>', '#include <map_fragment>' + (detail ? `\n diffuseColor.rgb *= texture2D(uDetail, vWPos * ${ds.toFixed(4)}).r * 1.6;` : ''))
      .replace('#include <opaque_fragment>', (fog ? `
        if (uFowOn > 0.5) {
          float fv = texture2D(uFow, vWPos / 200.0).r;
          outgoingLight *= mix(${dim.toFixed(2)}, 1.0, fv);
          outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.82, 0.88, 1.08), (1.0 - fv) * 0.6);
        }` : '') + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `pm${fog ? 1 : 0}_${sway}_${detail ? 1 : 0}_${ds}_${dim}`;
  return mat;
}

// 合并若干"非索引"几何体（只合并 position / normal / color）
export function mergeGeometries(geos) {
  let n = 0;
  const hasColor = geos.every((g) => g.attributes.color);
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = hasColor ? new Float32Array(n * 3) : null;
  let o = 0;
  for (let g of geos) {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
