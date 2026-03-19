import time
from sqlalchemy.orm import Session
from app.db.models.plan_feedback import PlanFeedback

def save_plan_feedback(
        db:Session,
        plan_id:int,
        rating:int,
        comment:str|None
):
    feedback = PlanFeedback(
        plan_id = plan_id,
        rating = rating,
        comment = comment,
        created_at = int(time.time())
    )
    

    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback