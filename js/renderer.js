"use strict";
var Reflection = Reflection || {
  ambient: new Pixel(0, 0, 0),
  diffuse: new Pixel(1.0, 1.0, 1.0),
  specular: new Pixel(1.0, 1.0, 1.0),
  shininess: 20,
};

Reflection.phongReflectionModel = function(vertex, view, normal, lightPos, phongMaterial) {
  var color = new Pixel(0, 0, 0);
  normal.normalize();

  // diffuse
  var light_dir = new THREE.Vector3().subVectors(lightPos, vertex).normalize();
  var ndotl = normal.dot(light_dir);
  color.plus(phongMaterial.diffuse.copy().multipliedBy(ndotl));

  // Ambient color and specular color
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 12 lines of code.
  color.plus(phongMaterial.ambient);

  var v = view.clone().normalize();
  var r = light_dir.clone().reflect(normal).normalize();
  var alpha = phongMaterial.shininess;
  var ks = phongMaterial.specular;
  color.plus(ks.copy().multipliedBy(Math.pow(Math.max(v.clone().dot(r.clone()), 0),alpha)))
  // ----------- STUDENT CODE END ------------

  return color;
};

var Renderer = Renderer || {
  meshInstances: new Set(),
  width: 1000,
  height: 750,
  negNear: 0.3,
  negFar: 1000,
  fov: 45,
  lightPos: new THREE.Vector3(10, 10, -10),
  shaderMode: "",
  cameraLookAtVector: new THREE.Vector3(0, 0, 0),
  cameraPosition: new THREE.Vector3(0, 0, -10),
  cameraUpVector: new THREE.Vector3(0, -1, 0),
  cameraUpdated: true,
};

Renderer.updateCameraParameters = function() {
  this.camera.position.copy(this.cameraPosition);
  this.camera.up.copy(this.cameraUpVector);
  this.camera.lookAt(this.cameraLookAtVector);
};

Renderer.initialize = function() {
  this.buffer = new Image(this.width, this.height);
  this.zBuffer = [];

  // set camera
  this.camera = new THREE.PerspectiveCamera(
    this.fov,
    this.width / this.height,
    this.negNear,
    this.negFar
  );
  this.updateCameraParameters();

  this.clearZBuffer();
  this.buffer.display(); // initialize canvas
};

Renderer.clearZBuffer = function() {
  for (var x = 0; x < this.width; x++) {
    this.zBuffer[x] = new Float32Array(this.height);
    for (var y = 0; y < this.height; y++) {
      this.zBuffer[x][y] = 1; // z value is in [-1 1];
    }
  }
};

Renderer.addMeshInstance = function(meshInstance) {
  assert(meshInstance.mesh, "meshInstance must have mesh to be added to renderer");
  this.meshInstances.add(meshInstance);
};

Renderer.removeMeshInstance = function(meshInstance) {
  this.meshInstances.delete(meshInstance);
};

Renderer.clear = function() {
  this.buffer.clear();
  this.clearZBuffer();
  Main.context.clearRect(0, 0, Main.canvas.width, Main.canvas.height);
};

Renderer.displayImage = function() {
  this.buffer.display();
};

Renderer.render = function() {
  this.clear();

  var eps = 0.01;
  if (
    !(
      this.cameraUpVector.distanceTo(this.camera.up) < eps &&
      this.cameraPosition.distanceTo(this.camera.position) < eps &&
      this.cameraLookAtVector.distanceTo(Main.controls.target) < eps
    )
  ) {
    this.cameraUpdated = false;
    // update camera position
    this.cameraLookAtVector.copy(Main.controls.target);
    this.cameraPosition.copy(this.camera.position);
    this.cameraUpVector.copy(this.camera.up);
  } else {
    // camera's stable, update url once
    if (!this.cameraUpdated) {
      Gui.updateUrl();
      this.cameraUpdated = true; //update one time
    }
  }

  this.camera.updateMatrixWorld();
  this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);

  // light goes with the camera, COMMENT this line for debugging if you want
  this.lightPos = this.camera.position;

  for (var meshInst of this.meshInstances) {
    var mesh = meshInst.mesh;
    if (mesh !== undefined) {
      for (var faceIdx = 0; faceIdx < mesh.faces.length; faceIdx++) {
        var face = mesh.faces[faceIdx];
        var verts = [mesh.vertices[face.a], mesh.vertices[face.b], mesh.vertices[face.c]];
        var vert_normals = [
          mesh.vertex_normals[face.a],
          mesh.vertex_normals[face.b],
          mesh.vertex_normals[face.c],
        ];

        // camera's view matrix = K * [R | t] where K is the projection matrix and [R | t] is the inverse of the camera pose
        var viewMat = new THREE.Matrix4().multiplyMatrices(
          this.camera.projectionMatrix,
          this.camera.matrixWorldInverse
        );

        Renderer.drawTriangle(verts, vert_normals, mesh.uvs[faceIdx], meshInst.material, viewMat);
      }
    }
  }

  this.displayImage();
};

