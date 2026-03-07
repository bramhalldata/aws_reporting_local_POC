"""
manifest_schema.py

JSON Schema validator for artifacts/manifest.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

MANIFEST_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "report_ts", "status", "artifacts"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at": {"type": "string"},
        "report_ts": {"type": "string"},
        "status": {"type": "string", "enum": ["SUCCESS", "ERROR"]},
        "artifacts": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a manifest artifact dict against the schema. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=MANIFEST_SCHEMA)
