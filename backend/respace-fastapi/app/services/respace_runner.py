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
        self.min_added_objects = 1
        self.max_added_objects = 8

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

    def _get_min_added_objects(self) -> int:
        raw_value = os.getenv(
            "RESPACE_MIN_ADDED_OBJECTS", str(self.min_added_objects)
        ).strip()
        try:
            parsed = int(raw_value)
        except ValueError:
            return self.min_added_objects
        return max(1, parsed)

    def _build_prompt_with_limits(self, prompt: str) -> str:
        min_objects = self._get_min_added_objects()
        max_objects = self._get_max_added_objects()
        min_objects = min(min_objects, max_objects)
        layout_constraints = (
            "Place objects with comfortable spacing and never overlap footprints. "
            "Preserve circulation and door clearances. "
            "Maintain approximately 0.35m minimum spacing between typical items and "
            "around 0.6m between large furniture pieces. "
            "Orient seating and tables toward functional focal points while keeping "
            "wall-anchored furniture aligned with nearby walls."
        )
        return (
            f"{prompt.strip()} "
            f"Add between {min_objects} and {max_objects} furniture items total. "
            f"{layout_constraints}"
        )

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

    def _polygon_signed_area(self, points: list[tuple[float, float]]) -> float:
        if len(points) < 3:
            return 0.0

        area = 0.0
        for index in range(len(points)):
            x1, y1 = points[index]
            x2, y2 = points[(index + 1) % len(points)]
            area += (x1 * y2) - (x2 * y1)
        return area / 2.0

    def _orientation(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        c: tuple[float, float],
    ) -> int:
        value = ((b[1] - a[1]) * (c[0] - b[0])) - ((b[0] - a[0]) * (c[1] - b[1]))
        eps = 1e-9
        if abs(value) <= eps:
            return 0
        return 1 if value > 0 else 2

    def _on_segment(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        c: tuple[float, float],
    ) -> bool:
        eps = 1e-9
        return (
            min(a[0], c[0]) - eps <= b[0] <= max(a[0], c[0]) + eps
            and min(a[1], c[1]) - eps <= b[1] <= max(a[1], c[1]) + eps
        )

    def _segments_intersect(
        self,
        p1: tuple[float, float],
        p2: tuple[float, float],
        q1: tuple[float, float],
        q2: tuple[float, float],
    ) -> bool:
        o1 = self._orientation(p1, p2, q1)
        o2 = self._orientation(p1, p2, q2)
        o3 = self._orientation(q1, q2, p1)
        o4 = self._orientation(q1, q2, p2)

        if o1 != o2 and o3 != o4:
            return True

        if o1 == 0 and self._on_segment(p1, q1, p2):
            return True
        if o2 == 0 and self._on_segment(p1, q2, p2):
            return True
        if o3 == 0 and self._on_segment(q1, p1, q2):
            return True
        if o4 == 0 and self._on_segment(q1, p2, q2):
            return True

        return False

    def _is_simple_polygon(self, points: list[tuple[float, float]]) -> bool:
        n = len(points)
        if n < 3:
            return False

        for i in range(n):
            a1 = points[i]
            a2 = points[(i + 1) % n]

            for j in range(i + 1, n):
                # Adjacent edges share a vertex and are expected to touch.
                if j == i or j == (i + 1) % n or (i == 0 and j == n - 1):
                    continue

                b1 = points[j]
                b2 = points[(j + 1) % n]

                if self._segments_intersect(a1, a2, b1, b2):
                    return False

        return True

    def _remove_collinear_points(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        if len(points) < 3:
            return points

        cleaned: list[tuple[float, float]] = []
        n = len(points)
        eps = 1e-9

        for index in range(n):
            prev = points[(index - 1) % n]
            current = points[index]
            nxt = points[(index + 1) % n]

            cross = ((current[0] - prev[0]) * (nxt[1] - current[1])) - (
                (current[1] - prev[1]) * (nxt[0] - current[0])
            )

            if abs(cross) <= eps:
                continue

            cleaned.append(current)

        return cleaned

    def _round_points(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        return [(round(x, 4), round(y, 4)) for x, y in points]

    def _normalize_polygon_order(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        if self._polygon_signed_area(points) < 0:
            return list(reversed(points))
        return points

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

        rounded = self._round_points(points)

        deduped: list[tuple[float, float]] = []
        for point in rounded:
            if not deduped or deduped[-1] != point:
                deduped.append(point)

        if len(deduped) >= 2 and deduped[0] == deduped[-1]:
            deduped.pop()

        if len(deduped) < 3:
            return []

        deduped = self._remove_collinear_points(deduped)
        if len(deduped) < 3:
            return []

        if self._polygon_area(deduped) <= 1e-8:
            return []

        if not self._is_simple_polygon(deduped):
            return self._convex_hull(deduped)

        return self._normalize_polygon_order(deduped)

    def _build_valid_polygon(
        self, points: list[tuple[float, float]]
    ) -> list[tuple[float, float]]:
        sanitized = self._sanitize_polygon(points)
        if len(sanitized) >= 3 and self._polygon_area(sanitized) > 1e-8:
            return sanitized

        hull = self._convex_hull(points)
        if len(hull) >= 3 and self._polygon_area(hull) > 1e-8:
            return self._normalize_polygon_order(hull)

        return []

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

            sanitized = self._build_valid_polygon(points)
            area = self._polygon_area(sanitized)
            if area > best_area:
                best = sanitized
                best_area = area

        if len(best) >= 3:
            return best

        return self._build_valid_polygon(all_points)

    def _geometry_to_ssr_scene(
        self,
        geometry: dict[str, Any],
        unit_scale: float = 0.01,
        wall_height: float = 3.0,
        room_name: str = "",
    ) -> dict[str, Any]:
        polygon = self._extract_room_polygon(geometry)

        if len(polygon) < 3:
            polygon = [(0.0, 0.0), (5.0, 0.0), (5.0, 4.0), (0.0, 4.0)]

        bounds_top = [[x * unit_scale, 0.0, y * unit_scale] for x, y in polygon]
        bounds_bottom = [
            [x * unit_scale, -wall_height, y * unit_scale] for x, y in polygon
        ]

        # Map room name to a recognised SSR room_type; fall back to "bedroom".
        name_lower = room_name.strip().lower()
        if any(k in name_lower for k in ("living", "lounge", "sitting")):
            room_type = "living_room"
        elif any(k in name_lower for k in ("kitchen",)):
            room_type = "kitchen"
        elif any(k in name_lower for k in ("dining",)):
            room_type = "dining_room"
        elif any(k in name_lower for k in ("office", "study", "work")):
            room_type = "office"
        elif any(k in name_lower for k in ("bath", "toilet", "wc")):
            room_type = "bathroom"
        elif any(k in name_lower for k in ("bed", "master", "guest")):
            room_type = "bedroom"
        else:
            room_type = "bedroom"

        return {
            "room_type": room_type,
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

    def run(
        self,
        geometry: dict[str, Any],
        prompt: str,
        unit_scale: float = 0.01,
        wall_height: float = 3.0,
        room_name: str = "",
    ) -> dict[str, Any]:
        self._load_real_respace()

        scene = self._geometry_to_ssr_scene(
            geometry,
            unit_scale=unit_scale,
            wall_height=wall_height,
            room_name=room_name,
        )
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