Renderer.getPhongMaterial = function(uv_here, material) {
  var phongMaterial = {};
  phongMaterial.ambient = Reflection.ambient;

  if (material.diffuse === undefined || uv_here === undefined) {
    phongMaterial.diffuse = Reflection.diffuse;
  } else if (Pixel.prototype.isPrototypeOf(material.diffuse)) {
    phongMaterial.diffuse = material.diffuse;
  } else {
    // note that this function uses point sampling. it would be better to use bilinear
    // subsampling and mipmaps for area sampling, but this good enough for now...
    phongMaterial.diffuse = material.diffuse.getPixel(
      Math.floor(uv_here.x * material.diffuse.width),
      Math.floor(uv_here.y * material.diffuse.height)
    );
  }

  if (material.specular === undefined || uv_here === undefined) {
    phongMaterial.specular = Reflection.specular;
  } else if (Pixel.prototype.isPrototypeOf(material.specular)) {
    phongMaterial.specular = material.specular;
  } else {
    phongMaterial.specular = material.specular.getPixel(
      Math.floor(uv_here.x * material.specular.width),
      Math.floor(uv_here.y * material.specular.height)
    );
  }

  phongMaterial.shininess = Reflection.shininess;

  return phongMaterial;
};

Renderer.projectVerticesNaive = function(verts) {
  // this is a naive orthogonal projection that does not even consider camera pose
  var projectedVerts = [];

  var orthogonalScale = 5;
  for (var i = 0; i < 3; i++) {
    projectedVerts[i] = new THREE.Vector4(verts[i].x, verts[i].y, verts[i].z, 1.0);

    projectedVerts[i].x /= orthogonalScale;
    projectedVerts[i].y /= (orthogonalScale * this.height) / this.width;

    projectedVerts[i].x = (projectedVerts[i].x * this.width) / 2 + this.width / 2;
    projectedVerts[i].y = (projectedVerts[i].y * this.height) / 2 + this.height / 2;
  }

  return projectedVerts;
};

Renderer.projectVertices = function(verts, viewMat) {
  // Vector3/Vector4 array of projected vertices in screen space coordinates
  // (you still need z for z buffering)
  var projectedVerts = [];

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 12 lines of code.
  for (var i = 0; i < 3; i++) {
    projectedVerts[i] = new THREE.Vector4(verts[i].x, verts[i].y, verts[i].z, 1.0);
    projectedVerts[i] = projectedVerts[i].applyMatrix4(viewMat)

    projectedVerts[i].divideScalar(projectedVerts[i].w)
    projectedVerts[i].x = Math.round((projectedVerts[i].x * this.width) / 2 + this.width / 2);
    projectedVerts[i].y = Math.round((projectedVerts[i].y * this.height) / 2 + this.height / 2);
    
  }
  // ----------- STUDENT CODE END ------------

  return projectedVerts;
};

Renderer.computeBoundingBox = function(projectedVerts) {
  // Compute the screen-space bounding box for the triangle defined in projectedVerts[0-2].
  // We will need to call this helper function in the shading functions
  // to loop over pixel locations in the bounding box for rasterization.

  var box = {};
  box.minX = -1;
  box.minY = -1;
  box.maxX = -1;
  box.maxY = -1;

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 14 lines of code.
  let x = [];
  let y = [];
  for (let i = 0; i < 3; i++){
    x.push(projectedVerts[i].x);
    y.push(projectedVerts[i].y);
  }
  box.minX = Math.round(Math.max(0,Math.min(x[0],x[1],x[2])));
  box.maxX = Math.round(Math.min(this.width, Math.max(x[0],x[1],x[2])));
  box.minY = Math.round(Math.max(0, Math.min(y[0],y[1],y[2])));
  box.maxY = Math.round(Math.min(this.height, Math.max(y[0],y[1],y[2])))
  // ----------- STUDENT CODE END ------------

  return box;
};

