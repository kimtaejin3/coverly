#!/usr/bin/env python
"""CLI entry point. See coverly_worker/cli.py."""
import sys

from coverly_worker.cli import main

if __name__ == "__main__":
    sys.exit(main())
