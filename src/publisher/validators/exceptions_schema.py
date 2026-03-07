"""
exceptions_schema.py

JSON Schema validator for artifacts/exceptions.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

EXCEPTIONS_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "window_days", "exceptions"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at": {"type": "string"},
        "report_ts": {"type": "string"},
        "window_days": {"type": "integer", "minimum": 1},
        "exceptions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["failure_type", "count"],
                "additionalProperties": False,
                "properties": {
                    "failure_type": {"type": "string"},
                    "count": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate an exceptions artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=EXCEPTIONS_SCHEMA)
