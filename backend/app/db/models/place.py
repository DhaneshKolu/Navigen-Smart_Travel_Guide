from sqlalchemy import Column, String, Integer, Float
from app.db.base import Base

class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, index=True)
    city = Column(String, index=True)  # NEW
    category = Column(String)

    rating = Column(Float, nullable=True)

    latitude = Column(Float)
    longitude = Column(Float)

    address = Column(String, nullable=True)
    source = Column(String, default="osm")
    external_id = Column(String, unique=True, nullable=True)