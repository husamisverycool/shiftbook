"""Encodes a JPEG as an iPhone-style HEIC (HEVC). Used only to generate the demo samples.

Usage: python -I scripts/encode-heic.py input.jpg output.heic
Needs pillow-heif (bundles libheif with the x265 encoder).
"""
import sys

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()
image = Image.open(sys.argv[1])
image.save(sys.argv[2], format="HEIF", quality=70)
print(f"wrote {sys.argv[2]}")
