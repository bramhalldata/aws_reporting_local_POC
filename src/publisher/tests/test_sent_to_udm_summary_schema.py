import sys
import os
import unittest
import jsonschema

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from validators import sent_to_udm_summary_schema

VALID = {
    "schema_version": "1.2.0",
    "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "total_regions_active": 4,
    "total_sites_active": 6,
    "total_ccds_sent": 300,
    "earliest_event_ts": "2026-01-06 23:59:14-05:00",
    "latest_event_ts": "2026-03-07 01:07:46-05:00",
    "regions_active_30d": 4,
    "sites_active_30d": 6,
}


class TestSentToUdmSummarySchema(unittest.TestCase):

    def test_valid_payload_passes(self):
        sent_to_udm_summary_schema.validate(VALID)

    def test_missing_required_field_fails(self):
        payload = {k: v for k, v in VALID.items() if k != "total_ccds_sent"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_summary_schema.validate(payload)

    def test_wrong_type_fails(self):
        payload = {**VALID, "total_ccds_sent": "three hundred"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_summary_schema.validate(payload)

    def test_extra_field_fails(self):
        payload = {**VALID, "unexpected_key": "value"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_summary_schema.validate(payload)


if __name__ == "__main__":
    unittest.main()
