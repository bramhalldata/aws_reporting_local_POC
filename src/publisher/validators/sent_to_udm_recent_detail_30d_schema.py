"""
sent_to_udm_recent_detail_30d_schema.py

JSON Schema validator for sent_to_udm/recent_detail_30d.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

SENT_TO_UDM_RECENT_DETAIL_30D_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "window_days", "rows"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "report_ts":      {"type": "string"},
        "window_days":    {"type": "integer"},
        "rows": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["region", "site", "ccd_count", "first_seen_30d", "last_seen_30d"],
                "additionalProperties": False,
                "properties": {
                    "region":         {"type": "string"},
                    "site":           {"type": "string"},
                    "ccd_count":      {"type": "integer", "minimum": 0},
                    "first_seen_30d": {"type": "string"},
                    "last_seen_30d":  {"type": "string"},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a sent_to_udm recent_detail_30d artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=SENT_TO_UDM_RECENT_DETAIL_30D_SCHEMA)
