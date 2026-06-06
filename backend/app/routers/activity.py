import logging
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ActivityLog, User
from app.schemas import ActivityLogResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["activity"])

@router.get("/", response_model=List[ActivityLogResponse])
async def list_activity(
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the recent activity logs for the current user."""
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return logs
