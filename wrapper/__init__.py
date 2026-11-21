"""
wrapper package for Samsung PRISM XR Track 1.
Exposes the eye movement API: move(h, v), reset(), and render(filepath).
"""

from .eyes import EyeController, eyes, move, reset, render

__all__ = ["EyeController", "eyes", "move", "reset", "render"]
