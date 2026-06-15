from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://uptime:uptime_secret@localhost:5432/uptime_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "supersecretkey-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@uptime.io"
    FRONTEND_URL: str = "http://localhost"
    TELEGRAM_BOT_TOKEN: str = ""
    CORS_ORIGINS: List[str] = ["http://localhost", "http://localhost:3000", "http://localhost:5173"]
    # Stripe billing
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # OAuth (Google)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    # OAuth (GitHub)
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    # App
    APP_NAME: str = "Uptime"
    APP_ENV: str = "development"  # development | production

    @field_validator("DATABASE_URL")
    @classmethod
    def require_postgres(cls, value: str) -> str:
        if value.startswith("sqlite"):
            raise ValueError("SQLite is disabled. Set DATABASE_URL to a PostgreSQL connection string.")
        return value

    class Config:
        env_file = ".env"


settings = Settings()
