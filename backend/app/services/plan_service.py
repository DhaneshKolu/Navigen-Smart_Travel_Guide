from sqlalchemy.orm import Session
from app.db.models.generated_plan import GeneratedPlan


def get_latest_plan(db: Session, itinerary_id: int):

    return (
        db.query(GeneratedPlan)
        .filter(GeneratedPlan.itinerary_id == itinerary_id)
        .order_by(GeneratedPlan.version.desc())
        .first()
    )