Renderer.computeBarycentric = function(projectedVerts, x, y) {
  var triCoords = [];
  // (see https://fgiesen.wordpress.com/2013/02/06/the-barycentric-conspirac/)
  // return undefined if (x,y) is outside the triangle
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 15 lines of code.
  var area = Math.abs(.5*((projectedVerts[1].x - projectedVerts[0].x)*(projectedVerts[2].y - projectedVerts[0].y)) - (projectedVerts[2].x - projectedVerts[0].x)*(projectedVerts[1].y - projectedVerts[0].y))

  var A = new THREE.Vector2(projectedVerts[0].x, projectedVerts[0].y);
  var B = new THREE.Vector2(projectedVerts[1].x, projectedVerts[1].y);
  var C = new THREE.Vector2(projectedVerts[2].x, projectedVerts[2].y);
  var P = new THREE.Vector2(x, y);

  let v0x = A.x;
  let v0y = A.y;
  let v1x = B.x;
  let v1y = B.y;
  let v2x = C.x;
  let v2y = C.y;

  var F01 = (v0y - v1y)*P.x + (v1x - v0x)*P.y + (v0x*v1y - v0y * v1x);

  var F12 = (v1y - v2y)*P.x + (v2x - v1x)*P.y + (v1x*v2y - v1y * v2x);

  var F20 = (v2y - v0y)*P.x + (v0x - v2x)*P.y + (v2x*v0y - v2y * v0x);

  if (F01 < 0 || F12 < 0 || F20 < 0) return undefined;
  triCoords.push(F12);
  triCoords.push(F20);
  triCoords.push(F01);
  // ----------- STUDENT CODE END ------------
  return triCoords;
};

Renderer.drawTriangleWire = function(projectedVerts) {
  var color = new Pixel(1.0, 0, 0);
  for (var i = 0; i < 3; i++) {
    var va = projectedVerts[(i + 1) % 3];
    var vb = projectedVerts[(i + 2) % 3];

    var ba = new THREE.Vector2(vb.x - va.x, vb.y - va.y);
    var len_ab = ba.length();
    ba.normalize();
    // draw line
    for (var j = 0; j < len_ab; j += 0.5) {
      var x = Math.round(va.x + ba.x * j);
      var y = Math.round(va.y + ba.y * j);
      this.buffer.setPixel(x, y, color);
    }
  }
};

Renderer.drawTriangleFlat = function(verts, projectedVerts, normals, uvs, material) {
  // Flat shader
  // Color of each face is computed based on the face normal
  // (average of vertex normals) and face centroid.
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 52 lines of code.
  var n = new THREE.Vector3(0,0,0);
  var centroid = new THREE.Vector3(0,0,0);

  for (let i = 0; i < 3; i++){
    centroid.add(verts[i].clone());
    n.add(normals[i].clone());
  }

  n.divideScalar(3).normalize();
  centroid.divideScalar(3)


  var box = this.computeBoundingBox(projectedVerts);
  var color = Reflection.phongReflectionModel(centroid.clone(), centroid.clone().sub(this.cameraPosition.clone()), n, this.lightPos.clone(), this.getPhongMaterial(uvs,material))
  var area = Math.abs(.5*((projectedVerts[1].x - projectedVerts[0].x)*(projectedVerts[2].y - projectedVerts[0].y) - (projectedVerts[2].x - projectedVerts[0].x)*(projectedVerts[1].y - projectedVerts[0].y)))
  for (let i = box.minX; i < box.maxX; i++){
    for(let j = box.minY; j < box.maxY; j++){
        var bary = this.computeBarycentric(projectedVerts, i, j);
        if (bary != undefined) {
          let lamda0 = bary[0]/(2*area);
          let lamda1 = bary[1]/(2*area);
          let lamda2 = bary[2]/(2*area);
          let z = lamda0 * projectedVerts[0].z + lamda1 * projectedVerts[1].z + lamda2 * projectedVerts[2].z;
          if (z <= this.zBuffer[i][j]){
            if (uvs != undefined) {
              let interp_uvs = new THREE.Vector3(0,0,0)
              interp_uvs.add(uvs[0].clone().multiplyScalar(lamda0))
              interp_uvs.add(uvs[1].clone().multiplyScalar(lamda1))
              interp_uvs.add(uvs[2].clone().multiplyScalar(lamda2))
              color = Reflection.phongReflectionModel(centroid.clone(), centroid.clone().sub(this.cameraPosition.clone()), n, this.lightPos.clone(), this.getPhongMaterial(interp_uvs,material))
            }
            this.buffer.setPixel(i, j, color);
            this.zBuffer[i][j] = z;
          }
          
        }
    }
  }
  // ----------- STUDENT CODE END ------------
};

