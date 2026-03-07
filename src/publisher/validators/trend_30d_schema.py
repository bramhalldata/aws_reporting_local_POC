"""
trend_30d_schema.py

JSON Schema validator for artifacts/trend_30d.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

TREND_30D_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "days"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at": {"type": "string"},
        "report_ts": {"type": "string"},
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["date", "failures"],
                "additionalProperties": False,
                "properties": {
                    "date": {"type": "string"},
                    "failures": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a trend_30d artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=TREND_30D_SCHEMA)
