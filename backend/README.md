uvicorn app:app --reload

To skip the startup database bootstrap during fast local reloads, set:

RUN_STARTUP_BOOTSTRAP=false

To keep the API up without starting the background scheduler:

START_SCHEDULER_ON_STARTUP=false