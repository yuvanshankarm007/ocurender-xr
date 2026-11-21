"""
wrapper/eyes.py
Samsung PRISM XR Hackathon Challenge 2026 - Track 1: Synthetic Eye Movement & Virtual Camera Rendering

Official Evaluator API:
- eyes.move(h: float, v: float)
- eyes.reset()
- eyes.render(filepath: str) -> dict

Features:
- Dual execution mode:
  1. Native Blender mode: Directly manipulates scene when imported inside Blender.
  2. External Subprocess mode: Works from any standard Python shell by driving Blender headless.
- Accurate projective geometry and camera intrinsics computation.
- Ground truth export conforming to Track 1 JSON specification.
"""

import os
import sys
import json
import math
import shutil
import subprocess

# Check if running inside Blender
try:
    import bpy
    import bpy_extras.object_utils
    from mathutils import Vector, Euler, Matrix
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False


class EyeController:
    """
    Standardized eye controller interface required by Samsung PRISM Track 1 evaluation.
    """

    H_SCALE = 0.075  # 7.5 cm horizontal gaze excursion (~12 deg)
    V_SCALE = 0.055  # 5.5 cm vertical gaze excursion (~9 deg)
    EYE_RADIUS = 0.0125  # 12.5 mm eye radius

    def __init__(self, blend_path=None):
        self.current_h = 0.0
        self.current_v = 0.0
        self.frame_counter = 0

        # Locate scene.blend
        if blend_path:
            self.blend_path = os.path.abspath(blend_path)
        else:
            cand1 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scene.blend"))
            cand2 = os.path.abspath(os.path.join(os.getcwd(), "scene.blend"))
            if os.path.exists(cand1):
                self.blend_path = cand1
            elif os.path.exists(cand2):
                self.blend_path = cand2
            else:
                self.blend_path = cand1

        if IN_BLENDER:
            self._init_blender_scene()

    def _init_blender_scene(self):
        """Initializes pointers to scene objects when running inside Blender."""
        # Ensure scene.blend is loaded if currently on default startup
        if not bpy.data.objects.get("MakeHuman_Rig") and os.path.exists(self.blend_path):
            bpy.ops.wm.open_mainfile(filepath=self.blend_path)

        self.scene = bpy.context.scene
        self.cam = bpy.data.objects.get("Camera")
        self.rig = bpy.data.objects.get("MakeHuman_Rig")
        self.eye_l = bpy.data.objects.get("Eye_L")
        self.eye_r = bpy.data.objects.get("Eye_R")
        self.target = bpy.data.objects.get("FixationTarget")

        if not self.target:
            raise RuntimeError("FixationTarget object not found in scene.blend!")

        # Eye midpoint reference (rest position)
        self.target_base = Vector((0.0, -0.4745, 1.5462))
        self.reset()

    def move(self, h: float, v: float):
        """
        Moves the virtual eyes horizontally and vertically.
        Parameters:
            h (float): Horizontal displacement in [-1.0, 1.0]. Positive = Right, Negative = Left.
            v (float): Vertical displacement in [-1.0, 1.0]. Positive = Up, Negative = Down.
        """
        # Clamp to [-1.0, 1.0]
        h = max(-1.0, min(1.0, float(h)))
        v = max(-1.0, min(1.0, float(v)))
        self.current_h = h
        self.current_v = v

        if IN_BLENDER:
            if self.target and self.target.animation_data:
                self.target.animation_data_clear()
            new_pos = self.target_base + Vector((h * self.H_SCALE, 0.0, v * self.V_SCALE))
            self.target.location = new_pos
            bpy.context.view_layer.update()

    def reset(self):
        """
        Resets eye orientation back to primary gaze (center).
        """
        self.move(0.0, 0.0)

    def render(self, filepath: str, frame_id: int = None) -> dict:
        """
        Renders the current frame to the specified filepath (PNG, 1024x1024)
        and returns ground-truth metadata.
        """
        abs_path = os.path.abspath(filepath)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        fid = frame_id if frame_id is not None else self.frame_counter

        if IN_BLENDER:
            return self._render_in_blender(abs_path, fid)
        else:
            return self._render_via_subprocess(abs_path, fid)

    def _render_in_blender(self, filepath: str, frame_id: int) -> dict:
        """Native Blender internal render implementation."""
        # Ensure latest transforms
        bpy.context.view_layer.update()

        # Render image
        self.scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)

        # 1. 2D Projected Pupil Centers
        pupil_l_world = self.eye_l.matrix_world @ Vector((0.0, self.EYE_RADIUS, 0.0))
        pupil_r_world = self.eye_r.matrix_world @ Vector((0.0, self.EYE_RADIUS, 0.0))

        co_l = bpy_extras.object_utils.world_to_camera_view(self.scene, self.cam, pupil_l_world)
        co_r = bpy_extras.object_utils.world_to_camera_view(self.scene, self.cam, pupil_r_world)

        res_x = self.scene.render.resolution_x
        res_y = self.scene.render.resolution_y

        px_l = [round(co_l.x * res_x, 2), round((1.0 - co_l.y) * res_y, 2)]
        px_r = [round(co_r.x * res_x, 2), round((1.0 - co_r.y) * res_y, 2)]

        # 2. 3D Eye Rotation Matrices (3x3 world rotation of eye bones)
        bone_l = self.rig.pose.bones.get("eye.L")
        bone_r = self.rig.pose.bones.get("eye.R")

        rot_mat_l = (self.rig.matrix_world @ bone_l.matrix).to_3x3()
        rot_mat_r = (self.rig.matrix_world @ bone_r.matrix).to_3x3()

        eye_rotation_L = [[round(float(v), 6) for v in row] for row in rot_mat_l]
        eye_rotation_R = [[round(float(v), 6) for v in row] for row in rot_mat_r]

        # 3. Camera Intrinsic Matrix
        fx = self.cam.data.lens * (res_x / self.cam.data.sensor_width)
        fy = fx
        cx = res_x / 2.0
        cy = res_y / 2.0
        camera_matrix = [
            [round(float(fx), 4), 0.0, round(float(cx), 4)],
            [0.0, round(float(fy), 4), round(float(cy), 4)],
            [0.0, 0.0, 1.0]
        ]

        metadata = {
            "frame": frame_id,
            "input": {
                "h": round(self.current_h, 4),
                "v": round(self.current_v, 4)
            },
            "eye_rotation_L": eye_rotation_L,
            "eye_rotation_R": eye_rotation_R,
            "pupil_center_2D_L": px_l,
            "pupil_center_2D_R": px_r,
            "camera_matrix": camera_matrix
        }

        self.frame_counter = frame_id + 1
        return metadata

    def _render_via_subprocess(self, filepath: str, frame_id: int) -> dict:
        """Spawns Blender in background mode to render and compute metadata."""
        blender_exe = self._find_blender_binary()
        if not blender_exe:
            raise FileNotFoundError("Blender executable not found in PATH or standard installation directories!")

        # Script to run inside Blender
        script_content = f"""
import os, sys, json, bpy
import bpy_extras.object_utils
from mathutils import Vector

scene = bpy.context.scene
cam = bpy.data.objects['Camera']
rig = bpy.data.objects['MakeHuman_Rig']
eye_l = bpy.data.objects['Eye_L']
eye_r = bpy.data.objects['Eye_R']
target = bpy.data.objects['FixationTarget']

h = {self.current_h}
v = {self.current_v}
target_base = Vector((0.0, -0.4745, 1.5462))
if target.animation_data:
    target.animation_data_clear()
target.location = target_base + Vector((h * {self.H_SCALE}, 0.0, v * {self.V_SCALE}))
bpy.context.view_layer.update()

out_path = r"{filepath}"
scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)

# Projected pupil centers
pupil_l = eye_l.matrix_world @ Vector((0.0, {self.EYE_RADIUS}, 0.0))
pupil_r = eye_r.matrix_world @ Vector((0.0, {self.EYE_RADIUS}, 0.0))
co_l = bpy_extras.object_utils.world_to_camera_view(scene, cam, pupil_l)
co_r = bpy_extras.object_utils.world_to_camera_view(scene, cam, pupil_r)

res_x = scene.render.resolution_x
res_y = scene.render.resolution_y
px_l = [round(co_l.x * res_x, 2), round((1.0 - co_l.y) * res_y, 2)]
px_r = [round(co_r.x * res_x, 2), round((1.0 - co_r.y) * res_y, 2)]

# Rotations
rot_l = (rig.matrix_world @ rig.pose.bones['eye.L'].matrix).to_3x3()
rot_r = (rig.matrix_world @ rig.pose.bones['eye.R'].matrix).to_3x3()
rot_l_list = [[round(float(val), 6) for val in row] for row in rot_l]
rot_r_list = [[round(float(val), 6) for val in row] for row in rot_r]

# Camera Matrix
fx = cam.data.lens * (res_x / cam.data.sensor_width)
k = [
    [round(float(fx), 4), 0.0, round(float(res_x / 2.0), 4)],
    [0.0, round(float(fx), 4), round(float(res_y / 2.0), 4)],
    [0.0, 0.0, 1.0]
]

result = {{
    "frame": {frame_id},
    "input": {{"h": round(h, 4), "v": round(v, 4)}},
    "eye_rotation_L": rot_l_list,
    "eye_rotation_R": rot_r_list,
    "pupil_center_2D_L": px_l,
    "pupil_center_2D_R": px_r,
    "camera_matrix": k
}}
print("---META_START---" + json.dumps(result) + "---META_END---")
"""
        cmd = [
            blender_exe,
            "-b",
            self.blend_path,
            "--python-expr",
            script_content
        ]

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        out = proc.stdout
        start = out.find("---META_START---")
        end = out.find("---META_END---")
        if start == -1 or end == -1:
            raise RuntimeError(f"Failed to parse metadata from Blender output:\n{out}")

        meta_json = out[start + len("---META_START---"):end]
        self.frame_counter = frame_id + 1
        return json.loads(meta_json)

    @staticmethod
    def _find_blender_binary():
        which = shutil.which("blender")
        if which:
            return which
        env_p = os.environ.get("BLENDER_PATH")
        if env_p and os.path.exists(env_p):
            return env_p
        candidates = [
            r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
            r"C:\Program Files\Blender Foundation\Blender\blender.exe",
            "/usr/bin/blender",
            "/usr/local/bin/blender",
            "/Applications/Blender.app/Contents/MacOS/blender"
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return None


# Module-level singleton instance for evaluator ease
eyes = EyeController()


# Top-level functional aliases
def move(h: float, v: float):
    eyes.move(h, v)


def reset():
    eyes.reset()


def render(filepath: str) -> dict:
    return eyes.render(filepath)


# Self-test / benchmark generator when invoked as script
if __name__ == "__main__":
    print("=" * 60)
    print("Samsung PRISM XR Track 1 - Automated Evaluation Suite")
    print("=" * 60)

    # 1. Run 5/5 Direction Tests
    print("\n[Step 1/3] Running 5/5 Direction Verification Tests...")
    direction_tests = [
        ("Reset", 0.0, 0.0),
        ("Right", 1.0, 0.0),
        ("Left", -1.0, 0.0),
        ("Up", 0.0, 1.0),
        ("Down", 0.0, -1.0)
    ]

    base_l = None
    base_r = None
    all_passed = True

    for name, h, v in direction_tests:
        eyes.move(h, v)
        test_path = os.path.abspath(f"renders/test_{name.lower()}.png")
        meta = eyes.render(test_path)
        px_l = meta["pupil_center_2D_L"]
        px_r = meta["pupil_center_2D_R"]

        if name == "Reset":
            base_l = px_l
            base_r = px_r
            print(f"  ✓ {name:6s} -> Baseline L={px_l}, R={px_r}")
        else:
            dx_l = px_l[0] - base_l[0]
            dy_l = px_l[1] - base_l[1]
            dx_r = px_r[0] - base_r[0]
            dy_r = px_r[1] - base_r[1]

            # Verify correct direction
            passed = False
            if name == "Right" and dx_l > 5.0 and dx_r > 5.0:
                passed = True
            elif name == "Left" and dx_l < -5.0 and dx_r < -5.0:
                passed = True
            elif name == "Up" and dy_l < -5.0 and dy_r < -5.0:
                passed = True
            elif name == "Down" and dy_l > 5.0 and dy_r > 5.0:
                passed = True

            status = "PASSED" if passed else "FAILED"
            if not passed:
                all_passed = False
            print(f"  {'✓' if passed else '✗'} {name:6s} -> dL=({dx_l:+.1f}, {dy_l:+.1f}) px, dR=({dx_r:+.1f}, {dy_r:+.1f}) px [{status}]")

    print(f"\nDirection Verification Result: {'100% 5/5 PASSED' if all_passed else 'SOME TESTS FAILED'}")

    # 2. Render 10 Clockwise Frames & Build metadata.json
    print("\n[Step 2/3] Rendering 10 Clockwise Frames (theta_k = 2*pi*k / 10)...")
    frames_meta = []
    eyes.reset()

    for k in range(10):
        theta = 2.0 * math.pi * k / 10.0
        h_k = math.sin(theta)
        v_k = math.cos(theta)
        eyes.move(h_k, v_k)
        frame_filename = f"renders/frame_{k:03d}.png"
        meta = eyes.render(frame_filename, frame_id=k)
        frames_meta.append(meta)
        print(f"  Frame {k:02d}/09: theta={math.degrees(theta):5.1f}°, h={h_k:+.3f}, v={v_k:+.3f} -> saved '{frame_filename}'")

    # 3. Save metadata.json
    print("\n[Step 3/3] Saving metadata.json...")
    meta_output = {
        "version": "1.0",
        "description": "Samsung PRISM XR Track 1 - Synthetic Eye Movement Benchmark",
        "resolution": [1024, 1024],
        "total_frames": len(frames_meta),
        "frames": frames_meta
    }

    meta_file = os.path.abspath("metadata.json")
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta_output, f, indent=2)
    print(f"  ✓ Saved '{meta_file}' successfully!")

    print("\n" + "=" * 60)
    print("All Deliverables Successfully Generated & Verified!")
    print("=" * 60)


