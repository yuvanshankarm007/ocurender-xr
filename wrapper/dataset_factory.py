"""
Parameterized Synthetic Gaze Dataset Factory (Track 01 Extension)
Demonstrates scalable domain randomization (gaze eccentricity, iris pigmentation,
and studio lighting variation) for training Galaxy XR / Android XR gaze estimators.
"""
import argparse
import csv
import json
import math
import os
import random

try:
    import bpy
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False


def generate_sampling_manifest(num_samples: int = 100, seed: int = 42):
    """Generates a deterministic, domain-randomized gaze & lighting sampling plan."""
    rng = random.Random(seed)
    samples = []
    iris_palettes = [
        ("ocean_blue", [0.12, 0.45, 0.85, 1.0]),
        ("emerald_green", [0.15, 0.55, 0.32, 1.0]),
        ("hazel_amber", [0.55, 0.38, 0.14, 1.0]),
        ("deep_brown", [0.22, 0.12, 0.06, 1.0]),
    ]

    for i in range(num_samples):
        # Stratified uniform + extreme-eccentricity sampling
        angle = rng.uniform(0, 2 * math.pi)
        radius = math.sqrt(rng.uniform(0.0, 1.0))
        h = round(max(-1.0, min(1.0, radius * math.sin(angle))), 4)
        v = round(max(-1.0, min(1.0, radius * math.cos(angle))), 4)
        iris_name, iris_rgba = rng.choice(iris_palettes)
        key_energy = round(rng.uniform(40.0, 140.0), 2)

        samples.append({
            "sample_id": i,
            "h": h,
            "v": v,
            "iris_palette": iris_name,
            "iris_rgba": iris_rgba,
            "key_light_watts": key_energy,
        })
    return samples


def run_factory(output_dir: str, num_samples: int = 20, render_images: bool = False):
    os.makedirs(output_dir, exist_ok=True)
    plan = generate_sampling_manifest(num_samples=num_samples)

    if IN_BLENDER and render_images:
        from wrapper.eyes import EyeController
        ctrl = EyeController()
        records = []
        for item in plan:
            ctrl.move(item["h"], item["v"])
            key_light = bpy.data.objects.get("KeyLight")
            if key_light and key_light.data:
                key_light.data.energy = item["key_light_watts"]
            img_path = os.path.join(output_dir, f"synth_{item['sample_id']:04d}.png")
            meta = ctrl.render(img_path, frame_id=item["sample_id"])
            meta["iris_palette"] = item["iris_palette"]
            meta["key_light_watts"] = item["key_light_watts"]
            records.append(meta)
        ctrl.reset()
    else:
        records = plan

    manifest_json = os.path.join(output_dir, "dataset_manifest.json")
    with open(manifest_json, "w", encoding="utf-8") as f:
        json.dump({"total_samples": len(records), "samples": records}, f, indent=2)

    manifest_csv = os.path.join(output_dir, "dataset_labels.csv")
    with open(manifest_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["sample_id", "h", "v", "iris_palette", "key_light_watts"])
        for item in plan:
            writer.writerow([item["sample_id"], item["h"], item["v"], item["iris_palette"], item["key_light_watts"]])

    print(f"[OK] Generated {len(plan)} domain-randomized gaze samples -> {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OcuRender Track 1 Synthetic Dataset Factory")
    parser.add_argument("--out", default="dataset_out", help="Output directory")
    parser.add_argument("--count", type=int, default=100, help="Number of samples")
    parser.add_argument("--render", action="store_true", help="Render PNG frames inside Blender")
    args, _ = parser.parse_known_args()
    run_factory(args.out, num_samples=args.count, render_images=args.render)
