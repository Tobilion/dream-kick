/**
 * camera.js — RETIRED (V2 Phase 1).
 * The old BroadcastCam (top-down/tele default) was replaced by
 * `CameraController` in src/render/cameraController.js — DLS-style sideline
 * default, 4 presets, distance setting, occlusion culling.
 * This stub remains only so stale imports fail loudly instead of silently.
 */
export class BroadcastCam {
  constructor() {
    throw new Error('BroadcastCam is retired — use CameraController from render/cameraController.js');
  }
}
