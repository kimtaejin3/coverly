#!/usr/bin/env python
"""CLI entry point. See coverly_worker/benchmark.py."""
import sys

from coverly_worker.benchmark import main

if __name__ == "__main__":
    sys.exit(main())
