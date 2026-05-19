from fastapi import APIRouter
from features.hrbp.sample.route import router as sample_router

hrbp_router = APIRouter(prefix="/hrbp")

hrbp_router.include_router(sample_router)
