import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

type ArmProps = {
  modelPath: string;
  onReady: (
    root: THREE.Object3D,
    meshes: THREE.Mesh[],
    joints: THREE.Object3D[],
    center: THREE.Vector3,
    radius: number,
  ) => void;
};

type ActiveDrag = {
  controllerIndex: number;
  target: THREE.Object3D;
  startControllerPos: THREE.Vector3;
  startRotationX: number;
  startRotationY: number;
  allowRotateY: boolean;
};

type ActiveMove = {
  controllerIndex: number;
  startControllerPos: THREE.Vector3;
  startRootPos: THREE.Vector3;
};

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const worldPosition = new THREE.Vector3();
const tempControllerPos = new THREE.Vector3();
const tempHeadPos = new THREE.Vector3();
const tempHeadQuat = new THREE.Quaternion();
const tempForward = new THREE.Vector3();
const tempEuler = new THREE.Euler();

const MODEL_OPTIONS = [
  { id: 'armA', image: '/armA.png', modelPath: '/models/armA.glb' },
  { id: 'armB', image: '/armB.png', modelPath: '/models/armB.glb' },
  { id: 'armC', image: '/armC.png', modelPath: '/models/armC.glb' },
] as const;

type ModelId = (typeof MODEL_OPTIONS)[number]['id'];
type GizmoMode = 'rotate' | 'move';

function JointGizmo({ target, mode }: { target: THREE.Object3D; mode: GizmoMode }) {
  const groupRef = useRef<THREE.Group>(null);

  const lineLength = 0.28;
  const xLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lineLength, 0, 0)]),
        new THREE.LineBasicMaterial({
          color: '#ff6b6b',
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          depthTest: false,
        }),
      ),
    [lineLength],
  );
  const yLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, lineLength, 0)]),
        new THREE.LineBasicMaterial({
          color: '#6bff9c',
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          depthTest: false,
        }),
      ),
    [lineLength],
  );
  const zLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, lineLength)]),
        new THREE.LineBasicMaterial({
          color: '#6bb7ff',
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          depthTest: false,
        }),
      ),
    [lineLength],
  );

  useEffect(() => {
    xLine.renderOrder = 1000;
    yLine.renderOrder = 1000;
    zLine.renderOrder = 1000;

    return () => {
      xLine.geometry.dispose();
      (xLine.material as THREE.Material).dispose();
      yLine.geometry.dispose();
      (yLine.material as THREE.Material).dispose();
      zLine.geometry.dispose();
      (zLine.material as THREE.Material).dispose();
    };
  }, [xLine, yLine, zLine]);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    target.getWorldPosition(worldPosition);
    target.getWorldQuaternion(tempHeadQuat);

    groupRef.current.position.copy(worldPosition);
    groupRef.current.quaternion.copy(tempHeadQuat);
  });

  return (
    <group ref={groupRef} scale={[0.16, 0.16, 0.16]}>
      <primitive object={xLine} />
      <primitive object={yLine} />
      <primitive object={zLine} />
      {mode === 'rotate' && (
        <>
          <mesh rotation={[0, Math.PI / 2, 0]} renderOrder={1000}>
            <torusGeometry args={[0.22, 0.01, 10, 64]} />
            <meshBasicMaterial color="#ff6b6b" transparent opacity={0.65} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1000}>
            <torusGeometry args={[0.24, 0.01, 10, 64]} />
            <meshBasicMaterial color="#6bff9c" transparent opacity={0.65} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh renderOrder={1000}>
            <torusGeometry args={[0.26, 0.01, 10, 64]} />
            <meshBasicMaterial color="#6bb7ff" transparent opacity={0.65} depthWrite={false} depthTest={false} />
          </mesh>
        </>
      )}
      {mode === 'move' && (
        <>
          <mesh position={[lineLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]} renderOrder={1000}>
            <coneGeometry args={[0.035, 0.09, 12]} />
            <meshBasicMaterial color="#ff6b6b" transparent opacity={0.9} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh position={[0, lineLength, 0]} renderOrder={1000}>
            <coneGeometry args={[0.035, 0.09, 12]} />
            <meshBasicMaterial color="#6bff9c" transparent opacity={0.9} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh position={[0, 0, lineLength]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1000}>
            <coneGeometry args={[0.035, 0.09, 12]} />
            <meshBasicMaterial color="#6bb7ff" transparent opacity={0.9} depthWrite={false} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function ArmModel({ modelPath, onReady }: ArmProps) {
  const { scene } = useGLTF(modelPath);
  const wrapperRef = useRef<THREE.Group>(null);

  const model = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene) as THREE.Object3D;

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.visible = true;
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return cloned;
  }, [scene]);

  useEffect(() => {
    if (!wrapperRef.current) {
      return;
    }

    wrapperRef.current.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(wrapperRef.current);
    const center = box.getCenter(tempCenter.clone());
    const size = box.getSize(tempSize.clone());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.5;

    const meshes: THREE.Mesh[] = [];
    const bones: THREE.Bone[] = [];

    wrapperRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
      if (child instanceof THREE.Bone) {
        bones.push(child);
      }
    });

    let joints: THREE.Object3D[] = bones.filter((bone) => bone.parent instanceof THREE.Bone);

    if (joints.length === 0) {
      const fallback = new Set<THREE.Object3D>();
      meshes.forEach((mesh) => {
        if (mesh.parent && !(mesh.parent instanceof THREE.Mesh)) {
          fallback.add(mesh.parent);
        }
      });
      joints = [...fallback];
    }

    onReady(wrapperRef.current, meshes, joints, center, radius);
  }, [model, onReady]);

  return (
    <group ref={wrapperRef} position={[0, 1.2, -1.4]} scale={[0.08, 0.08, 0.08]}>
      <primitive object={model} />
    </group>
  );
}

