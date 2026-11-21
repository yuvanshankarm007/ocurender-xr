# AI Disclosure Statement

**Samsung PRISM XR Hackathon 2026**  
**Track 1:** Synthetic Eye Movement & Virtual Camera Rendering  
**Project:** OcuRender XR — Biometrically Calibrated Synthetic Eye Kinematics & High-Fidelity Photoreal UV Generation  

---

## 1. Transparency & Use of AI Tools
In compliance with the Samsung PRISM XR Hackathon submission guidelines and academic integrity standards, the team declares the transparent use of generative AI assistance during the project lifecycle:

- **AI Tools Utilized:**
  - **Google DeepMind Antigravity / Gemini:** Utilized for rapid code scaffolding, mathematical documentation drafting, unit test authoring (`vitest`), and refactoring assistance.
  - **MakeHuman Community (Open Source / CC0):** Utilized for the CC0-licensed anatomical baseline human topology, modified and custom-rigged with 11.0 mm spherical eyeball meshes in Blender 4.2 LTS.
  - **MediaPipe FaceMesh (Google Research):** Open-source sub-pixel iris refinement neural network (Apache 2.0) utilized in the companion WebXR application (`ocurender-xr`) for real-time 478-landmark tracking.

---

## 2. Core Human Engineering & Verification
All primary architecture, mathematical formulations, and evaluation criteria were human-directed, designed, and verified:

1. **Biomechanical Rigging & Kinematics:**
   - 3D Damped Track bone constraint setup targeting a calibrated 35 cm fixation target at 40 cm focal plane in Blender 4.2 LTS.
   - Elimination of lower palpebral fissure eyelid clipping via coordinated shape keys (`Blink_L/R`, `BrowRaise`, `BrowFurrow`).
2. **Projective Camera Geometry:**
   - Derivation of the $3 \times 3$ camera intrinsics matrix $K$ and sub-pixel 2D pupil projection algorithms in `wrapper/eyes.py`.
3. **Automated Evaluation Harness:**
   - End-to-end headless evaluation suite achieving **100% 5/5 pass rate** across all cardinal gaze directions (Reset, Right, Left, Up, Down).
4. **Machine Learning Gaze Modeling:**
   - Closed-form Polynomial Ridge Regression solver and sliding-window temporal kinematics classifier for Angle Kappa and blink/saccade discrimination.

---

## 3. Originality & License Compliance
- All custom scripts (`wrapper/eyes.py`, `wrapper/dataset_factory.py`, `tools/package_submission.py`) are original work authored for this challenge.
- All 3D assets and textures comply with open-source licensing standards (CC0, MIT, and Apache 2.0).
- No proprietary, NDA-restricted, or third-party copyrighted assets were infringed upon.
