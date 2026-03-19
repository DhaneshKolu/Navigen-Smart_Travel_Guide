from sqlalchemy import Column,Integer,ForeignKey,Text
from app.db.base import Base


class PlanFeedback(Base):
    __tablename__ = "plan_feedback"
    
    id = Column(Integer,primary_key = True,index = True)
    plan_id = Column(
        Integer,
        ForeignKey("generated_plans.id",ondelete="CASCADE"),
        nullable = False
    )

    rating = Column(Integer,nullable=False)
    comment = Column(Text,nullable=True)

    created_at = Column(Integer,nullable=False)