import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "ml"))

from waste_model import load_model, parse_training_payload, predict_rows, save_model, train_model


def synthetic_rows():
    rows = []
    for zone_id in range(1, 8):
        for offset in range(1, 6):
            features = {
                "zoneId": zone_id,
                "zoneName": f"Zone {zone_id}",
                "openReports": zone_id + offset,
                "inReviewReports": offset,
                "recentReports7d": zone_id + 2,
                "roadIssues7d": offset % 3,
                "severeRoadIssues7d": 1 if offset % 2 == 0 else 0,
                "congestionScore": 12 + zone_id * 3 + offset,
                "historicalAverageVolumeKg": 120 + zone_id * 25,
                "historicalSamples": 4 + offset,
                "missedPickupsScore": offset / 2,
                "summaryIssueScore": 10 + zone_id * 4,
            }
            actual = (
                65
                + features["openReports"] * 18
                + features["roadIssues7d"] * 9
                + features["congestionScore"] * 1.8
                + features["historicalAverageVolumeKg"] * 0.62
                + features["summaryIssueScore"] * 0.45
            )
            rows.append(
                {
                    "zoneId": zone_id,
                    "zoneName": f"Zone {zone_id}",
                    "features": features,
                    "actualVolumeKg": round(actual, 1),
                }
            )
    return rows


class WasteModelTest(unittest.TestCase):
    def test_train_and_predict(self):
        rows = synthetic_rows()
        model = train_model(rows)
        predictions = predict_rows(model, rows[:4])

        self.assertEqual(model.trained_rows, len(rows))
        self.assertLess(model.rmse, 12)
        self.assertEqual(len(predictions), 4)
        self.assertTrue(all(prediction["predictedVolumeKg"] > 100 for prediction in predictions))
        self.assertTrue(all(0.35 <= prediction["confidence"] <= 0.97 for prediction in predictions))

    def test_save_and_load_round_trip(self):
        rows = synthetic_rows()
        model = train_model(rows)

        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "model.json"
            save_model(model, model_path)
            reloaded = load_model(model_path)
            predictions = predict_rows(reloaded, rows[:2])

        self.assertEqual(reloaded.model_version, model.model_version)
        self.assertEqual(len(predictions), 2)

    def test_parse_training_payload_requires_rows(self):
        rows = synthetic_rows()
        payload_rows = parse_training_payload({"rows": rows})

        self.assertEqual(len(payload_rows), len(rows))

        with self.assertRaises(ValueError):
            parse_training_payload({"missing": []})


if __name__ == "__main__":
    unittest.main()
