"""
sent_to_udm_summary_schema.py

JSON Schema validator for sent_to_udm/summary.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

SENT_TO_UDM_SUMMARY_SCHEMA = {
    "type": "object",
    "required": [
        "schema_version",
        "generated_at",
        "report_ts",
        "total_regions_active",
        "total_sites_active",
        "total_ccds_sent",
        "earliest_event_ts",
        "latest_event_ts",
        "regions_active_30d",
        "sites_active_30d",
    ],
    "additionalProperties": False,
    "properties": {
        "schema_version":       {"type": "string"},
        "generated_at":         {"type": "string"},
        "report_ts":            {"type": "string"},
        "total_regions_active": {"type": "integer", "minimum": 0},
        "total_sites_active":   {"type": "integer", "minimum": 0},
        "total_ccds_sent":      {"type": "integer", "minimum": 0},
        "earliest_event_ts":    {"type": "string"},
        "latest_event_ts":      {"type": "string"},
        "regions_active_30d":   {"type": "integer", "minimum": 0},
        "sites_active_30d":     {"type": "integer", "minimum": 0},
    },
}


def validate(artifact: dict) -> None:
    """Validate a sent_to_udm summary artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=SENT_TO_UDM_SUMMARY_SCHEMA)
