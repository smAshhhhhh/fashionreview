"""缩略图尺寸、缓存失效与路径边界回归。"""

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image, UnidentifiedImageError

from app.services.annotation.thumbnail import (
    _render_thumbnail,
    annotation_thumbnail,
)


class AnnotationThumbnailTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.name = "a" * 32 + ".jpg"
        self.source = self.directory / self.name
        self.settings = patch(
            "app.services.annotation.thumbnail.get_settings",
            return_value=SimpleNamespace(annotation_dir=str(self.directory)),
        )
        self.settings.start()
        _render_thumbnail.cache_clear()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.settings.stop)
        self.addCleanup(_render_thumbnail.cache_clear)

    def test_responsive_widths_preserve_aspect_ratio(self):
        Image.new("RGB", (2400, 1800), "blue").save(self.source)
        original = self.source.read_bytes()
        for width in (384, 768, 1152):
            with self.subTest(width=width):
                data = annotation_thumbnail(self.name, width)
                with Image.open(BytesIO(data)) as thumbnail:
                    self.assertEqual(thumbnail.format, "WEBP")
                    self.assertEqual(thumbnail.size, (width, width * 3 // 4))
                self.assertLess(len(data), len(original))
        self.assertEqual(self.source.read_bytes(), original)

    def test_small_images_are_not_upscaled(self):
        Image.new("RGB", (120, 240), "blue").save(self.source)
        with Image.open(BytesIO(annotation_thumbnail(self.name, 384))) as image:
            self.assertEqual(image.size, (120, 240))

    def test_exif_orientation_is_applied(self):
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (1200, 600), "blue").save(self.source, exif=exif)
        with Image.open(BytesIO(annotation_thumbnail(self.name, 384))) as image:
            self.assertEqual(image.size, (384, 768))

    def test_cache_refreshes_and_deleted_source_is_not_served(self):
        Image.new("RGB", (1000, 500), "blue").save(self.source)
        first = annotation_thumbnail(self.name, 384)
        self.assertEqual(annotation_thumbnail(self.name, 384), first)
        self.assertEqual(_render_thumbnail.cache_info().hits, 1)
        Image.new("RGB", (1000, 800), "red").save(self.source)
        self.assertNotEqual(annotation_thumbnail(self.name, 384), first)
        self.source.unlink()
        with self.assertRaises(FileNotFoundError):
            annotation_thumbnail(self.name, 384)

    def test_rejects_paths_missing_files_and_unbounded_widths(self):
        for name in ("../" + self.name, "..\\" + self.name, self.name):
            with self.subTest(name=name), self.assertRaises(FileNotFoundError):
                annotation_thumbnail(name, 384)
        for width in (0, 1, 400, 100000):
            with self.subTest(width=width), self.assertRaises(ValueError):
                annotation_thumbnail(self.name, width)

    def test_corrupt_image_is_rejected(self):
        self.source.write_bytes(b"invalid image")
        with self.assertRaises(UnidentifiedImageError):
            annotation_thumbnail(self.name, 384)


if __name__ == "__main__":
    unittest.main()
