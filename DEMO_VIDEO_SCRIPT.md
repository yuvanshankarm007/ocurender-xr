# OcuRender XR — 2-Minute Demo Video Script

**Target Time:** 120 Seconds (2 Minutes)  
**Tone:** Energetic, authoritative, engineering-focused, visionary  
**Visual Style:** Screen recording with webcam in corner, switching between live tracking, 3D avatar, and telemetry HUD.

---

### [00:00 – 00:20] Hook: The Two Fatal Flaws of XR Telepresence
**Visual:** Quick clips of an XR headset user on a video call looking off-axis, followed by an overheating warning graphic.
> **Narrator:**
> *"Extended Reality is the future of computing, but modern XR headsets have two fatal flaws. First, because physical cameras are mounted on the headset visor—65 millimeters above your eyes—you can never make eye contact on calls. You always look like you're staring down. 
> Second, rendering dual 4K micro-displays drains mobile batteries in under 90 minutes. 
> Introducing **OcuRender XR**: an in-browser computer vision and virtual camera engine that solves both problems using biologically grounded eye kinematics and gaze-contingent foveated rendering."*

---

### [00:20 – 00:50] Feature 1: Sensory Layer & Real-Time Iris Tracking
**Visual:** Cut to the OcuRender XR dashboard. Show the left panel: live camera stream with 478 MediaPipe iris landmarks, 3D gaze vector projecting from pupils. Move eyes left and right.
> **Narrator:**
> *"Look at our Sensory Layer. Using Google MediaPipe Face Mesh with iris refinement running locally via WebAssembly, we track 478 3D landmarks at a locked 60 frames per second. 
> Our custom Velocity-Adaptive Double EMA filter completely eliminates jitter during fixations, yet responds instantaneously with zero lag the millisecond my eyes jump into a ballistic saccade."*

---

### [00:50 – 01:25] Feature 2: 3D Virtual Camera, Parallax Correction & Avatar Biomechanics
**Visual:** Cut to the center Three.js 3D viewport. Click "Show Fovea Rings", then toggle "Parallax Correction". Switch to "Synthetic Saccade AI" and select "Reading" then "Conversational".
> **Narrator:**
> *"In the center, our 3D Telepresence Stage renders a holographic avatar whose eyes mimic my gaze in real time. 
> Watch what happens when I toggle Parallax Correction: the virtual camera mathematically compensates for the 65mm physical sensor displacement, realigning the visual axis for true 1:1 mutual eye contact.
> When no camera is available, our Autonomous Biomechanical Engine takes over. Rooted in Carpenter's Main Sequence Law, it synthesizes realistic human saccades up to 750 degrees per second, physiological micro-tremor, and spontaneous blinks with Bell's upward elevation across conversational, reading, and visual search modes."*

---

### [01:25 – 01:45] Feature 3: Gaze-Contingent Foveated Shading & ~64% GPU Savings
**Visual:** Zoom in on the Foveated Shader effect. Show how the center of gaze remains crystal-clear while the periphery softly blurs. Highlight the Telemetry HUD showing "64.2% Workload Reduction".
> **Narrator:**
> *"Notice the post-processing shader. Human visual acuity is concentrated in the central 2.5 degrees of the fovea. Our custom GLSL shader focuses full GPU shading power only where your eye is gazing, downsampling peripheral passes. 
> As you can see on our real-time telemetry HUD, this reduces pixel-shading load by over 64%, adding an estimated 1.8 hours of battery life to mobile XR headsets."*

---

### [01:45 – 02:00] Conclusion & Call to Action
**Visual:** Click "OpenXR Data" button, triggering confetti and instant JSON download. Show clean repo architecture and test suite.
> **Narrator:**
> *"With one click, researchers can export standard OpenXR-compliant eye interaction datasets. 
> Built with React, TypeScript, Three.js, and backed by 10 passing unit tests, OcuRender XR brings biological realism and computational efficiency to the next generation of Samsung XR hardware. 
> Thank you."*