function SkyboxEnvironment() {
  const { scene } = useThree();
  const skyTexture = useTexture('/skybox.jpg');

  useEffect(() => {
    const previousBackground = scene.background;
    const previousEnvironment = scene.environment;

    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    skyTexture.needsUpdate = true;

    scene.background = skyTexture;
    scene.environment = skyTexture;

    return () => {
      scene.background = previousBackground;
      scene.environment = previousEnvironment;
    };
  }, [scene, skyTexture]);

  return null;
}

function findJointTarget(hitObject: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  let current: THREE.Object3D | null = hitObject;

  while (current && current.parent && current !== root) {
    if (current instanceof THREE.Bone) {
      return current;
    }

    if (!(current instanceof THREE.Mesh)) {
      return current;
    }

    current = current.parent;
  }

  return root;
}

function resolveRotatableTarget(
  hitObject: THREE.Object3D,
  hitPoint: THREE.Vector3,
  armRoot: THREE.Object3D,
  rotatableTargets: THREE.Object3D[],
): THREE.Object3D | null {
  const targetSet = new Set(rotatableTargets.map((node) => node.uuid));

  if (hitObject instanceof THREE.SkinnedMesh && hitObject.skeleton?.bones?.length) {
    let nearestBone: THREE.Bone | null = null;
    let shortestDistance = Number.POSITIVE_INFINITY;

    hitObject.skeleton.bones.forEach((bone) => {
      if (!targetSet.has(bone.uuid)) {
        return;
      }

      bone.getWorldPosition(worldPosition);
      const distance = worldPosition.distanceToSquared(hitPoint);

      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestBone = bone;
      }
    });

    if (nearestBone) {
      return nearestBone;
    }
  }

  let current: THREE.Object3D | null = hitObject;
  while (current && current !== armRoot) {
    if (targetSet.has(current.uuid)) {
      return current;
    }
    current = current.parent;
  }

  const fallback = findJointTarget(hitObject, armRoot);
  if (targetSet.has(fallback.uuid)) {
    return fallback;
  }

  return null;
}