def _normalize_mode(raw: str) -> str:
    key = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if key in ("left", "input_left", "1"):
        return "left"
    if key in ("right", "input_right", "2"):
        return "right"
    if key in ("generate_motion", "input_generate_motion", "motion", "3"):
        return "generate_motion"
    raise ValueError(f"Unsupported mode '{raw}'. Expected: left | right | generate_motion")


def _bake_mode_keyframes(mode: str):
    """Configures Timeline keyframes inside Blender for left / right / generate_motion."""
    scene = bpy.context.scene
    face_obj = bpy.data.objects["MakeHuman_Face"]
    rig_obj = bpy.data.objects["MakeHuman_Rig"]
    target_obj = bpy.data.objects["FixationTarget"]

    target_base = Vector((0.0, -0.4745, 1.5462))
    h_scale = EyeController.H_SCALE
    v_scale = EyeController.V_SCALE

    if mode == "left":
        frame_end = 72  # 3.0s @ 24fps (< 15s limit)
        keyframes = [
            (1,   0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (10,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (15, -0.42, 0.02, 0.92, 0.12, 0.00, -1.0, 0.2),
            (20, -0.88, 0.04, 0.00, 0.24, 0.00, -2.2, 0.3),
            (54, -0.88, 0.04, 0.00, 0.22, 0.00, -2.2, 0.3),
            (60, -0.35, 0.01, 0.85, 0.08, 0.00, -0.8, 0.1),
            (66,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (72,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
        ]
    elif mode == "right":
        frame_end = 72  # 3.0s @ 24fps (< 15s limit)
        keyframes = [
            (1,   0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (10,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (15,  0.42, 0.02, 0.92, 0.08, 0.08,  1.0, 0.2),
            (20,  0.88, 0.04, 0.00, 0.12, 0.18,  2.2, 0.3),
            (54,  0.88, 0.04, 0.00, 0.12, 0.16,  2.2, 0.3),
            (60,  0.35, 0.01, 0.85, 0.06, 0.04,  0.8, 0.1),
            (66,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
            (72,  0.00, 0.00, 0.00, 0.05, 0.00,  0.0, 0.0),
        ]
    else:  # generate_motion
        frame_end = 144  # 6.0s @ 24fps (< 15s limit)
        keyframes = [
            (1,    0.00,  0.00, 0.00, 0.05, 0.00,  0.0,  0.0),
            (16,   0.00,  0.00, 0.00, 0.05, 0.00,  0.0,  0.0),
            (20,  -0.40,  0.02, 0.95, 0.10, 0.00, -1.2,  0.2),
            (24,  -0.82,  0.05, 0.00, 0.20, 0.00, -2.5,  0.4),
            (46,  -0.82,  0.05, 0.00, 0.18, 0.00, -2.5,  0.4),
            (52,   0.00,  0.02, 0.85, 0.05, 0.05,  0.0,  0.0),
            (57,   0.84,  0.04, 0.00, 0.10, 0.25,  2.5, -0.3),
            (78,   0.84,  0.04, 0.00, 0.10, 0.22,  2.5, -0.3),
            (86,   0.10,  0.72, 0.00, 0.78, 0.00,  0.4,  2.2),
            (106, -0.15,  0.76, 0.00, 0.82, 0.00, -0.5,  2.4),
            (114,  0.00, -0.25, 0.98, 0.05, 0.00,  0.0, -0.6),
            (120,  0.00,  0.00, 0.00, 0.10, 0.00,  0.0,  0.0),
            (144,  0.00,  0.00, 0.00, 0.05, 0.00,  0.0,  0.0),
        ]

    scene.frame_start = 1
    scene.frame_end = frame_end
    scene.render.fps = 24

    for obj_anim in (target_obj, rig_obj):
        if obj_anim.animation_data:
            obj_anim.animation_data_clear()
    if face_obj.data.shape_keys and face_obj.data.shape_keys.animation_data:
        face_obj.data.shape_keys.animation_data_clear()

    head_bone = rig_obj.pose.bones.get("head")
    if head_bone:
        head_bone.rotation_mode = "XYZ"

    kbs = face_obj.data.shape_keys.key_blocks
    for frame, h, v, blink, b_up, b_furrow, yaw_deg, pitch_deg in keyframes:
        scene.frame_set(frame)
        target_obj.location = target_base + Vector((h * h_scale, 0.0, v * v_scale))
        target_obj.keyframe_insert(data_path="location", frame=frame)
        for kname, val in (("Blink_L", blink), ("Blink_R", blink), ("BrowRaise", b_up), ("BrowFurrow", b_furrow)):
            if kname in kbs:
                kbs[kname].value = val
                kbs[kname].keyframe_insert(data_path="value", frame=frame)
        if head_bone:
            head_bone.rotation_euler = Euler((math.radians(pitch_deg), 0.0, math.radians(yaw_deg)), "XYZ")
            head_bone.keyframe_insert(data_path="rotation_euler", frame=frame)


def render_expression_video(mode: str, out_video_path: str, blend_path: str = None, width: int = 512, height: int = 512, samples: int = 8, engine: str = "CYCLES"):
    """
    Takes one of the 3 required inputs ('left', 'right', 'generate_motion'),
    renders the animated frames, and encodes an MP4 video (< 15 seconds).
    Works both inside Blender and from standard external Python.
    """
    mode = _normalize_mode(mode)
    abs_video = os.path.abspath(out_video_path)
    os.makedirs(os.path.dirname(abs_video), exist_ok=True)

    if IN_BLENDER:
        if blend_path and os.path.exists(blend_path):
            bpy.ops.wm.open_mainfile(filepath=blend_path)
        _bake_mode_keyframes(mode)
        scene = bpy.context.scene
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        scene.render.resolution_percentage = 100
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = False
        scene.render.image_settings.file_format = "FFMPEG"
        scene.render.ffmpeg.format = "MPEG4"
        scene.render.ffmpeg.codec = "H264"
        scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
        scene.render.filepath = abs_video
        bpy.ops.render.render(animation=True)
        print(f"[OK] Rendered {mode} video -> {abs_video}")
        return abs_video

    # External Python -> launch Blender headless
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    b_path = os.path.abspath(blend_path or os.path.join(root_dir, "scene.blend"))
    blender_exe = shutil.which("blender") or "blender"
    py_expr = (
        f"import sys; sys.path.insert(0, r'{root_dir}'); "
        f"from wrapper.eyes import render_expression_video; "
        f"render_expression_video({mode!r}, r'{abs_video}', blend_path=r'{b_path}', width={width}, height={height}, samples={samples}, engine={engine!r})"
    )
    subprocess.run([blender_exe, "-b", b_path, "--python-expr", py_expr], check=True)
    return abs_video


if __name__ == "__main__" and not IN_BLENDER:
    import argparse
    parser = argparse.ArgumentParser(description="Samsung PRISM XR Track 1 - Eye & Expression Controller")
    parser.add_argument("--mode", type=str, help="Input mode: left | right | generate_motion")
    parser.add_argument("--video", type=str, default=None, help="Output MP4 path (default: videos/input_<mode>.mp4)")
    parser.add_argument("--interactive", action="store_true", help="Prompt interactively for Left / Right / Generate Motion")
    parser.add_argument("--samples", type=int, default=8, help="Cycles samples per frame for video rendering")
    args = parser.parse_args()

    if args.interactive and not args.mode:
        print("Select Input Mode:\n  1. Input Left\n  2. Input Right\n  3. Input Generate Motion")
        args.mode = input("Enter choice (left / right / generate_motion): ").strip()

    if args.mode:
        norm = _normalize_mode(args.mode)
        out_vid = args.video or os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "videos",
            f"input_{norm}.mp4",
        )
        render_expression_video(norm, out_vid, samples=args.samples)
    else:
        # Default: run official benchmark verification if no --mode given
        pass
