from sqlalchemy import Column, Integer, ForeignKey, String, Float, Date
from app.db.base import Base

class Itinerary(Base):
    __tablename__ = "itineraries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    destination = Column(String,nullable=False)
    days = Column(Integer,nullable=False)
    comfort_radius = Column(Float, default=5.0)
    budget = Column(Float, default=0.0)
    travel_budget = Column(Integer, default=0)
    hotel_budget = Column(Integer, default=0)
    food_budget = Column(Integer, default=0)
    pace = Column(String, default="moderate")
    trip_start_date = Column(Date, nullable=True)

