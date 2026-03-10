"""
cli.py — publisher CLI entry point

Provides a stable command interface for the AWS Reporting Publisher.

Usage (after pip install -e .):
    publisher run --env local --dashboard dlq_operations
    publisher run --env local --dashboard dlq_operations --client acme_health

    publisher bootstrap --client contexture --env local

--env local   : Uses the local POC stack (DuckDB + local Parquet).
--env prod    : (Future) Routes to AWS Athena + S3.
"""

import argparse
from datetime import datetime, timezone

from publisher import main as publisher_main


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="publisher",
        description="AWS Reporting Publisher",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run_cmd = sub.add_parser("run", help="Run the publisher pipeline for one dashboard")
    run_cmd.add_argument(
        "--env",
        required=True,
        help="Deployment environment (e.g. local, prod)",
    )
    run_cmd.add_argument(
        "--dashboard",
        required=True,
        help="Dashboard to publish (e.g. dlq_operations)",
    )
    run_cmd.add_argument(
        "--client",
        default=None,
        help="Client identifier for multi-client deployments (optional)",
    )

    bootstrap_cmd = sub.add_parser(
        "bootstrap",
        help="Initialize a full client/env scope by running all supported dashboards",
    )
    bootstrap_cmd.add_argument(
        "--env",
        default="local",
        help="Deployment environment (default: local)",
    )
    bootstrap_cmd.add_argument(
        "--client",
        default=None,
        help="Client identifier (default: default)",
    )

    args = parser.parse_args()

    if args.command == "run":
        report_ts = (
            datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )
        publisher_main.run(
            report_ts,
            env=args.env,
            dashboard=args.dashboard,
            client=args.client,
        )

    elif args.command == "bootstrap":
        publisher_main.bootstrap(env=args.env, client=args.client)


if __name__ == "__main__":
    main()