Renderer.drawTriangleGouraud = function(verts, projectedVerts, normals, uvs, material) {
  // Gouraud shader
  // Interpolate the color for each pixel in the triangle using the barycentric coordinate.
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 49 lines of code.

  var box = this.computeBoundingBox(projectedVerts);
  var color0 = Reflection.phongReflectionModel(verts[0].clone(), verts[0].clone().sub(this.cameraPosition.clone()), normals[0], this.lightPos.clone(), this.getPhongMaterial(uvs,material))
  var color1 = Reflection.phongReflectionModel(verts[1].clone(), verts[1].clone().sub(this.cameraPosition.clone()), normals[1], this.lightPos.clone(), this.getPhongMaterial(uvs,material))
  var color2 = Reflection.phongReflectionModel(verts[2].clone(), verts[2].clone().sub(this.cameraPosition.clone()), normals[2], this.lightPos.clone(), this.getPhongMaterial(uvs,material))
  
  var area = Math.abs(.5*((projectedVerts[1].x - projectedVerts[0].x)*(projectedVerts[2].y - projectedVerts[0].y) - (projectedVerts[2].x - projectedVerts[0].x)*(projectedVerts[1].y - projectedVerts[0].y)))
  for (let i = box.minX; i < box.maxX; i++){
    for(let j = box.minY; j < box.maxY; j++){
        var bary = this.computeBarycentric(projectedVerts, i, j);
        if (bary != undefined) {
          let lamda0 = bary[0]/(2*area);
          let lamda1 = bary[1]/(2*area);
          let lamda2 = bary[2]/(2*area);
          let z = lamda0 * projectedVerts[0].z + lamda1 * projectedVerts[1].z + lamda2 * projectedVerts[2].z;
          let c = new Pixel(0,0,0)
          if (z <= this.zBuffer[i][j]){
            if (uvs != undefined) {
              let interp_uvs = new THREE.Vector3(0,0,0)
              interp_uvs.add(uvs[0].clone().multiplyScalar(lamda0))
              interp_uvs.add(uvs[1].clone().multiplyScalar(lamda1))
              interp_uvs.add(uvs[2].clone().multiplyScalar(lamda2))
              color0 = Reflection.phongReflectionModel(verts[0].clone(), verts[0].clone().sub(this.cameraPosition.clone()), normals[0], this.lightPos.clone(), this.getPhongMaterial(interp_uvs,material))
              color1 = Reflection.phongReflectionModel(verts[1].clone(), verts[1].clone().sub(this.cameraPosition.clone()), normals[1], this.lightPos.clone(), this.getPhongMaterial(interp_uvs,material))
              color2 = Reflection.phongReflectionModel(verts[2].clone(), verts[2].clone().sub(this.cameraPosition.clone()), normals[2], this.lightPos.clone(), this.getPhongMaterial(interp_uvs,material))           
             }
              c.plus(color0.copy().multipliedBy(lamda0))
              c.plus(color1.copy().multipliedBy(lamda1))
              c.plus(color2.copy().multipliedBy(lamda2));
            
            
            this.buffer.setPixel(i, j, c);
            this.zBuffer[i][j] = z;
          }
          
        }
    }
  }
  // ----------- STUDENT CODE END ------------
};

