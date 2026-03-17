import sys
import os
import unittest
import jsonschema

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from validators import sent_to_udm_lifetime_detail_schema

VALID = {
    "schema_version": "1.2.0",
    "generated_at": "2026-03-17T18:00:00+00:00",
    "report_ts": "2026-03-17T18:00:00Z",
    "rows": [
        {
            "region": "AZ",
            "site": "az_site_1",
            "ccd_count": 87,
            "first_seen": "2026-01-06 23:59:14-05:00",
            "last_seen": "2026-03-07 01:07:46-05:00",
        }
    ],
}


class TestSentToUdmLifetimeDetailSchema(unittest.TestCase):

    def test_valid_payload_passes(self):
        sent_to_udm_lifetime_detail_schema.validate(VALID)

    def test_missing_required_field_fails(self):
        payload = {k: v for k, v in VALID.items() if k != "rows"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_lifetime_detail_schema.validate(payload)

    def test_wrong_type_fails(self):
        payload = {**VALID, "rows": [{"region": "AZ", "site": "az_site_1",
                                       "ccd_count": "eighty-seven",
                                       "first_seen": "2026-01-06", "last_seen": "2026-03-07"}]}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_lifetime_detail_schema.validate(payload)

    def test_extra_field_fails(self):
        payload = {**VALID, "unexpected_key": "value"}
        with self.assertRaises(jsonschema.ValidationError):
            sent_to_udm_lifetime_detail_schema.validate(payload)


if __name__ == "__main__":
    unittest.main()
