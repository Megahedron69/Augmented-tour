from typing import Any

from pydantic import BaseModel, Field


class GenerationConfig(BaseModel):
    wallHeight: float = Field(default=3.0)
    wallThickness: float = Field(default=0.15)
    unitScale: float = Field(default=0.01)
    prompt: str = Field(default="Generate a realistic furnished interior.")


class RespaceRunRequest(BaseModel):
    source: str
    geometry: dict[str, Any]
    generationConfig: GenerationConfig


class RespaceRunResponse(BaseModel):
    ok: bool
    mode: str
    message: str
    isSuccess: bool | None = None
    scene: dict[str, Any] | None = None
    debug: dict[str, Any] | None = None


class AssetCatalogItem(BaseModel):
    id: str
    title: str
    modelUrl: str
    thumbnailUrl: str | None = None
    textureUrl: str | None = None


class AssetCatalogResponse(BaseModel):
    page: int
    pageSize: int
    total: int | None = None
    totalPages: int | None = None
    hasMore: bool = False
    items: list[AssetCatalogItem]
