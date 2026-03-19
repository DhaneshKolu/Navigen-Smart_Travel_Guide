from typing import List
from app.agents.base_agent import BaseAgent


class DependencyResolver:

    def __init__(self, agents: List[BaseAgent]):
        self.agents = agents

    def get_affected_agents(self, changed_fields: List[str]):

        affected_agents = []

        for agent in self.agents:
            if any(field in agent.requires_fields for field in changed_fields):
                affected_agents.append(agent)

        return affected_agents
