from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
import asyncio

class EvaluationAgent(BaseAgent):

    name = "EvaluationAgent"
    requires_fields = ["daily_plan"]
    produces_fields = []


    def can_run(self, state: PlanningState) -> bool:
        return True

    async def run(self, state: PlanningState) -> PlanningState:
        print(f"{self.name} started")
        await asyncio.sleep(2)
        print(f"{self.name} finished")
        # TODO: Add quality scoring / ML evaluation later
        state.execution_log.append("Evaluation completed")

        return state

    def confidence(self, state: PlanningState) -> float:
        return 1.0

    def explain(self, state: PlanningState) -> str:
        return "Final plan evaluated for completeness."
