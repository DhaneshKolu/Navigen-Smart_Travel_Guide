from abc import ABC, abstractmethod
from typing import List, Any


class BaseAgent(ABC):

    name: str = "BaseAgent"

    requires_fields: List[str] = []

    produces_fields: List[str] = []

    def can_run(self, state: Any) -> bool:
        return True

    @abstractmethod
    async def run(self, state: Any) -> Any:
        pass

    def confidence(self, state: Any) -> float:
        return 1.0

    def explain(self, state: Any) -> str:
        return f"{self.name} executed."