function XRInteraction({
  armRoot,
  pickableMeshes,
  rotatableTargets,
  onActiveJointChange,
}: {
  armRoot: THREE.Object3D | null;
  pickableMeshes: THREE.Mesh[];
  rotatableTargets: THREE.Object3D[];
  onActiveJointChange: (target: THREE.Object3D | null, mode?: GizmoMode) => void;
}) {
  const { gl, scene } = useThree();
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const activeMoveRef = useRef<ActiveMove | null>(null);
  const controllersRef = useRef<THREE.Group[]>([]);
  const placeInFrontRef = useRef(false);

  useEffect(() => {
    gl.xr.enabled = true;

    const button = VRButton.createButton(gl);
    document.body.appendChild(button);

    button.style.position = 'absolute';
    button.style.right = '16px';
    button.style.bottom = '16px';

    return () => {
      button.remove();
    };
  }, [gl]);

  useEffect(() => {
    const onSessionStart = () => {
      placeInFrontRef.current = true;
    };

    gl.xr.addEventListener('sessionstart', onSessionStart);

    return () => {
      gl.xr.removeEventListener('sessionstart', onSessionStart);
    };
  }, [gl]);

  useEffect(() => {
    const modelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i += 1) {
      const controller = gl.xr.getController(i);
      controller.userData.index = i;
      controller.userData.handedness = 'unknown';

      const onConnected = (event: any) => {
        controller.userData.handedness = event.data?.handedness ?? 'unknown';
      };

      const onDisconnected = () => {
        controller.userData.handedness = 'unknown';
      };

      controller.addEventListener('connected', onConnected);
      controller.addEventListener('disconnected', onDisconnected);
      controller.userData.onConnected = onConnected;
      controller.userData.onDisconnected = onDisconnected;

      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({ color: '#ff3b3b' });
      const laserLine = new THREE.Line(lineGeometry, lineMaterial);
      laserLine.name = 'laser';
      laserLine.scale.z = 4;

      controller.add(laserLine);
      scene.add(controller);

      const controllerGrip = gl.xr.getControllerGrip(i);
      controllerGrip.add(modelFactory.createControllerModel(controllerGrip));
      scene.add(controllerGrip);

      controllersRef.current[i] = controller;
    }

    return () => {
      controllersRef.current.forEach((controller, index) => {
        if (!controller) {
          return;
        }

        const onConnected = controller.userData.onConnected as ((event: any) => void) | undefined;
        const onDisconnected = controller.userData.onDisconnected as (() => void) | undefined;
        if (onConnected) {
          controller.removeEventListener('connected', onConnected);
        }
        if (onDisconnected) {
          controller.removeEventListener('disconnected', onDisconnected);
        }

        const grip = gl.xr.getControllerGrip(index);
        scene.remove(controller);
        scene.remove(grip);
      });
      controllersRef.current = [];
    };
  }, [gl, scene]);

  useEffect(() => {
    const handlers: Array<{
      controller: THREE.Group;
      onSelectStart: () => void;
      onSelectEnd: () => void;
      onSqueezeStart: () => void;
      onSqueezeEnd: () => void;
    }> = [];

    const makeSelectStartHandler = (controller: THREE.Group) => () => {
      if (!armRoot || pickableMeshes.length === 0 || rotatableTargets.length === 0) {
        return;
      }

      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersections = raycaster.intersectObjects(pickableMeshes, true);
      const firstHit = intersections[0];

      if (!firstHit) {
        return;
      }

      const targetJoint = resolveRotatableTarget(firstHit.object, firstHit.point, armRoot, rotatableTargets);
      if (!targetJoint) {
        return;
      }

      controller.getWorldPosition(tempControllerPos);
      const handedness = String(controller.userData.handedness ?? 'unknown');
      const gizmoMode: GizmoMode = handedness === 'left' ? 'rotate' : 'move';

      activeDragRef.current = {
        controllerIndex: Number(controller.userData.index),
        target: targetJoint,
        startControllerPos: tempControllerPos.clone(),
        startRotationX: targetJoint.rotation.x,
        startRotationY: targetJoint.rotation.y,
        allowRotateY: handedness === 'left',
      };

      onActiveJointChange(targetJoint, gizmoMode);
    };

    const makeSelectEndHandler = (controller: THREE.Group) => () => {
      const active = activeDragRef.current;
      if (active && active.controllerIndex === Number(controller.userData.index)) {
        activeDragRef.current = null;
        onActiveJointChange(null);
      }
    };

    const makeSqueezeStartHandler = (controller: THREE.Group) => () => {
      if (!armRoot) {
        return;
      }

      controller.getWorldPosition(tempControllerPos);
      activeMoveRef.current = {
        controllerIndex: Number(controller.userData.index),
        startControllerPos: tempControllerPos.clone(),
        startRootPos: armRoot.position.clone(),
      };
    };

    const makeSqueezeEndHandler = (controller: THREE.Group) => () => {
      const active = activeMoveRef.current;
      if (active && active.controllerIndex === Number(controller.userData.index)) {
        activeMoveRef.current = null;
      }
    };

    controllersRef.current.forEach((controller) => {
      if (!controller) {
        return;
      }

      const onSelectStart = makeSelectStartHandler(controller);
      const onSelectEnd = makeSelectEndHandler(controller);
      const onSqueezeStart = makeSqueezeStartHandler(controller);
      const onSqueezeEnd = makeSqueezeEndHandler(controller);

      controller.addEventListener('selectstart', onSelectStart);
      controller.addEventListener('selectend', onSelectEnd);
      controller.addEventListener('squeezestart', onSqueezeStart);
      controller.addEventListener('squeezeend', onSqueezeEnd);

      handlers.push({ controller, onSelectStart, onSelectEnd, onSqueezeStart, onSqueezeEnd });
    });

    return () => {
      handlers.forEach(({ controller, onSelectStart, onSelectEnd, onSqueezeStart, onSqueezeEnd }) => {
        controller.removeEventListener('selectstart', onSelectStart);
        controller.removeEventListener('selectend', onSelectEnd);
        controller.removeEventListener('squeezestart', onSqueezeStart);
        controller.removeEventListener('squeezeend', onSqueezeEnd);
      });
    };
  }, [armRoot, onActiveJointChange, pickableMeshes, rotatableTargets]);

  useFrame(() => {
    if (placeInFrontRef.current && armRoot) {
      const xrCamera = gl.xr.getCamera();
      xrCamera.getWorldPosition(tempHeadPos);
      xrCamera.getWorldQuaternion(tempHeadQuat);

      tempForward.set(0, 0, -1).applyQuaternion(tempHeadQuat).normalize();
      armRoot.position.copy(tempHeadPos).addScaledVector(tempForward, 1.0).add(new THREE.Vector3(0, -0.35, 0));

      tempEuler.setFromQuaternion(tempHeadQuat, 'YXZ');
      armRoot.rotation.set(0, tempEuler.y, 0);

      placeInFrontRef.current = false;
    }

    controllersRef.current.forEach((controller) => {
      if (!controller || pickableMeshes.length === 0 || !armRoot) {
        return;
      }

      const laser = controller.getObjectByName('laser') as THREE.Line | undefined;
      if (!laser) {
        return;
      }

      const laserMaterial = laser.material as THREE.LineBasicMaterial;

      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersections = raycaster.intersectObjects(pickableMeshes, true);
      const hit = intersections[0];

      if (hit) {
        laser.scale.z = Math.max(0.05, hit.distance);
        const target = resolveRotatableTarget(hit.object, hit.point, armRoot, rotatableTargets);
        laserMaterial.color.set(target ? '#ffffff' : '#ff3b3b');
      } else {
        laser.scale.z = 4;
        laserMaterial.color.set('#ff3b3b');
      }
    });

    const activeMove = activeMoveRef.current;
    if (activeMove && armRoot) {
      const controller = controllersRef.current[activeMove.controllerIndex];
      if (controller) {
        controller.getWorldPosition(tempControllerPos);
        const delta = tempControllerPos.clone().sub(activeMove.startControllerPos);
        armRoot.position.copy(activeMove.startRootPos).add(delta);
      }
    }

    const activeDrag = activeDragRef.current;
    if (!activeDrag) {
      return;
    }

    const controller = controllersRef.current[activeDrag.controllerIndex];
    if (!controller) {
      return;
    }

    controller.getWorldPosition(tempControllerPos);

    const deltaY = tempControllerPos.y - activeDrag.startControllerPos.y;
    const deltaX = tempControllerPos.x - activeDrag.startControllerPos.x;

    const rotateBoost = 6.5;
    activeDrag.target.rotation.x = THREE.MathUtils.clamp(
      activeDrag.startRotationX + deltaY * rotateBoost,
      -Math.PI * 0.95,
      Math.PI * 0.95,
    );

    if (activeDrag.allowRotateY) {
      activeDrag.target.rotation.y = THREE.MathUtils.clamp(
        activeDrag.startRotationY + deltaX * rotateBoost,
        -Math.PI * 0.95,
        Math.PI * 0.95,
      );
    }
  });

  return null;
}