Renderer.drawTrianglePhong = function(verts, projectedVerts, normals, uvs, material) {
  // Phong shader
  // (1) Basic Phong shader: Interpolate the normal and vertex for each pixel in the triangle
  //                         using the barycentric coordinate.
  // (2) Texture mapping: If uvs is provided, compute interpolated uv coordinates
  //                      and map the phong material texture (if available)
  //                      at the uv coordinates to the pixel location.
  // (3) XYZ normal mapping: If xyz normal texture exists for the material,
  //                         convert the RGB value of the XYZ normal texture at the uv coordinates
  //                         to a normal vector and apply it at the pixel location.
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 62 lines of code.
  var box = this.computeBoundingBox(projectedVerts);

  var area = Math.abs(.5*((projectedVerts[1].x - projectedVerts[0].x)*(projectedVerts[2].y - projectedVerts[0].y) - (projectedVerts[2].x - projectedVerts[0].x)*(projectedVerts[1].y - projectedVerts[0].y)))
  for (let i = box.minX; i < box.maxX; i++){
    for(let j = box.minY; j < box.maxY; j++){
        var bary = this.computeBarycentric(projectedVerts, i, j);
        if (bary != undefined) {
          let lamda0 = bary[0]/(2*area);
          let lamda1 = bary[1]/(2*area);
          let lamda2 = bary[2]/(2*area);
          let z = lamda0 * projectedVerts[0].z + lamda1 * projectedVerts[1].z + lamda2 * projectedVerts[2].z;
          let interp_vert = new THREE.Vector3(0,0,0);
          let interp_norm = new THREE.Vector3(0,0,0);
          if (z <= this.zBuffer[i][j]){
            interp_vert.add(verts[0].clone().multiplyScalar(lamda0))
            interp_vert.add(verts[1].clone().multiplyScalar(lamda1))
            interp_vert.add(verts[2].clone().multiplyScalar(lamda2))
            
            interp_norm.add(normals[0].clone().multiplyScalar(lamda0))
            interp_norm.add(normals[1].clone().multiplyScalar(lamda1))
            interp_norm.add(normals[2].clone().multiplyScalar(lamda2))
            var color; 


            if (uvs != undefined) {
              var interp_uvs = new THREE.Vector3(0,0,0)
              interp_uvs.add(uvs[0].clone().multiplyScalar(lamda0))
              interp_uvs.add(uvs[1].clone().multiplyScalar(lamda1))
              interp_uvs.add(uvs[2].clone().multiplyScalar(lamda2))
              if (material.xyzNormal != undefined && material.xyzNormal.height > 0){
                var c = material.xyzNormal.getPixel(Math.round(interp_uvs.x *material.xyzNormal.width ), Math.round(interp_uvs.y *  material.xyzNormal.height))
                var xyz = c.copyMultiplyScalar(2).copySub(new Pixel(1,1,1));
                let xyz_norm = new THREE.Vector3(xyz.r, xyz.g, xyz.b);
                xyz_norm.normalize();

                color = Reflection.phongReflectionModel(interp_vert.clone(), interp_vert.clone().sub(this.cameraPosition.clone()), xyz_norm, this.lightPos.clone(), this.getPhongMaterial(interp_uvs, material));

              }
              else color = Reflection.phongReflectionModel(interp_vert.clone(), interp_vert.clone().sub(this.cameraPosition.clone()), interp_norm, this.lightPos.clone(), this.getPhongMaterial(interp_uvs, material));
            
            }
            else color = Reflection.phongReflectionModel(interp_vert.clone(), interp_vert.clone().sub(this.cameraPosition.clone()), interp_norm, this.lightPos.clone(), this.getPhongMaterial(uvs, material));
            
            

            this.buffer.setPixel(i, j, color);
            this.zBuffer[i][j] = z;
          }   
      } 
    }
  }
  // ----------- STUDENT CODE END ------------
};

Renderer.drawTriangle = function(verts, normals, uvs, material, viewMat) {
  var projectedVerts = this.projectVertices(verts, viewMat);
  if (projectedVerts === undefined) {
    // not within near and far plane
    return;
  } else if (projectedVerts.length <= 0) {
    projectedVerts = this.projectVerticesNaive(verts);
  }

  switch (this.shaderMode) {
    case "Wire":
      this.drawTriangleWire(projectedVerts);
      break;
    case "Flat":
      this.drawTriangleFlat(verts, projectedVerts, normals, uvs, material);
      break;
    case "Gouraud":
      this.drawTriangleGouraud(verts, projectedVerts, normals, uvs, material);
      break;
    case "Phong":
      this.drawTrianglePhong(verts, projectedVerts, normals, uvs, material);
      break;
    default:
  }
};
