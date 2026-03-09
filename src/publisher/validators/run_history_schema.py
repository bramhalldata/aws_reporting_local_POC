"""
run_history_schema.py

JSON Schema validator for run_history.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

# SCHEMA_VERSION is a documentary constant for human reference and audit trail.
# It is not enforced by the jsonschema validator — validation checks structure, not version.
SCHEMA_VERSION = "1.1.0"

RUN_HISTORY_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "generated_at", "runs"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string"},
        "generated_at":   {"type": "string"},
        "runs": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "run_id", "dashboard_id", "report_ts", "generated_at",
                    "status", "artifacts", "schema_version",
                ],
                "additionalProperties": False,
                "properties": {
                    "run_id":         {"type": "string"},
                    "dashboard_id":   {"type": "string"},
                    "report_ts":      {"type": "string"},
                    "generated_at":   {"type": "string"},
                    "status":         {"type": "string", "enum": ["SUCCESS", "FAILURE"]},
                    "artifacts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["name", "type", "path"],
                            "additionalProperties": False,
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string"},
                                "path": {"type": "string"},
                            },
                        },
                    },
                    "schema_version": {"type": "string"},
                },
            },
        },
    },
}


def validate(artifact: dict) -> None:
    """Validate a run_history artifact dict. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=RUN_HISTORY_SCHEMA)
