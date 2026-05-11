from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "J2W Recruiter Tracking"
    secret_key: str = Field(default="j2w-super-secret-key-change-in-production-2024", validation_alias="JWT_SECRET")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8 hours

    # PostgreSQL (local/self-hosted)
    database_url: str | None = Field(default=None, validation_alias="DATABASE_URL")

    # Supabase
    supabase_db_url: str | None = Field(default=None, validation_alias="SUPABASE_DB_URL")
    database_to_use: str = Field(default="SUPABASE", validation_alias="DATABASE_TO_USE")

    # Azure OpenAI
    azure_openai_api_key: str | None = Field(default=None, validation_alias="AZURE_OPENAI_API_KEY")
    azure_openai_endpoint: str | None = Field(default=None, validation_alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_deployment: str = Field(default="gpt-4o-mini", validation_alias="AZURE_OPENAI_DEPLOYMENT")
    azure_api_version: str = Field(default="2024-12-01-preview", validation_alias="AZURE_API_VERSION")
    azure_openai_model: str = Field(default="gpt-4o-mini", validation_alias="AZURE_OPENAI_MODEL")

    # Gmail
    gmail_user: str | None = Field(default=None, validation_alias="GMAIL_USER")
    gmail_app_password: str | None = Field(default=None, validation_alias="GMAIL_APP_PASSWORD")

    @computed_field  # type: ignore[misc]
    @property
    def active_db_url(self) -> str:
        if self.database_to_use.upper() == "SUPABASE":
            if not self.supabase_db_url:
                raise ValueError("SUPABASE_DB_URL must be set when DATABASE_TO_USE=SUPABASE")
            url = self.supabase_db_url
            if "sslmode" not in url:
                url += "?sslmode=require"
            return url
        # POSTGRESQL
        if not self.database_url:
            raise ValueError("DATABASE_URL must be set when DATABASE_TO_USE=POSTGRESQL")
        return self.database_url


settings = Settings()
