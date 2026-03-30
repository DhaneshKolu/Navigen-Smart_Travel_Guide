from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    APP_NAME: str = "Smart Travel Planner"
    ENV: str = "development"

    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ALGORITHM: str = "HS256"

    DATABASE_URL: str
    OPENWEATHER_API_KEY: str
    ORS_API_KEY: str
    OPENTRIPMAP_API_KEY: str = ""
    GEOAPIFY_API_KEY: str = ""
    GEOAPIFY_TIMEOUT_SECONDS: float = 10.0
    GEOAPIFY_DEFAULT_RADIUS_METERS: int = 5000
    
    GOOGLE_PLACES_API_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,https://navigen-smart-travel-guide-1.onrender.com"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
