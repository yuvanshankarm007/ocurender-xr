import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GazeTelemetry, FoveatedSettings } from '../../types';
import { FoveatedShaderDefinition } from './FoveatedShader';
import { ParallaxCorrector } from './ParallaxCorrector';

export type TelepresenceViewMode = 
  | 'virtual_camera_corrected'     // OcuRender 1:1 Eyeline Corrected
  | 'headset_passthrough_raw'       // Physical Headset Visor Camera (Offset ~70mm)
  | 'split_view';                   // Side-by-Side Comparison

export type AvatarStyle = 'photoreal_human' | 'cyber_hologram';

export class XRSceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private uncorrectedCamera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private renderTarget: THREE.WebGLRenderTarget;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private postMaterial: THREE.ShaderMaterial;
  private postQuad: THREE.Mesh;
  private resizeObserver: ResizeObserver | null = null;

  // 3D Avatar & Eye Rig (Hologram Mode)
  private avatarHeadGroup: THREE.Group;
  private leftEyeball: THREE.Mesh;
  private rightEyeball: THREE.Mesh;
  private leftPupil: THREE.Mesh;
  private rightPupil: THREE.Mesh;
  private leftUpperEyelid: THREE.Mesh;
  private rightUpperEyelid: THREE.Mesh;
  private leftLowerEyelid: THREE.Mesh;
  private rightLowerEyelid: THREE.Mesh;
  private gazeRayLine: THREE.Line;
  private eyeContactBadge: THREE.Sprite;

  // Photorealistic 3D Human Avatar (Biometric Mode)
  private photorealGroup: THREE.Group | null = null;
  private photorealHeadBone: THREE.Object3D | null = null;
  private photorealLeftEye: THREE.Object3D | null = null;
  private photorealRightEye: THREE.Object3D | null = null;
  private photorealHeadMesh: THREE.Mesh | null = null;
  private avatarStyle: AvatarStyle = 'photoreal_human';

  private parallaxCorrector = new ParallaxCorrector();
  private viewMode: TelepresenceViewMode = 'virtual_camera_corrected';
  private baselineOffsetMm = 65.0;

  private foveatedSettings: FoveatedSettings = {
    enabled: true,
    foveaRadiusDeg: 2.5,
    parafoveaRadiusDeg: 5.5,
    peripheralSamplingRate: 0.25,
    blurStrength: 3.5,
    visualizeFoveaCone: true,
    depthOfFieldEnabled: true,
    focalDepthMeters: 1.2
  };

  private latestTelemetry: GazeTelemetry = {
    timestampMs: performance.now(),
    gazePoint2D: { x: 0.5, y: 0.5 },
    gazeVector3D: { x: 0, y: 0, z: -1 },
    angles: { pitch: 0, yaw: 0, roll: 0 },
    angularVelocityDegPerSec: 0,
    isSaccade: false,
    isFixation: true,
    isBlink: false,
    eyelidAperture: 1.0,
    eyeContactQuality: 0.98,
    pupilDiameterMm: 3.6,
    confidence: 1.0,
    source: 'webcam_mediapipe'
  };

  private currentEyePitch = 0;
  private currentEyeYaw = 0;
  private animationFrameId: number | null = null;
  private isDestroyed = false;
  private cachedWidth = 800;
  private cachedHeight = 500;
  private needsViewportReset = false;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    this.cachedWidth = width;
    this.cachedHeight = height;

    // 1. Scene & Lighting
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a101f);
    this.scene.fog = new THREE.FogExp2(0x0a101f, 0.09);

    // 2. Dual Perspective Cameras
    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    this.camera.position.set(0, 0.08, 1.6);
    this.camera.lookAt(0, 0.08, 0);

    this.uncorrectedCamera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    this.uncorrectedCamera.position.set(0, 0.38, 1.55);
    this.uncorrectedCamera.lookAt(0, -0.05, 0);

    // 3. WebGL Renderer (Opaque, zero-MSAA for 60 FPS performance lock)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1.0);
    this.renderer.domElement.style.backgroundColor = '#030712';
    container.appendChild(this.renderer.domElement);

    // 4. Post-processing Render Target (Capped to max 1280x720 for locked 60 FPS in fullscreen)
    const targetW = Math.min(width, 1280);
    const targetH = Math.min(height, Math.round(targetW * (height / width)));
    this.renderTarget = new THREE.WebGLRenderTarget(targetW, targetH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FoveatedShaderDefinition.uniforms),
      vertexShader: FoveatedShaderDefinition.vertexShader,
      fragmentShader: FoveatedShaderDefinition.fragmentShader,
    });
    this.postMaterial.uniforms.uResolution.value.set(width, height);
    this.postMaterial.uniforms.uInvResolution.value.set(1.0 / Math.max(1, width), 1.0 / Math.max(1, height));
    this.postMaterial.uniforms.uAspectVec.value.set(width / Math.max(1, height), 1.0);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(this.postQuad);

    if (typeof ResizeObserver !== 'undefined' && container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(container);
    }

    this.setupLighting();

    // 5. Build 3D Avatar Rig
    const avatar = this.buildAvatarRig();
    this.avatarHeadGroup = avatar.headGroup;
    this.leftEyeball = avatar.leftEye;
    this.rightEyeball = avatar.rightEye;
    this.leftPupil = avatar.leftP;
    this.rightPupil = avatar.rightP;
    this.leftUpperEyelid = avatar.leftUpperLid;
    this.rightUpperEyelid = avatar.rightUpperLid;
    this.leftLowerEyelid = avatar.leftLowerLid;
    this.rightLowerEyelid = avatar.rightLowerLid;
    this.scene.add(this.avatarHeadGroup);

    // Gaze Ray Line
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2)
    ]);
    const rayMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.7 });
    this.gazeRayLine = new THREE.Line(rayGeo, rayMat);
    this.scene.add(this.gazeRayLine);

    // Eye Contact Status Badge (Hidden in 3D to avoid peripheral shader blur; rendered crisply in HUD)
    this.eyeContactBadge = this.createEyeContactBadge();
    this.eyeContactBadge.visible = false;
    this.scene.add(this.eyeContactBadge);

    this.buildConferenceEnvironment();
    this.loadPhotorealAvatar();
    window.addEventListener('resize', this.handleResize);

    this.animate();
  }

  private setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x3b4a68, 1.4);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x00f2fe, 2.4);
    keyLight.position.set(2, 3, 2.5);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 2.0);
    rimLight.position.set(-2.5, 2, -1.5);
    this.scene.add(rimLight);

    const underGlow = new THREE.PointLight(0x10b981, 1.2, 4);
    underGlow.position.set(0, -0.8, 1.2);
    this.scene.add(underGlow);

    // Warm Frontal Facial Fill Light for photorealistic skin shading
    const faceLight = new THREE.DirectionalLight(0xfff1e6, 2.2);
    faceLight.position.set(0, 0.2, 2.0);
    this.scene.add(faceLight);
  }

  private loadPhotorealAvatar() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/photoreal_avatar.glb',
      (gltf) => {
        const root = gltf.scene;
        this.photorealGroup = root;
        // Align bust and eye height directly with camera line of sight (Y ~ 0.08m)
        root.position.set(0, -1.48, 0);
        root.scale.set(1.0, 1.0, 1.0);

        root.traverse((child) => {
          if (child.name === 'Head') {
            this.photorealHeadBone = child;
          } else if (child.name === 'LeftEye') {
            this.photorealLeftEye = child;
          } else if (child.name === 'RightEye') {
            this.photorealRightEye = child;
          } else if (child.name === 'Head_Mesh' && (child as THREE.Mesh).isMesh) {
            this.photorealHeadMesh = child as THREE.Mesh;
          }
        });

        this.scene.add(root);

        // Apply initial active avatar style
        if (this.avatarStyle === 'photoreal_human') {
          this.avatarHeadGroup.visible = false;
          root.visible = true;
        } else {
          this.avatarHeadGroup.visible = true;
          root.visible = false;
        }
      },
      undefined,
      (err) => {
        console.warn('[XRSceneManager] Notice: falling back to cyber hologram avatar:', err);
      }
    );
  }

  public setAvatarStyle(style: AvatarStyle) {
    this.avatarStyle = style;
    if (this.photorealGroup) {
      if (style === 'photoreal_human') {
        this.photorealGroup.visible = true;
        this.avatarHeadGroup.visible = false;
      } else {
        this.photorealGroup.visible = false;
        this.avatarHeadGroup.visible = true;
      }
    } else {
      this.avatarHeadGroup.visible = true;
    }
  }

  public getAvatarStyle(): AvatarStyle {
    return this.avatarStyle;
  }

  private createEyeContactBadge(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(6, 78, 59, 0.85)';
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('● 1:1 EYE CONTACT', 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.45, 0.12, 1);
    return sprite;
  }

  private updateBadgeState(hasEyeContact: boolean, quality?: number) {
    const canvas = (this.eyeContactBadge.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const qualityPct = Math.round((quality !== undefined ? quality : (hasEyeContact ? 0.98 : 0.12)) * 100);

    if (hasEyeContact) {
      ctx.fillStyle = 'rgba(6, 78, 59, 0.90)';
      ctx.roundRect(4, 4, 248, 56, 12);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`● 1:1 EYE CONTACT: ${qualityPct}%`, 128, 32);
    } else {
      ctx.fillStyle = 'rgba(120, 53, 15, 0.90)';
      ctx.roundRect(4, 4, 248, 56, 12);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`▲ VISOR ERROR: ${qualityPct}% (-14°)`, 128, 32);
    }

    this.eyeContactBadge.material.map!.needsUpdate = true;
  }

  private buildAvatarRig() {
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0, 0);

    // Stylized Holographic Head
    const headGeo = new THREE.SphereGeometry(0.34, 32, 32);
    headGeo.scale(0.85, 1.15, 0.95);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x111c33,
      metalness: 0.85,
      roughness: 0.25,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, wireframe: true, transparent: true, opacity: 0.35 });
    const wireMesh = new THREE.Mesh(headGeo, wireMat);
    headGroup.add(wireMesh);

    const createEyeball = (xOffset: number) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(xOffset, 0.08, 0.25);

      // Sclera (White)
      const scleraGeo = new THREE.SphereGeometry(0.065, 32, 32);
      const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.1 });
      const scleraMesh = new THREE.Mesh(scleraGeo, scleraMat);
      eyeGroup.add(scleraMesh);

      // Iris (Electric Cyan)
      const irisGeo = new THREE.RingGeometry(0.012, 0.038, 32);
      const irisMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide });
      const irisMesh = new THREE.Mesh(irisGeo, irisMat);
      irisMesh.position.set(0, 0, 0.064);
      eyeGroup.add(irisMesh);

      // Pupil (Deep obsidian)
      const pupilGeo = new THREE.CircleGeometry(0.015, 32);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x030712 });
      const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
      pupilMesh.position.set(0, 0, 0.0645);
      eyeGroup.add(pupilMesh);

      // Reflective Cornea
      const corneaGeo = new THREE.SphereGeometry(0.068, 16, 16);
      const corneaMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        roughness: 0.0,
      });
      const corneaMesh = new THREE.Mesh(corneaGeo, corneaMat);
      eyeGroup.add(corneaMesh);

      // Upper Eyelid (Hemisphere rotating forward to cover front +Z)
      const upperLidGeo = new THREE.SphereGeometry(0.069, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const eyelidMat = new THREE.MeshStandardMaterial({
        color: 0x24344d,
        metalness: 0.4,
        roughness: 0.4,
      });
      const upperLidMesh = new THREE.Mesh(upperLidGeo, eyelidMat);
      upperLidMesh.rotation.x = -Math.PI * 0.45; // Start open
      eyeGroup.add(upperLidMesh);

      // Lower Eyelid
      const lowerLidGeo = new THREE.SphereGeometry(0.0685, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const lowerLidMesh = new THREE.Mesh(lowerLidGeo, eyelidMat);
      lowerLidMesh.rotation.x = Math.PI * 0.85; // Start open (pointing down)
      eyeGroup.add(lowerLidMesh);

      headGroup.add(eyeGroup);
      return {
        eyeball: eyeGroup as unknown as THREE.Mesh,
        pupil: pupilMesh,
        upperLid: upperLidMesh,
        lowerLid: lowerLidMesh
      };
    };

    const left = createEyeball(-0.11);
    const right = createEyeball(0.11);

    return {
      headGroup,
      leftEye: left.eyeball,
      rightEye: right.eyeball,
      leftP: left.pupil,
      rightP: right.pupil,
      leftUpperLid: left.upperLid,
      rightUpperLid: right.upperLid,
      leftLowerLid: left.lowerLid,
      rightLowerLid: right.lowerLid,
    };
  }

  private buildConferenceEnvironment() {
    const grid = new THREE.GridHelper(16, 32, 0x00f2fe, 0x1e293b);
    grid.position.y = -1.1;
    this.scene.add(grid);

    // Modern Frosted Telepresence Conference Table
    const tableGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.08, 32, 1, false, 0, Math.PI);
    const tableMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2,
      transmission: 0.4,
      transparent: true,
      opacity: 0.85
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.set(0, -0.45, 0.6);
    table.rotation.y = Math.PI * 0.5;
    this.scene.add(table);

    // Holographic Telepresence Colleague Across the Table (Interlocutor)
    const interlocutorGroup = new THREE.Group();
    interlocutorGroup.position.set(0, 0.05, -1.8);

    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.42, 1.0, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.5
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.55;
    interlocutorGroup.add(body);

    const interlocutorHeadGeo = new THREE.SphereGeometry(0.22, 24, 24);
    const interlocutorHeadMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.6
    });
    const interlocutorHead = new THREE.Mesh(interlocutorHeadGeo, interlocutorHeadMat);
    interlocutorHead.position.y = 0.15;
    interlocutorGroup.add(interlocutorHead);

    // Interlocutor Headset Visor
    const headsetGeo = new THREE.BoxGeometry(0.30, 0.10, 0.26);
    const headsetMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
    const headset = new THREE.Mesh(headsetGeo, headsetMat);
    headset.position.set(0, 0.18, 0.1);
    interlocutorGroup.add(headset);

    this.scene.add(interlocutorGroup);

    const cardGeo = new THREE.PlaneGeometry(0.7, 0.4);
    const cardMat1 = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const leftScreen = new THREE.Mesh(cardGeo, cardMat1);
    leftScreen.position.set(-0.95, 0.25, -0.4);
    leftScreen.rotation.y = 0.45;
    this.scene.add(leftScreen);

    const rightScreen = new THREE.Mesh(cardGeo, cardMat1);
    rightScreen.position.set(0.95, 0.25, -0.4);
    rightScreen.rotation.y = -0.45;
    this.scene.add(rightScreen);
  }

  public setLatestTelemetry(telemetry: GazeTelemetry) {
    this.latestTelemetry = telemetry;
  }

  public setViewMode(mode: TelepresenceViewMode) {
    this.viewMode = mode;
    this.updateBadgeState(mode === 'virtual_camera_corrected');
  }

  public setBaselineOffset(offsetMm: number) {
    this.baselineOffsetMm = offsetMm;
    this.parallaxCorrector.setConfig({
      physicalCameraOffsetMm: { x: 0, y: offsetMm, z: 25 }
    });
    this.uncorrectedCamera.position.y = 0.08 + (offsetMm / 200.0);
  }

  public setFoveatedSettings(settings: Partial<FoveatedSettings>) {
    this.foveatedSettings = { ...this.foveatedSettings, ...settings };
    if (this.postMaterial && this.postMaterial.uniforms) {
      this.postMaterial.uniforms.uFoveaRadius.value = (this.foveatedSettings.foveaRadiusDeg / 55.0) * 1.5;
      this.postMaterial.uniforms.uParafoveaRadius.value = (this.foveatedSettings.parafoveaRadiusDeg / 55.0) * 1.5;
    }
  }

  public resize = () => {
    this.handleResize();
  };

  private handleResize = () => {
    if (!this.container || this.isDestroyed) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 500;
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.needsViewportReset = true;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.uncorrectedCamera.aspect = width / height;
    this.uncorrectedCamera.updateProjectionMatrix();

    this.renderer.setPixelRatio(1.0);
    this.renderer.setSize(width, height);
    // Super-sampled VRS Fill Optimization: cap offscreen buffer to max 1280x720.
    // Bilinear hardware upscale provides pristine visual acuity while saving 70% GPU fill rate in fullscreen
    const targetW = Math.min(width, 1280);
    const targetH = Math.min(height, Math.round(targetW * (height / width)));
    this.renderTarget.setSize(targetW, targetH);

    if (this.postMaterial && this.postMaterial.uniforms) {
      this.postMaterial.uniforms.uResolution.value.set(width, height);
      this.postMaterial.uniforms.uInvResolution.value.set(1.0 / Math.max(1, width), 1.0 / Math.max(1, height));
      this.postMaterial.uniforms.uAspectVec.value.set(width / Math.max(1, height), 1.0);
    }
  };

  private animate = () => {
    if (this.isDestroyed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    const telemetry = this.latestTelemetry;

    // Subtly orient avatar head based on 6-DoF Head Pose estimation
    if (telemetry.headPose && this.avatarHeadGroup) {
      const hp = telemetry.headPose;
      const headPitchRad = (hp.pitchDeg * Math.PI) / 180;
      const headYawRad = (hp.yawDeg * Math.PI) / 180;
      const headRollRad = (hp.rollDeg * Math.PI) / 180;

      this.avatarHeadGroup.rotation.x += (headPitchRad * 0.35 - this.avatarHeadGroup.rotation.x) * 0.85;
      this.avatarHeadGroup.rotation.y += (headYawRad * 0.35 - this.avatarHeadGroup.rotation.y) * 0.85;
      this.avatarHeadGroup.rotation.z += (-headRollRad * 0.35 - this.avatarHeadGroup.rotation.z) * 0.85;
    }

    const targetPitchDeg = telemetry.angles.pitch;
    const targetYawDeg = telemetry.angles.yaw;

    // Ultra-low-latency ocular response: instant 0.98 ballistic snap on saccades, 0.88 on fixations
    const eyeLerpRate = telemetry.isSaccade ? 0.98 : 0.88;
    this.currentEyePitch += (targetPitchDeg - this.currentEyePitch) * eyeLerpRate;
    this.currentEyeYaw += (targetYawDeg - this.currentEyeYaw) * eyeLerpRate;

    let finalPitch = this.currentEyePitch;
    let finalYaw = this.currentEyeYaw;

    // Apply Bell's Phenomenon during blinks (eyeball rolls upward ~2.5 deg behind closed eyelids)
    if (telemetry.isBlink) {
      finalPitch -= 2.5;
    }

    if (this.viewMode === 'headset_passthrough_raw') {
      finalPitch += 14.0;
    }

    const pitchRad = (finalPitch * Math.PI) / 180;
    const yawRad = (finalYaw * Math.PI) / 180;

    if (this.leftEyeball && this.rightEyeball) {
      // Local eyeball rotation inside avatarHeadGroup:
      // Subtract head group orientation so net world gaze points accurately at (pitchRad, yawRad),
      // preserving 1:1 mutual eye contact during cranial turns
      const headRotX = this.avatarHeadGroup ? this.avatarHeadGroup.rotation.x : 0;
      const headRotY = this.avatarHeadGroup ? this.avatarHeadGroup.rotation.y : 0;

      const localPitch = pitchRad * 0.65 - headRotX;
      const localYaw = yawRad * 0.75 - headRotY;

      this.leftEyeball.rotation.x = localPitch;
      this.leftEyeball.rotation.y = localYaw;
      this.rightEyeball.rotation.x = localPitch;
      this.rightEyeball.rotation.y = localYaw;
    }

    // CONTINUOUS EYELID APERTURE INTERPOLATION (0.0 = fully closed, 1.0 = fully open)
    const openFraction = telemetry.isBlink
      ? 0.0
      : (telemetry.eyelidAperture !== undefined ? telemetry.eyelidAperture : 1.0);

    // Natural human eyelid curve: keep eyes wide open and alert unless actively blinking or squinting
    const visualOpen = openFraction > 0.65 ? 1.0 : Math.max(0.0, openFraction / 0.65);
    const targetUpperAngle = THREE.MathUtils.lerp(Math.PI * 0.48, -Math.PI * 0.45, visualOpen);
    const targetLowerAngle = THREE.MathUtils.lerp(Math.PI * 0.52, Math.PI * 0.85, visualOpen);

    const isFastClosure = openFraction < 0.4 || telemetry.isBlink;
    const lerpRate = isFastClosure ? 0.85 : 0.45;

    if (this.leftUpperEyelid && this.rightUpperEyelid) {
      this.leftUpperEyelid.rotation.x += (targetUpperAngle - this.leftUpperEyelid.rotation.x) * lerpRate;
      this.rightUpperEyelid.rotation.x += (targetUpperAngle - this.rightUpperEyelid.rotation.x) * lerpRate;
    }

    if (this.leftLowerEyelid && this.rightLowerEyelid) {
      this.leftLowerEyelid.rotation.x += (targetLowerAngle - this.leftLowerEyelid.rotation.x) * lerpRate;
      this.rightLowerEyelid.rotation.x += (targetLowerAngle - this.rightLowerEyelid.rotation.x) * lerpRate;
    }

    // Update Photorealistic 3D Human Avatar (Biometric Mode)
    if (this.photorealGroup && this.photorealGroup.visible) {
      // 1. Head Pose (6-DoF)
      if (telemetry.headPose && this.photorealHeadBone) {
        const hp = telemetry.headPose;
        const headPitchRad = (hp.pitchDeg * Math.PI) / 180;
        const headYawRad = (hp.yawDeg * Math.PI) / 180;
        const headRollRad = (hp.rollDeg * Math.PI) / 180;

        this.photorealHeadBone.rotation.x += (headPitchRad * 0.35 - this.photorealHeadBone.rotation.x) * 0.85;
        this.photorealHeadBone.rotation.y += (headYawRad * 0.35 - this.photorealHeadBone.rotation.y) * 0.85;
        this.photorealHeadBone.rotation.z += (-headRollRad * 0.35 - this.photorealHeadBone.rotation.z) * 0.85;
      }

      // 2. Realistic Eyeball Rotation
      if (this.photorealLeftEye && this.photorealRightEye) {
        const headRotX = this.photorealHeadBone ? this.photorealHeadBone.rotation.x : 0;
        const headRotY = this.photorealHeadBone ? this.photorealHeadBone.rotation.y : 0;

        const localPitch = pitchRad * 0.55 - headRotX;
        const localYaw = yawRad * 0.65 - headRotY;

        this.photorealLeftEye.rotation.x = localPitch;
        this.photorealLeftEye.rotation.y = localYaw;
        this.photorealRightEye.rotation.x = localPitch;
        this.photorealRightEye.rotation.y = localYaw;
      }

      // 3. Realistic Eyelid Morph Target Blinking + Full ARKit Expression Mirroring
      if (this.photorealHeadMesh && this.photorealHeadMesh.morphTargetDictionary && this.photorealHeadMesh.morphTargetInfluences) {
        const dict = this.photorealHeadMesh.morphTargetDictionary;
        const influences = this.photorealHeadMesh.morphTargetInfluences;
        const applyMorph = (key: string, targetValue: number, alpha = 0.35) => {
          const idx = dict[key];
          if (idx !== undefined) {
            const clamped = Math.max(0, Math.min(1, targetValue));
            influences[idx] = influences[idx] + (clamped - influences[idx]) * alpha;
          }
        };

        const isBlinkingNow = openFraction < 0.35 || telemetry.isBlink;
        const blinkAmount = isBlinkingNow ? 1.0 : Math.max(0, Math.min(1, 1.0 - openFraction));
        const blinkAlpha = isBlinkingNow ? 0.85 : 0.50;
        applyMorph('eyeBlinkLeft', blinkAmount, blinkAlpha);
        applyMorph('eyeBlinkRight', blinkAmount, blinkAlpha);

        const expr = telemetry.expressions;
        if (expr) {
          applyMorph('jawOpen', expr.jawOpen);
          applyMorph('mouthSmile', expr.mouthSmile);
          applyMorph('mouthSmileLeft', expr.mouthSmile);
          applyMorph('mouthSmileRight', expr.mouthSmile);
          applyMorph('browInnerUp', expr.browInnerUp);
          applyMorph('browDownLeft', expr.browDown);
          applyMorph('browDownRight', expr.browDown);
          applyMorph('eyeWideLeft', expr.eyeWide);
          applyMorph('eyeWideRight', expr.eyeWide);
        }
      }
    }

    // Zero-lag rendering: use cached viewport dimensions to eliminate forced layout reflows
    const width = this.cachedWidth;
    const height = this.cachedHeight;

    // SPLIT-VIEW MODE: Dual-viewport comparison
    if (this.viewMode === 'split_view') {
      this.needsViewportReset = true;
      const halfWidth = Math.floor(width / 2);
      this.renderer.setScissorTest(true);

      // LEFT HALF: Raw Forehead Visor Cam (+65mm Parallax Error)
      this.uncorrectedCamera.aspect = halfWidth / height;
      this.uncorrectedCamera.updateProjectionMatrix();
      this.renderer.setViewport(0, 0, halfWidth, height);
      this.renderer.setScissor(0, 0, halfWidth, height);
      this.renderer.render(this.scene, this.uncorrectedCamera);

      // RIGHT HALF: OcuRender 1:1 Eyeline Corrected Virtual Camera
      this.camera.aspect = (width - halfWidth) / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setViewport(halfWidth, 0, width - halfWidth, height);
      this.renderer.setScissor(halfWidth, 0, width - halfWidth, height);
      this.renderer.render(this.scene, this.camera);

      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      return;
    }

    if (this.needsViewportReset) {
      this.needsViewportReset = false;
      this.renderer.setViewport(0, 0, width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.uncorrectedCamera.aspect = width / height;
      this.uncorrectedCamera.updateProjectionMatrix();
    }

    const activeCam = (this.viewMode === 'headset_passthrough_raw') ? this.uncorrectedCamera : this.camera;

    if (this.postMaterial && this.postMaterial.uniforms) {
      this.postMaterial.uniforms.uGaze.value.set(telemetry.gazePoint2D.x, 1.0 - telemetry.gazePoint2D.y);
      this.postMaterial.uniforms.uResolution.value.set(width, height);
      this.postMaterial.uniforms.uInvResolution.value.set(1.0 / Math.max(1, width), 1.0 / Math.max(1, height));
      this.postMaterial.uniforms.uDebugOverlay.value = this.foveatedSettings.visualizeFoveaCone ? 1.0 : 0.0;
      this.postMaterial.uniforms.uBlurStrength.value = this.foveatedSettings.enabled ? this.foveatedSettings.blurStrength : 0.0;
    }

    if (this.foveatedSettings.enabled) {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render(this.scene, activeCam);

      this.renderer.setRenderTarget(null);
      this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, activeCam);
    }
  };

  public destroy() {
    this.isDestroyed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.renderTarget.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
