"""
sent_to_udm_region_summary_schema.py

JSON Schema validator for sent_to_udm/region_summary.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

SENT_TO_UDM_REGION_SUMMARY_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "regions"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "report_ts":      {"type": "string"},
        "regions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["region", "site_count", "ccd_count", "first_seen", "last_seen"],
                "additionalProperties": False,
                "properties": {
                    "region":     {"type": "string"},
                    "site_count": {"type": "integer", "minimum": 0},
                    "ccd_count":  {"type": "integer", "minimum": 0},
                    "first_seen": {"type": "string"},
                    "last_seen":  {"type": "string"},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a sent_to_udm region_summary artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=SENT_TO_UDM_REGION_SUMMARY_SCHEMA)
