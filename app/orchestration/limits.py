from __future__ import annotations
from app.config import settings

class TrialLimits:
    def __init__(
        self,
        max_runs: int = settings.MAX_RUNS,
        min_demo_runs: int = settings.MIN_DEMO_RUNS,
        max_searches: int = settings.MAX_SEARCHES_PER_AGENT_PER_RUN,
        max_results: int = settings.MAX_RESULTS_PER_SEARCH,
        max_defence_searches: int = settings.MAX_DEFENCE_SEARCHES,
        max_tool_retries: int = settings.MAX_TOOL_RETRIES
    ):
        self.max_runs = max_runs
        self.min_demo_runs = min_demo_runs
        self.max_searches = max_searches
        self.max_results = max_results
        self.max_defence_searches = max_defence_searches
        self.max_tool_retries = max_tool_retries
