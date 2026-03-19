from typing import List, Optional
from pydantic import BaseModel


class ReplanRequest(BaseModel):

    new_budget: Optional[float] = None
    new_interests: Optional[List[str]] = None
