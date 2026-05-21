function exportSTL(part) {
  let meshes = [];

  switch (part) {
    case 'wing':
      meshes = getWingMesh();
      break;
    case 'fuselage':
      meshes = getFuselageMesh();
      break;
    case 'tail':
      meshes = getTailMesh();
      break;
    default:
      meshes = getAllMeshes();
  }

  if (!meshes.length) {
    alert('STL için model bulunamadı. Önce HESAPLA butonuna tıklayın.');
    return;
  }

  // Create a merged geometry
  const merged = mergeMeshes(meshes);
  if (!merged) return;

  const exporter = new THREE.STLExporter();
  const stlData = exporter.parse(merged, { binary: true });

  const partNames = { wing: 'Kanat', fuselage: 'Govde', tail: 'Kuyruk' };
  const fileName = `zeta_${part}.stl`;

  downloadBlob(stlData, fileName);
}

function mergeMeshes(meshes) {
  if (!meshes.length) return null;

  const positions = [];
  const indices = [];
  let offset = 0;

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    if (!geo) continue;

    const pos = geo.getAttribute('position');
    if (!pos) continue;

    const verts = pos.array;
    for (let i = 0; i < verts.length; i += 3) {
      const v = new THREE.Vector3(verts[i], verts[i+1], verts[i+2]);
      v.applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }

    const idx = geo.getIndex();
    if (idx) {
      const idxArr = idx.array;
      for (let i = 0; i < idxArr.length; i++) {
        indices.push(idxArr[i] + offset);
      }
    } else {
      for (let i = 0; i < verts.length / 3; i++) {
        indices.push(i + offset);
      }
    }

    offset += verts.length / 3;
  }

  if (!positions.length) return null;

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mergedGeo.setIndex(indices);
  mergedGeo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial();
  return new THREE.Mesh(mergedGeo, mat);
}

function downloadBlob(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
