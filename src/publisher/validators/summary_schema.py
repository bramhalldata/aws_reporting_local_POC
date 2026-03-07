"""
summary_schema.py

JSON Schema validator for artifacts/summary.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

SUMMARY_SCHEMA = {
    "type": "object",
    "required": [
        "schema_version",
        "generated_at",
        "report_ts",
        "failures_last_24h",
        "failures_last_7d",
        "top_sites",
    ],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at": {"type": "string"},
        "report_ts": {"type": "string"},
        "failures_last_24h": {"type": "integer", "minimum": 0},
        "failures_last_7d": {"type": "integer", "minimum": 0},
        "top_sites": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["site", "failures"],
                "additionalProperties": False,
                "properties": {
                    "site": {"type": "string"},
                    "failures": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a summary artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=SUMMARY_SCHEMA)
