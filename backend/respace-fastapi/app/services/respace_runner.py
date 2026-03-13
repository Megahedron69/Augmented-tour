from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any


class RespaceRunner:
    def __init__(self) -> None:
        self._respace = None
        self.mode = "mock"
        self.max_attempts = 3
        self.n_bon_sgllm = 2
        self.max_added_objects = 2

    def _get_max_attempts(self) -> int:
        raw_value = os.getenv("RESPACE_MAX_ATTEMPTS", str(self.max_attempts)).strip()
        try:
            parsed = int(raw_value)
        except ValueError:
            return self.max_attempts
        return max(1, parsed)

    def _get_n_bon_sgllm(self) -> int:
        raw_value = os.getenv("RESPACE_N_BON_SGLLM", str(self.n_bon_sgllm)).strip()
        try:
            parsed = int(raw_value)
        except ValueError:
            return self.n_bon_sgllm
        return max(1, parsed)

    def _get_max_added_objects(self) -> int:
        raw_value = os.getenv(
            "RESPACE_MAX_ADDED_OBJECTS", str(self.max_added_objects)
        ).strip()
        try:
            parsed = int(raw_value)
        except ValueError:
            return self.max_added_objects
        return max(1, parsed)

    def _build_prompt_with_limits(self, prompt: str) -> str:
        max_objects = self._get_max_added_objects()
        return f"{prompt.strip()} Keep it minimal and add at most {max_objects} furniture items total."

    def _get_asset_resample_attempts(self) -> int:
        raw_value = os.getenv("RESPACE_ASSET_RESAMPLE_ATTEMPTS", "3").strip()
        try:
            parsed = int(raw_value)
        except ValueError:
            return 3
        return max(0, parsed)

    def _extract_asset_jid(self, obj: Any) -> str | None:
        if not isinstance(obj, dict):
            return None

        candidates = [
            obj.get("sampled_asset_jid"),
            obj.get("jid"),
            obj.get("asset_jid"),
            obj.get("model_id"),
        ]

        for value in candidates:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _asset_mesh_exists(self, jid: str) -> bool:
        assets_root = os.getenv("PTH_3DFUTURE_ASSETS", "").strip()
        if not assets_root:
            return False

        candidate = Path(assets_root) / jid / "raw_model.glb"
        return candidate.exists()

    def _collect_missing_asset_jids(self, scene: Any) -> list[str]:
        if not isinstance(scene, dict):
            return []

        objects = scene.get("objects", [])
        if not isinstance(objects, list):
            return []

        missing: list[str] = []
        for obj in objects:
            jid = self._extract_asset_jid(obj)
            if not jid:
                continue
            if not self._asset_mesh_exists(jid):
                missing.append(jid)

        return sorted(set(missing))

    def _filter_objects_with_missing_assets(
        self, scene: Any
    ) -> tuple[Any, int, list[str]]:
        if not isinstance(scene, dict):
            return scene, 0, []

        objects = scene.get("objects", [])
        if not isinstance(objects, list):
            return scene, 0, []

        kept: list[Any] = []
        removed_jids: list[str] = []
        removed_count = 0

        for obj in objects:
            jid = self._extract_asset_jid(obj)
            if jid and not self._asset_mesh_exists(jid):
                removed_count += 1
                removed_jids.append(jid)
            kept.append(obj)

        scene_with_all_objects = dict(scene)
        scene_with_all_objects["objects"] = kept
        return scene_with_all_objects, removed_count, sorted(set(removed_jids))

    def _to_points(self, value: Any) -> list[tuple[float, float]]:
        if not isinstance(value, list):
            return []

        points: list[tuple[float, float]] = []
        for item in value:
            if isinstance(item, list) and len(item) >= 2:
                try:
                    x = float(item[0])
                    y = float(item[1])
                    points.append((x, y))
                except (TypeError, ValueError):
                    continue
            elif isinstance(item, dict) and "x" in item and "y" in item:
                try:
                    points.append((float(item["x"]), float(item["y"])))
                except (TypeError, ValueError):
                    continue
        return points

    def _polygon_area(self, points: list[tuple[float, float]]) -> float:
        if len(points) < 3:
            return 0.0
        area = 0.0
        for index in range(len(points)):
            x1, y1 = points[index]
            x2, y2 = points[(index + 1) % len(points)]
            area += (x1 * y2) - (x2 * y1)
        return abs(area) / 2.0

    def _convex_hull(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        unique_points = sorted(set(points))
        if len(unique_points) < 3:
            return []

        def cross(
            origin: tuple[float, float],
            point_a: tuple[float, float],
            point_b: tuple[float, float],
        ) -> float:
            return ((point_a[0] - origin[0]) * (point_b[1] - origin[1])) - (
                (point_a[1] - origin[1]) * (point_b[0] - origin[0])
            )

        lower: list[tuple[float, float]] = []
        for point in unique_points:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
                lower.pop()
            lower.append(point)

        upper: list[tuple[float, float]] = []
        for point in reversed(unique_points):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
                upper.pop()
            upper.append(point)

        hull = lower[:-1] + upper[:-1]
        return hull if len(hull) >= 3 else []

    def _sanitize_polygon(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        if len(points) < 3:
            return []

        deduped: list[tuple[float, float]] = []
        for point in points:
            if not deduped or deduped[-1] != point:
                deduped.append(point)

        if len(deduped) >= 2 and deduped[0] == deduped[-1]:
            deduped.pop()

        if len(deduped) < 3:
            return []

        if self._polygon_area(deduped) > 0:
            return deduped

        return self._convex_hull(deduped)

    def _extract_room_polygon(
        self, geometry: dict[str, Any]
    ) -> list[tuple[float, float]]:
        rooms = geometry.get("rooms", [])
        if not isinstance(rooms, list):
            return []

        best: list[tuple[float, float]] = []
        best_area = 0.0
        all_points: list[tuple[float, float]] = []
        for room in rooms:
            points = self._to_points(room)
            all_points.extend(points)

            sanitized = self._sanitize_polygon(points)
            area = self._polygon_area(sanitized)
            if area > best_area:
                best = sanitized
                best_area = area

        if len(best) >= 3:
            return best

        return self._convex_hull(all_points)

    def _geometry_to_ssr_scene(self, geometry: dict[str, Any]) -> dict[str, Any]:
        polygon = self._extract_room_polygon(geometry)

        if len(polygon) < 3:
            polygon = [(0.0, 0.0), (5.0, 0.0), (5.0, 4.0), (0.0, 4.0)]

        unit_scale = 0.01
        bounds_top = [[x * unit_scale, 0.0, y * unit_scale] for x, y in polygon]
        bounds_bottom = [[x * unit_scale, -3.0, y * unit_scale] for x, y in polygon]

        return {
            "room_type": "bedroom",
            "bounds_top": bounds_top,
            "bounds_bottom": bounds_bottom,
            "objects": [],
        }

    def _load_real_respace(self) -> None:
        if self._respace is not None:
            return

        enable_real = os.getenv("ENABLE_REAL_RESPACE", "false").lower() == "true"
        if not enable_real:
            self.mode = "mock"
            return

        repo_path = os.getenv("RESPACE_REPO_PATH", "").strip()
        if not repo_path:
            raise RuntimeError(
                "ENABLE_REAL_RESPACE=true but RESPACE_REPO_PATH is not set"
            )

        repo = Path(repo_path)
        if not repo.exists():
            raise RuntimeError(f"RESPACE_REPO_PATH does not exist: {repo}")

        src_dir = repo / "src"
        if not src_dir.exists():
            raise RuntimeError(
                f"Could not find src directory in ReSpace repo: {src_dir}"
            )

        sys.path.insert(0, str(repo))

        from src.respace import ReSpace  # type: ignore

        try:
            import torch

            use_gpu = torch.cuda.is_available()
        except Exception:
            use_gpu = False

        model_id = os.getenv("RESPACE_MODEL_ID", "").strip() or None
        respace_env_file = str(repo / ".env")
        n_bon_sgllm = self._get_n_bon_sgllm()
        if model_id:
            self._respace = ReSpace(
                model_id=model_id,
                use_gpu=use_gpu,
                env_file=respace_env_file,
                n_bon_sgllm=n_bon_sgllm,
            )
        else:
            self._respace = ReSpace(
                use_gpu=use_gpu,
                env_file=respace_env_file,
                n_bon_sgllm=n_bon_sgllm,
            )

        max_attempts = self._get_max_attempts()
        if hasattr(self._respace, "max_n_attempts"):
            self._respace.max_n_attempts = max_attempts

        self.mode = "real"

    def run(self, geometry: dict[str, Any], prompt: str) -> dict[str, Any]:
        self._load_real_respace()

        scene = self._geometry_to_ssr_scene(geometry)
        start_time = time.perf_counter()

        if self._respace is None:
            return {
                "ok": True,
                "mode": self.mode,
                "message": "Mock mode active. Set ENABLE_REAL_RESPACE=true to call actual ReSpace.",
                "isSuccess": None,
                "scene": scene,
                "debug": {
                    "prompt": prompt,
                    "objects_count": len(scene.get("objects", [])),
                    "elapsedSeconds": round(time.perf_counter() - start_time, 3),
                },
            }

        limited_prompt = self._build_prompt_with_limits(prompt)
        updated_scene, is_success = self._respace.handle_prompt(limited_prompt, scene)

        missing_asset_jids = self._collect_missing_asset_jids(updated_scene)
        resampled_due_to_missing_assets = False
        asset_resample_attempts_used = 0

        max_asset_resample_attempts = self._get_asset_resample_attempts()
        if is_success and hasattr(self._respace, "resample_all_assets"):
            while (
                missing_asset_jids
                and asset_resample_attempts_used < max_asset_resample_attempts
            ):
                try:
                    updated_scene = self._respace.resample_all_assets(
                        updated_scene,
                        is_greedy_sampling=False,
                    )
                    resampled_due_to_missing_assets = True
                    asset_resample_attempts_used += 1
                    missing_asset_jids = self._collect_missing_asset_jids(updated_scene)
                except Exception:
                    break

        updated_scene, removed_objects_count, removed_object_jids = (
            self._filter_objects_with_missing_assets(updated_scene)
        )
        objects_count = (
            len(updated_scene.get("objects", []))
            if isinstance(updated_scene, dict)
            else 0
        )

        enable_render = os.getenv("RESPACE_ENABLE_RENDER", "false").lower() == "true"
        render_output = os.getenv("RESPACE_RENDER_OUTPUT", "./outputs")

        if enable_render and is_success:
            out_dir = Path(render_output)
            out_dir.mkdir(parents=True, exist_ok=True)
            try:
                self._respace.render_scene_frame(
                    updated_scene,
                    filename="respace-output",
                    pth_viz_output=out_dir,
                )
            except Exception as render_error:  # noqa: BLE001
                return {
                    "ok": True,
                    "mode": self.mode,
                    "message": f"ReSpace ran but rendering failed: {render_error}",
                    "isSuccess": bool(is_success),
                    "scene": updated_scene,
                    "debug": {
                        "elapsedSeconds": round(time.perf_counter() - start_time, 3),
                        "maxAttempts": getattr(self._respace, "max_n_attempts", None),
                    },
                }

        return {
            "ok": True,
            "mode": self.mode,
            "message": (
                "ReSpace method called successfully."
                if removed_objects_count == 0
                else (
                    f"ReSpace generated {objects_count} object"
                    f"{'s' if objects_count != 1 else ''}, but {removed_objects_count} object"
                    f"{'s' if removed_objects_count != 1 else ''} reference missing GLB assets."
                    " Falling back to placeholder rendering for those objects."
                )
            ),
            "isSuccess": bool(is_success) and objects_count > 0,
            "scene": updated_scene,
            "debug": {
                "elapsedSeconds": round(time.perf_counter() - start_time, 3),
                "maxAttempts": getattr(self._respace, "max_n_attempts", None),
                "objectsCount": objects_count,
                "missingAssetJidsCount": len(missing_asset_jids),
                "missingAssetJidsSample": missing_asset_jids[:10],
                "resampledDueToMissingAssets": resampled_due_to_missing_assets,
                "assetResampleAttemptsUsed": asset_resample_attempts_used,
                "removedMissingAssetObjectsCount": removed_objects_count,
                "removedMissingAssetJidsSample": removed_object_jids[:10],
            },
        }


runner = RespaceRunner()
