from __future__ import annotations
import json
import logging
import sys
from typing import Any

def setup_logger(name: str = "ragnarok") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger

log = setup_logger()

def log_event(event_type: str, agent: str, **kwargs: Any) -> None:
    data = {"event_type": event_type, "agent": agent, **kwargs}
    log.info(json.dumps(data, default=str))
