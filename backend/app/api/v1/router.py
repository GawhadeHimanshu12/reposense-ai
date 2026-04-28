from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth, chat, repositories, repos, security, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(repositories.router, prefix="/repositories", tags=["repositories"])
api_router.include_router(security.router, prefix="/security", tags=["security"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(repos.router, prefix="/repos", tags=["repos"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
