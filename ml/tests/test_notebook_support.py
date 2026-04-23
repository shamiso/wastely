import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "ml"))

from notebook_support import find_project_root, load_training_rows, synthetic_training_rows


class NotebookSupportTest(unittest.TestCase):
    def test_find_project_root(self):
        notebooks_dir = PROJECT_ROOT / "ml" / "notebooks"
        self.assertEqual(find_project_root(notebooks_dir), PROJECT_ROOT)

    def test_load_training_rows_uses_file_when_available(self):
        sample_rows = synthetic_training_rows()[:3]
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "rows.json"
            data_path.write_text(json.dumps({"rows": sample_rows}), encoding="utf-8")

            rows, source_info = load_training_rows(
                app_url="http://127.0.0.1:1",
                data_file=data_path,
                timeout=0.1,
            )

        self.assertEqual(len(rows), 3)
        self.assertEqual(source_info["source"], "file")

    def test_load_training_rows_falls_back_to_synthetic_when_api_is_down(self):
        rows, source_info = load_training_rows(
            app_url="http://127.0.0.1:1",
            timeout=0.1,
        )

        self.assertGreater(len(rows), 10)
        self.assertEqual(source_info["source"], "synthetic")
        self.assertIn("Start `pnpm dev`", source_info["message"])


if __name__ == "__main__":
    unittest.main()
