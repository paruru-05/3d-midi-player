import * as THREE from "three";

/**
 * Per-instance emissive strength for note meshes.
 *
 * MeshStandardMaterial's `emissive` is uniform for the whole material, so a
 * small shader patch is used to read an instanced `aGlow` attribute and add it
 * to the emissive term. This keeps one draw call per view while letting
 * individual (currently sounding) notes light up.
 */
export function patchNoteGlow(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aGlow;\nvarying float vGlow;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vGlow = aGlow;",
    );
    shader.fragmentShader = `varying float vGlow;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vGlow;",
    );
  };
  material.customProgramCacheKey = () => "note-glow-v1";
}

export function attachGlow(mesh: THREE.InstancedMesh, count: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("aGlow", attr);
  return attr;
}

export function clearGlow(attr: THREE.InstancedBufferAttribute) {
  (attr.array as Float32Array).fill(0);
  attr.needsUpdate = true;
}
