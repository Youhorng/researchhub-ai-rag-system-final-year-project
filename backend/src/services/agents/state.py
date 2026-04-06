"""AgentState TypedDict for the retrieval graph."""

from typing import TypedDict


class AgentState(TypedDict, total=False):
    # Input
    query: str
    project_id: str
    paper_ids: list[str]  # UUIDs of accepted papers for the project (for chunk retrieval)
    research_goal: str
    initial_keywords: list[str]
    conversation_history: list[dict]

    # Pipeline state
    is_in_scope: bool
    is_conversational: bool
    rejection_message: str
    query_vector: list[float]
    retrieved_chunks: list[dict]
    graded_chunks: list[dict]
    rewritten_query: str
    rewrite_count: int

    # Metadata
    node_timings: dict
