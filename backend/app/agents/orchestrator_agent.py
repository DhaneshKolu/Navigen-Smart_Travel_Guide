from typing import List
from app.agents.base_agent import BaseAgent
from app.agents.dependency_resolver import DependencyResolver
from app.agents.state import PlanningState, AgentDecision
import asyncio
from app.services.routing_service import RoutingService




class TravelOrchestrator:

    def __init__(self, agents: List[BaseAgent]):
        self.agents = agents
        self.resolver = DependencyResolver(agents)
        self.routing_service = RoutingService()

    async def execute_full(self, state: PlanningState):

        await self._run_agents_parallel(self.agents,state)

        return state

    async def execute_partial(self, state: PlanningState, changed_fields: List[str]):   

        affected_agents = self.resolver.get_affected_agents(changed_fields)

        await self._run_agents_parallel(affected_agents,state)

        return state

    async def _run_agents_parallel(self, agents:List[BaseAgent], state:PlanningState):

        for agent in agents:
            if not agent.can_run(state):
                continue

            await self._run_single_agent(agent, state)


    async def _run_single_agent(self,agent:BaseAgent,state:PlanningState):

        state.execution_log.append(f"Running {agent.name}")
        print("Running agent:", agent.name)
        try:
            await agent.run(state)

            decision = AgentDecision(
                agent=agent.name,
                explanation=agent.explain(state),
                confidence=agent.confidence(state),
            )
            state.agent_decisions.append(decision)
        except Exception as e:
            err = f"{agent.name} failed: {e}"
            print(err)
            state.execution_log.append(err)
            state.agent_decisions.append(
                AgentDecision(
                    agent=agent.name,
                    explanation=f"Agent skipped due to runtime error: {e}",
                    confidence=0.0,
                )
            )
