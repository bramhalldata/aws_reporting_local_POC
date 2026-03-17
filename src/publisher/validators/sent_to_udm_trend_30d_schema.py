"""
sent_to_udm_trend_30d_schema.py

JSON Schema validator for sent_to_udm/trend_30d.json.

Note: field name is ccd_count (not failures) — this is a separate artifact from
dlq_operations/trend_30d.json which uses failures. There is no contract conflict.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

SENT_TO_UDM_TREND_30D_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "days"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "report_ts":      {"type": "string"},
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["date", "ccd_count"],
                "additionalProperties": False,
                "properties": {
                    "date":      {"type": "string"},
                    "ccd_count": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a sent_to_udm trend_30d artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=SENT_TO_UDM_TREND_30D_SCHEMA)
