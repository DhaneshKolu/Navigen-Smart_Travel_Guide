from pydantic import BaseModel, Field


class NearbyPlacesRequest(BaseModel):
    city: str = Field(..., min_length=1)
    categories: list[str] = Field(
        default_factory=lambda: ["restaurant", "cafe", "hotel"],
        description="Place categories to fetch, e.g. restaurant, cafe, hotel",
    )
    limit: int = Field(default=40, ge=1, le=200)
    refresh: bool = Field(default=True, description="Force live refresh from Geoapify")


class NearbyHotelsRequest(BaseModel):
    city: str = Field(..., min_length=1)
    budget_per_night: float | None = Field(default=None, gt=0)
    limit: int = Field(default=10, ge=1, le=50)
    center_lat: float | None = None
    center_lon: float | None = None
