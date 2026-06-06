import json
from typing import Any, Dict, Union
from sqlalchemy.orm import Session
from app.models import ActivityLog

def log_activity(
    db: Session,
    user_id: int,
    action: str,
    details: Union[str, Dict[str, Any], None] = None,
) -> ActivityLog:
    """
    Log user activity/actions into the activity_logs database table.
    """
    details_str = None
    if details is not None:
        if isinstance(details, dict):
            details_str = json.dumps(details)
        else:
            details_str = str(details)
            
    log_entry = ActivityLog(
        user_id=user_id,
        action=action,
        details=details_str
    )
    db.add(log_entry)
    db.commit()
    return log_entry
