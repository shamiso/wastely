import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "ml"))

from env_loader import load_env_file


class EnvLoaderTest(unittest.TestCase):
    def test_load_env_file_parses_quoted_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                'FIRST="value-one"\nSECOND=value-two\n# COMMENTED=ignore\n',
                encoding="utf-8",
            )

            os.environ.pop("FIRST", None)
            os.environ.pop("SECOND", None)

            loaded = load_env_file(env_path)

        self.assertTrue(loaded)
        self.assertEqual(os.environ["FIRST"], "value-one")
        self.assertEqual(os.environ["SECOND"], "value-two")


if __name__ == "__main__":
    unittest.main()
