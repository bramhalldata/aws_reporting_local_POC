"""
pipeline_health_failure_types_schema.py

JSON Schema validator for pipeline_health/failure_types.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

PIPELINE_HEALTH_FAILURE_TYPES_SCHEMA = {
    "type": "object",
    "required": [
        "schema_version",
        "generated_at",
        "report_ts",
        "window_days",
        "failure_types",
    ],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "report_ts":      {"type": "string"},
        "window_days":    {"type": "integer"},
        "failure_types": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["failure_type", "count"],
                "additionalProperties": False,
                "properties": {
                    "failure_type": {"type": "string"},
                    "count":        {"type": "integer"},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a pipeline_health failure_types artifact dict. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=PIPELINE_HEALTH_FAILURE_TYPES_SCHEMA)
