"""
pipeline_health_summary_schema.py

JSON Schema validator for pipeline_health/summary.json.
Schema changes must also be reflected in docs/json-contracts.md.
"""

import jsonschema

SCHEMA_VERSION = "1.0.0"

PIPELINE_HEALTH_SUMMARY_SCHEMA = {
    "type": "object",
    "required": [
        "schema_version",
        "generated_at",
        "report_ts",
        "total_documents_last_24h",
        "active_sites_last_24h",
        "latest_event_timestamp",
    ],
    "additionalProperties": False,
    "properties": {
        "schema_version":           {"type": "string"},
        "generated_at":             {"type": "string"},
        "report_ts":                {"type": "string"},
        "total_documents_last_24h": {"type": "integer"},
        "active_sites_last_24h":    {"type": "integer"},
        "latest_event_timestamp":   {"type": "string"},
    },
}


def validate(artifact: dict) -> None:
    """Validate a pipeline_health summary artifact dict. Raises ValidationError on failure."""
    jsonschema.validate(instance=artifact, schema=PIPELINE_HEALTH_SUMMARY_SCHEMA)
