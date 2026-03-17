import sys
import os
import unittest
import jsonschema

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from validators import sent_to_udm_trend_30d_schema

VALID = {
    "schema_version": "1.2.0",
    "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "days": [{"date": "2026-02-16", "ccd_count": 4}],
}


class TestSentToUdmTrend30dSchema(unittest.TestCase):

    def test_valid_payload_passes(self):
        sent_to_udm_trend_30d_schema.validate(VALID)

    def test_missing_required_field_fails(self):
        payload = {k: v for k, v in VALID.items() if k != "days"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_trend_30d_schema.validate(payload)

    def test_wrong_type_fails(self):
        payload = {**VALID, "days": [{"date": "2026-02-16", "ccd_count": "four"}]}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_trend_30d_schema.validate(payload)

    def test_extra_field_fails(self):
        payload = {**VALID, "unexpected_key": "value"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_trend_30d_schema.validate(payload)


if __name__ == "__main__":
    unittest.main()
