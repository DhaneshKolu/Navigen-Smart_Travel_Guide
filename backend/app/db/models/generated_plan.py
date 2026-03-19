from sqlalchemy import Column, Integer, ForeignKey, JSON
from app.db.base import Base


class GeneratedPlan(Base):

    __tablename__ = "generated_plans"

    id = Column(Integer, primary_key=True, index=True)
    itinerary_id = Column(Integer, ForeignKey("itineraries.id"))
    plan_data = Column(JSON)
    version = Column(Integer, default=1)
