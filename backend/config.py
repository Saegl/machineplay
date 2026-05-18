from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tc: str = Field(default="30+0.3", validation_alias="MACHINEPLAY_TC")
    mongo_url: str = Field(
        default="mongodb://localhost:27017", validation_alias="MONGO_URL"
    )
    mongo_db: str = Field(default="machineplay", validation_alias="MONGO_DB")


settings = Settings()


def parse_tc(spec: str) -> tuple[float, float]:
    base, _, inc = spec.partition("+")
    return float(base), float(inc) if inc else 0.0
