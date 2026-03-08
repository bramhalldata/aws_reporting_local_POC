"""
manifest_schema.py

JSON Schema validator for artifacts/manifest.json.

Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.1.0"

MANIFEST_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "run_id", "generated_at", "report_ts", "status", "artifacts"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "run_id": {"type": "string"},
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
