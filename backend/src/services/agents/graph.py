"""LangGraph retrieval graph — orchestrates guardrail, retrieve, grade, rewrite."""

import logging

from langgraph.graph import END, StateGraph
from opensearchpy import OpenSearch

from src.services.agents.nodes.grade_docs import make_grade_docs_node
from src.services.agents.nodes.guardrail import make_guardrail_node
from src.services.agents.nodes.retrieve import make_retrieve_node
from src.services.agents.nodes.rewrite_query import make_rewrite_query_node
from src.services.agents.state import AgentState

logger = logging.getLogger(__name__)


def route_after_guardrail(state: AgentState) -> str:
    """Route after guardrail: skip retrieval for off-topic or conversational queries."""
    if not state.get("is_in_scope", True):
        return END
    if state.get("is_conversational", False):
        return END
    return "retrieve"


def route_after_grading(state: AgentState) -> str:
    """Route after grading: end if we have relevant chunks, rewrite if not."""
    graded = state.get("graded_chunks", [])
    rewrite_count = state.get("rewrite_count", 0)

    if graded:
        return END
    if rewrite_count < 1:
        return "rewrite_query"
    # Already retried once — return what we have
    return END


def build_retrieval_graph(os_client: OpenSearch, trace) -> StateGraph:
    """Build and compile the retrieval agent graph.

    Args:
        os_client: OpenSearch client for chunk retrieval
        trace: Langfuse trace/span for observability

    Returns:
        Compiled LangGraph that takes AgentState and returns AgentState
    """
    graph = StateGraph(AgentState)

    # Register nodes (using factories to inject dependencies)
    graph.add_node("guardrail", make_guardrail_node(trace))
    graph.add_node("retrieve", make_retrieve_node(os_client, trace))
    graph.add_node("grade_docs", make_grade_docs_node(trace))
    graph.add_node("rewrite_query", make_rewrite_query_node(trace))

    # Edges
    graph.set_entry_point("guardrail")
    graph.add_conditional_edges("guardrail", route_after_guardrail)
    graph.add_edge("retrieve", "grade_docs")
    graph.add_conditional_edges("grade_docs", route_after_grading)
    graph.add_edge("rewrite_query", "retrieve")

    return graph.compile()
