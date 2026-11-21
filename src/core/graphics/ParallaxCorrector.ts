import * as THREE from 'three';
import { Vector3D } from '../../types';

export interface HeadsetCameraConfig {
  physicalCameraOffsetMm: Vector3D; // E.g., { x: 0, y: 65, z: 25 } (65mm above eyes, 25mm forward)
  targetUserDistanceMm: number;    // Typically 600mm to 1200mm (screen/conversational distance)
  correctionEnabled: boolean;
}

export class ParallaxCorrector {
  private config: HeadsetCameraConfig = {
    physicalCameraOffsetMm: { x: 0, y: 65, z: 25 },
    targetUserDistanceMm: 800,
    correctionEnabled: true
  };

  constructor(customConfig?: Partial<HeadsetCameraConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  public setConfig(update: Partial<HeadsetCameraConfig>) {
    this.config = { ...this.config, ...update };
  }

  public getConfig(): HeadsetCameraConfig {
    return { ...this.config };
  }

  /**
   * Calculates the angular pitch and yaw correction required to realign
   * the physical camera perspective with the true anatomical visual axis.
   */
  public calculateAngleCorrection(): {
    deltaPitchDeg: number;
    deltaYawDeg: number;
    correctedGazeVector: Vector3D;
  } {
    if (!this.config.correctionEnabled) {
      return {
        deltaPitchDeg: 0,
        deltaYawDeg: 0,
        correctedGazeVector: { x: 0, y: 0, z: -1 }
      };
    }

    // Physical camera looking down onto the user's eyes from above
    // deltaPitch = -arctan(offsetY / distance)
    const pitchCorrectionRad = -Math.atan2(
      this.config.physicalCameraOffsetMm.y,
      this.config.targetUserDistanceMm
    );
    const yawCorrectionRad = -Math.atan2(
      this.config.physicalCameraOffsetMm.x,
      this.config.targetUserDistanceMm
    );

    const deltaPitchDeg = (pitchCorrectionRad * 180) / Math.PI;
    const deltaYawDeg = (yawCorrectionRad * 180) / Math.PI;

    // Corrected 3D directional vector
    const correctedVector = new THREE.Vector3(0, 0, -1);
    const euler = new THREE.Euler(pitchCorrectionRad, yawCorrectionRad, 0, 'YXZ');
    correctedVector.applyEuler(euler).normalize();

    return {
      deltaPitchDeg: parseFloat(deltaPitchDeg.toFixed(2)),
      deltaYawDeg: parseFloat(deltaYawDeg.toFixed(2)),
      correctedGazeVector: {
        x: parseFloat(correctedVector.x.toFixed(3)),
        y: parseFloat(correctedVector.y.toFixed(3)),
        z: parseFloat(correctedVector.z.toFixed(3))
      }
    };
  }

  /**
   * Transforms raw eye rotation into parallax-corrected virtual camera rotation.
   */
  public applyCorrectionToGaze(rawPitchDeg: number, rawYawDeg: number): {
    correctedPitchDeg: number;
    correctedYawDeg: number;
  } {
    if (!this.config.correctionEnabled) {
      return { correctedPitchDeg: rawPitchDeg, correctedYawDeg: rawYawDeg };
    }
    const correction = this.calculateAngleCorrection();
    return {
      correctedPitchDeg: rawPitchDeg + correction.deltaPitchDeg,
      correctedYawDeg: rawYawDeg + correction.deltaYawDeg
    };
  }
}
