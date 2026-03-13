from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from app.schemas import (
    AssetCatalogItem,
    AssetCatalogResponse,
    RespaceRunRequest,
    RespaceRunResponse,
)
from app.services.respace_runner import runner

load_dotenv(
    dotenv_path=Path(__file__).resolve().parents[1] / ".env",
    interpolate=False,
)

app = FastAPI(title="ReSpace Wrapper API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolve_asset_glb_path(asset_jid: str) -> Path | None:
    assets_root = os.getenv("PTH_3DFUTURE_ASSETS", "").strip()
    if not assets_root:
        return None

    root = Path(assets_root)
    candidates = [asset_jid]
    if "-(" in asset_jid:
        candidates.append(asset_jid.split("-(", 1)[0])

    for candidate in candidates:
        glb_path = root / candidate / "raw_model.glb"
        if glb_path.exists() and glb_path.is_file():
            return glb_path

    return None


def _resolve_asset_file_path(asset_jid: str, file_name: str) -> Path | None:
    assets_root = os.getenv("PTH_3DFUTURE_ASSETS", "").strip()
    if not assets_root:
        return None

    root = Path(assets_root)
    candidates = [asset_jid]
    if "-(" in asset_jid:
        candidates.append(asset_jid.split("-(", 1)[0])

    for candidate in candidates:
        file_path = root / candidate / file_name
        if file_path.exists() and file_path.is_file():
            return file_path

    return None


def _list_asset_catalog_page(
    page: int,
    page_size: int,
    search: str,
) -> tuple[list[str], bool]:
    assets_root = os.getenv("PTH_3DFUTURE_ASSETS", "").strip()
    if not assets_root:
        return [], False

    root = Path(assets_root)
    if not root.exists() or not root.is_dir():
        return [], False

    start = (page - 1) * page_size
    end = start + page_size
    index = 0
    has_more = False
    page_entries: list[str] = []

    lowered_query = search.strip().lower()

    for child in root.iterdir():
        if not child.is_dir():
            continue

        if lowered_query and lowered_query not in child.name.lower():
            continue

        if index < start:
            index += 1
            continue

        if index < end:
            page_entries.append(child.name)
            index += 1
            continue

        has_more = True
        break

    return page_entries, has_more


def _attach_asset_urls(result: dict[str, object], request: Request) -> None:
    scene = result.get("scene")
    if not isinstance(scene, dict):
        return

    objects = scene.get("objects")
    if not isinstance(objects, list):
        return

    base_url = str(request.base_url).rstrip("/")
    for obj in objects:
        if not isinstance(obj, dict):
            continue

        jid = (
            obj.get("sampled_asset_jid")
            or obj.get("jid")
            or obj.get("asset_jid")
            or obj.get("model_id")
        )

        if not isinstance(jid, str) or not jid.strip():
            continue

        stripped_jid = jid.strip()
        if _resolve_asset_glb_path(stripped_jid) is None:
            continue

        obj["asset_glb_url"] = (
            f"{base_url}/assets/3dfuture/{quote(stripped_jid, safe='')}/raw_model.glb"
        )

        texture_path = _resolve_asset_file_path(stripped_jid, "image.jpg")
        texture_name = "image.jpg"
        if texture_path is None:
            texture_path = _resolve_asset_file_path(stripped_jid, "texture.png")
            texture_name = "texture.png"

        if texture_path is not None:
            obj["asset_texture_url"] = (
                f"{base_url}/assets/3dfuture/{quote(stripped_jid, safe='')}/{texture_name}"
            )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/assets/3dfuture/list", response_model=AssetCatalogResponse)
def list_assets_3dfuture(
    request: Request,
    page: int = 1,
    page_size: int = 25,
    search: str = "",
) -> AssetCatalogResponse:
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")

    page_size = max(1, min(page_size, 100))
    page_entries, has_more = _list_asset_catalog_page(page, page_size, search)

    base_url = str(request.base_url).rstrip("/")
    items: list[AssetCatalogItem] = []
    for asset_id in page_entries:
        # Skip entries with missing models so frontend does not hit 404.
        if _resolve_asset_glb_path(asset_id) is None:
            continue

        encoded = quote(asset_id, safe="")

        image_path = _resolve_asset_file_path(asset_id, "image.jpg")
        texture_path = _resolve_asset_file_path(asset_id, "texture.png")

        items.append(
            AssetCatalogItem(
                id=asset_id,
                title=asset_id,
                modelUrl=f"{base_url}/assets/3dfuture/{encoded}/raw_model.glb",
                thumbnailUrl=(
                    f"{base_url}/assets/3dfuture/{encoded}/image.jpg"
                    if image_path is not None
                    else None
                ),
                textureUrl=(
                    f"{base_url}/assets/3dfuture/{encoded}/texture.png"
                    if texture_path is not None
                    else None
                ),
            ),
        )

    return AssetCatalogResponse(
        page=page,
        pageSize=page_size,
        total=None,
        totalPages=None,
        hasMore=has_more,
        items=items,
    )


@app.get("/assets/3dfuture/{asset_jid:path}/raw_model.glb")
def serve_asset_glb(asset_jid: str) -> FileResponse:
    if ".." in asset_jid or asset_jid.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid asset id")

    glb_path = _resolve_asset_glb_path(asset_jid)
    if glb_path is None:
        raise HTTPException(status_code=404, detail="Asset GLB not found")

    return FileResponse(glb_path, media_type="model/gltf-binary")


@app.get("/assets/3dfuture/{asset_jid:path}/{file_name}")
def serve_asset_file(asset_jid: str, file_name: str) -> FileResponse:
    if ".." in asset_jid or asset_jid.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid asset id")

    if file_name not in {"image.jpg", "texture.png"}:
        raise HTTPException(status_code=404, detail="Unsupported asset file")

    file_path = _resolve_asset_file_path(asset_jid, file_name)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Asset file not found")

    media_type = "image/jpeg" if file_name.endswith(".jpg") else "image/png"
    return FileResponse(file_path, media_type=media_type)


@app.post("/respace/run", response_model=RespaceRunResponse)
def run_respace(payload: RespaceRunRequest, request: Request) -> RespaceRunResponse:
    try:
        result = runner.run(
            geometry=payload.geometry,
            prompt=payload.generationConfig.prompt,
        )
        _attach_asset_urls(result, request)
        return RespaceRunResponse(**result)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(error)) from error
