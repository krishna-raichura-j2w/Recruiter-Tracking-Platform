from fastapi import APIRouter, Depends

from core.deps import require_roles
from features.hrbp.audit_log.route import router as audit_log_router
from features.hrbp.auth.route import router as auth_router
from features.hrbp.cadence_schedules.route import router as cadence_schedules_router
from features.hrbp.clients.route import router as clients_router
from features.hrbp.consultants.route import router as consultants_router
from features.hrbp.email_templates.route import router as email_templates_router
from features.hrbp.emails.route import router as emails_router
from features.hrbp.incidents.route import router as incidents_router
from features.hrbp.kra_definitions.route import router as kra_router
from features.hrbp.nps_surveys.route import router as nps_surveys_router
from features.hrbp.routine_schedules.route import router as routine_schedules_router
from features.hrbp.sample.route import router as sample_router
from features.hrbp.signal_definitions.route import router as signal_router
from features.hrbp.signals.route import router as signals_router
from features.hrbp.sop_definitions.route import router as sop_router
from features.hrbp.sop_steps.route import router as sop_steps_router
from features.hrbp.storage.route import router as storage_router

hrbp_router = APIRouter(prefix="/hrbp")

# Roles permitted to access HRBP data endpoints.
# Add new roles here as the system grows — no other file needs to change.
_HRBP_ROLES = Depends(require_roles("hrbp", "bh", "admin"))

# Auth router is open to any authenticated user (needed for token refresh + profile).
hrbp_router.include_router(auth_router)

# All data routers are restricted to permitted roles.
hrbp_router.include_router(sample_router,             dependencies=[_HRBP_ROLES])
hrbp_router.include_router(kra_router,                dependencies=[_HRBP_ROLES])
hrbp_router.include_router(email_templates_router,    dependencies=[_HRBP_ROLES])
hrbp_router.include_router(sop_router,                dependencies=[_HRBP_ROLES])
hrbp_router.include_router(signal_router,             dependencies=[_HRBP_ROLES])
hrbp_router.include_router(clients_router,            dependencies=[_HRBP_ROLES])
hrbp_router.include_router(consultants_router,        dependencies=[_HRBP_ROLES])
hrbp_router.include_router(incidents_router,          dependencies=[_HRBP_ROLES])
hrbp_router.include_router(sop_steps_router,          dependencies=[_HRBP_ROLES])
hrbp_router.include_router(emails_router,             dependencies=[_HRBP_ROLES])
hrbp_router.include_router(signals_router,            dependencies=[_HRBP_ROLES])
hrbp_router.include_router(routine_schedules_router,  dependencies=[_HRBP_ROLES])
hrbp_router.include_router(nps_surveys_router,        dependencies=[_HRBP_ROLES])
hrbp_router.include_router(audit_log_router,          dependencies=[_HRBP_ROLES])
hrbp_router.include_router(cadence_schedules_router,  dependencies=[_HRBP_ROLES])
hrbp_router.include_router(storage_router,            dependencies=[_HRBP_ROLES])
