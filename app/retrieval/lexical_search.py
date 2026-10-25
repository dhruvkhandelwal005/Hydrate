from __future__ import annotations
import math
from app.utils.text import tokenize

def compute_lexical_score(query: str, text: str, title: str = "") -> float:
    """
    Computes token-based lexical match score with title weighting.
    """
    q_tokens = tokenize(query)
    if not q_tokens:
        return 0.0

    body_tokens = tokenize(text)
    title_tokens = tokenize(title)

    body_overlap = len(q_tokens & body_tokens) / max(1, len(q_tokens))
    title_overlap = len(q_tokens & title_tokens) / max(1, len(q_tokens))

    return 0.65 * body_overlap + 0.35 * title_overlap
