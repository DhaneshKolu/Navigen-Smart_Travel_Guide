from sqlalchemy.orm import Session
from app.db.models.itinerary import Itinerary

def create_itinerary(
        db:Session,
        user_id:int,
        destination:str,
        days:int,

):
    itinerary = Itinerary(
        user_id = user_id,
        destination = destination,
        days = days
    )

    db.add(itinerary)
    db.commit()
    db.refresh(itinerary)
    return itinerary

def get_user_itineraries(
        db:Session,
        user_id:int
):
    return db.query(Itinerary).filter(Itinerary.user_id == user_id).all()
