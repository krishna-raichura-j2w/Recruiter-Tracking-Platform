from fastapi import APIRouter, BackgroundTasks

from features.hrbp.tasks.scheduler import check_contract_closures

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/contract-closures/run")
def trigger_contract_closures(background_tasks: BackgroundTasks):
    """
    Manually trigger the contract closure job (admin use / testing).
    Runs the same logic as the daily 08:00 UTC cron.
    """
    background_tasks.add_task(check_contract_closures)
    return {"meta": {"status": True, "message": "Contract closure job queued."}}
