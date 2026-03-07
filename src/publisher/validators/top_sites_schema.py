"""
top_sites_schema.py

JSON Schema validator for artifacts/top_sites.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

TOP_SITES_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "window_days", "sites"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at": {"type": "string"},
        "report_ts": {"type": "string"},
        "window_days": {"type": "integer", "minimum": 1},
        "sites": {
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
    """Validate a top_sites artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=TOP_SITES_SCHEMA)