function CameraFitter({
  focusCenter,
  focusRadius,
}: {
  focusCenter: THREE.Vector3 | null;
  focusRadius: number | null;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!focusCenter || !focusRadius) {
      return;
    }

    const distance = Math.max(0.8, focusRadius * 3.0);
    camera.position.set(focusCenter.x, focusCenter.y + focusRadius * 0.5, focusCenter.z + distance);
    camera.lookAt(focusCenter);
    camera.updateProjectionMatrix();
  }, [camera, focusCenter, focusRadius]);

  return null;
}

export default function App() {
  const [selectedModelId, setSelectedModelId] = useState<ModelId | null>(null);
  const selectedModelPath = MODEL_OPTIONS.find((item) => item.id === selectedModelId)?.modelPath ?? null;
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const [activeGizmo, setActiveGizmo] = useState<{ target: THREE.Object3D; mode: GizmoMode } | null>(null);
  const [armRoot, setArmRoot] = useState<THREE.Object3D | null>(null);
  const [pickableMeshes, setPickableMeshes] = useState<THREE.Mesh[]>([]);
  const [rotatableTargets, setRotatableTargets] = useState<THREE.Object3D[]>([]);
  const [focusCenter, setFocusCenter] = useState<THREE.Vector3 | null>(null);
  const [focusRadius, setFocusRadius] = useState<number | null>(null);

  const handleArmReady = (
    root: THREE.Object3D,
    meshes: THREE.Mesh[],
    joints: THREE.Object3D[],
    center: THREE.Vector3,
    radius: number,
  ) => {
    setArmRoot(root);
    setPickableMeshes(meshes);
    setRotatableTargets(joints);
    setFocusCenter(center.clone());
    setFocusRadius(radius);
  };

  useEffect(() => {
    setActiveGizmo(null);
    setArmRoot(null);
    setPickableMeshes([]);
    setRotatableTargets([]);
    setFocusCenter(null);
    setFocusRadius(null);
  }, [selectedModelId]);

  const handleActiveJointChange = (target: THREE.Object3D | null, mode?: GizmoMode) => {
    if (!target || !mode) {
      setActiveGizmo(null);
      return;
    }

    setActiveGizmo({ target, mode });
  };

  const handleBack = async () => {
    const session = rendererRef.current?.xr.getSession();
    if (session) {
      try {
        await session.end();
      } catch {
        // ignore and continue resetting view
      }
    }

    setSelectedModelId(null);
  };

  if (!selectedModelPath) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          background: 'linear-gradient(160deg, #0d1428 0%, #12264d 45%, #1b3f6a 100%)',
          color: '#eaf2ff',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          padding: '24px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 700 }}>Select Arm Model</h1>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {MODEL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedModelId(option.id)}
              style={{
                width: '180px',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.08)',
                padding: '10px',
                cursor: 'pointer',
                color: '#ffffff',
              }}
            >
              <img
                src={option.image}
                alt={option.id}
                style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', display: 'block' }}
              />
              <div style={{ marginTop: '10px', fontSize: '16px', fontWeight: 600 }}>{option.id}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}
    >
      <button
        type="button"
        onClick={handleBack}
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 10,
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: '10px',
          background: 'rgba(10,20,40,0.7)',
          color: '#ffffff',
          padding: '8px 14px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Back
      </button>

      <Canvas
        camera={{ position: [0, 1.6, 2.2], fov: 50 }}
        onCreated={({ gl }) => {
          rendererRef.current = gl;
          gl.setPixelRatio(window.devicePixelRatio);
        }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 5, 2]} intensity={1.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.8} />

        <Suspense fallback={null}>
          <SkyboxEnvironment />
          <ArmModel key={selectedModelPath} modelPath={selectedModelPath} onReady={handleArmReady} />
          {activeGizmo && <JointGizmo target={activeGizmo.target} mode={activeGizmo.mode} />}
          <XRInteraction
            armRoot={armRoot}
            pickableMeshes={pickableMeshes}
            rotatableTargets={rotatableTargets}
            onActiveJointChange={handleActiveJointChange}
          />
          <CameraFitter focusCenter={focusCenter} focusRadius={focusRadius} />
        </Suspense>

        <OrbitControls
          makeDefault
          target={focusCenter ? [focusCenter.x, focusCenter.y, focusCenter.z] : [0, 1.2, -1.4]}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/armA.glb');
useGLTF.preload('/models/armB.glb');
useGLTF.preload('/models/armC.glb');
