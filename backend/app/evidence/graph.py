from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class GraphNode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    node_id: str
    node_type: Literal[
        "EVENT", "COUNTRY", "SECTOR", "CLAIM", "DOCUMENT",
        "TRADE_ROW", "CORRECTION", "RETRACTION", "CHALLENGE",
        "CALCULATION", "RULING"
    ]
    label: str
    properties: dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    edge_id: str
    source: str
    target: str
    relation: Literal[
        "SUPPORTS", "CONTRADICTS", "CORRECTS", "RETRACTS",
        "DERIVED_FROM", "CHALLENGES", "RULED_AS", "SUBSTITUTES_FOR"
    ]
    weight: float = 1.0
    properties: dict[str, Any] = Field(default_factory=dict)

class EvidenceGraph(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)

    def add_node(self, node_id: str, node_type: str, label: str, **kwargs: Any) -> GraphNode:
        for n in self.nodes:
            if n.node_id == node_id:
                return n
        node = GraphNode(node_id=node_id, node_type=node_type, label=label, properties=kwargs)
        self.nodes.append(node)
        return node

    def add_edge(self, source: str, target: str, relation: str, weight: float = 1.0, **kwargs: Any) -> GraphEdge:
        edge_id = f"{source}->{relation}->{target}"
        for e in self.edges:
            if e.edge_id == edge_id:
                return e
        edge = GraphEdge(edge_id=edge_id, source=source, target=target, relation=relation, weight=weight, properties=kwargs)
        self.edges.append(edge)
        return edge

    def to_cytoscape(self) -> dict[str, Any]:
        """Export to Cytoscape / Vis.js compatible JSON format for frontend courtroom visualization."""
        elements = []
        for n in self.nodes:
            elements.append({
                "data": {"id": n.node_id, "label": n.label, "type": n.node_type, **n.properties}
            })
        for e in self.edges:
            elements.append({
                "data": {"id": e.edge_id, "source": e.source, "target": e.target, "label": e.relation, **e.properties}
            })
        return {"elements": elements}
