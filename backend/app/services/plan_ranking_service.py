from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models.generated_plan import GeneratedPlan
from app.db.models.plan_feedback import PlanFeedback

def get_ranked_plans(
    db:Session,
    user_id:int,
    itinerary_id:int
):
    
    return (
        db.query(GeneratedPlan,func.avg(PlanFeedback.rating).label("avg rating"))
        .outerjoin(PlanFeedback,PlanFeedback.plan_id == GeneratedPlan.id)
        .filter(GeneratedPlan.user_id == user_id,
                GeneratedPlan.itinerary_id == itinerary_id)
        .group_by(GeneratedPlan.id)
        .order_by(func.avg(PlanFeedback.rating).desc().nullslast())
        .all()
    )