from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "J2W Recruiter Tracking"
    secret_key: str = Field(default="j2w-super-secret-key-change-in-production-2024", validation_alias="JWT_SECRET")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8 hours
    database_url: str = Field(default="sqlite:///./j2w_tracker.db", validation_alias="DATABASE_URL")
    azure_openai_api_key: str | None = Field(default=None, validation_alias="AZURE_OPENAI_API_KEY")
    azure_openai_endpoint: str | None = Field(default=None, validation_alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_deployment: str = Field(default="gpt-4o-mini", validation_alias="AZURE_OPENAI_DEPLOYMENT")
    azure_api_version: str = Field(default="2024-12-01-preview", validation_alias="AZURE_API_VERSION")
    azure_openai_model: str = Field(default="gpt-4o-mini", validation_alias="AZURE_OPENAI_MODEL")
    gmail_user: str | None = Field(default=None, validation_alias="GMAIL_USER")
    gmail_app_password: str | None = Field(default=None, validation_alias="GMAIL_APP_PASSWORD")


settings = Settings()
