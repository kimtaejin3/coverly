#!/usr/bin/env python
"""CLI entry point. See coverly_worker/make_voice.py."""
import sys

from coverly_worker.make_voice import main

if __name__ == "__main__":
    sys.exit(main())
