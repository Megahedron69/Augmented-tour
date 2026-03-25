import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import {
  Box3,
  CanvasTexture,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const ROOM_OVERLAY_COLORS = [
  "#6573d6",
  "#35b6b3",
  "#74bb57",
  "#e59f55",
  "#da739e",
  "#868fcd",
  "#69b1ad",
  "#dfba42",
];

interface ParsedPlanData {
  doors: unknown[];
  walls: unknown[];
  rooms: unknown[];
}

export interface RespaceObjectOverride {
  dx: number;
  dz: number;
  dRotY: number;
  scaleFactor: number;
}

interface FloorPlan3DPreviewProps {
  data: ParsedPlanData | null;
  wallHeight: number;
  wallThickness: number;
  unitScale: number;
  roomNames?: string[];
  runningRoomIndices?: number[];
  respaceObjects?: unknown[];
  onRoomClick?: (roomIndex: number) => void;
  manualObjects?: ManualPlacedObject[];
  pendingAsset?: ManualAssetCatalogItem | null;
  onPlaceManualObject?: (placement: ManualPlacementRequest) => void;
  selectedManualObjectId?: string | null;
  onSelectManualObject?: (objectId: string | null) => void;
  selectedRespaceObjectKey?: string | null;
  respaceObjectOverrides?: Record<string, RespaceObjectOverride>;
  onSelectRespaceObject?: (key: string | null) => void;
}

type Point2D = { x: number; y: number };

type WallBox = {
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
  rotationY: number;
};

type DoorBox = {
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
  rotationY: number;
};

type Segment = { from: Point2D; to: Point2D };

type RoomEdge = {
  roomIndex: number;
  from: Point2D;
  to: Point2D;
  length: number;
};

type Vec3 = [number, number, number];

type WorldPoint = { x: number; z: number };

type RoomBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type DoorZone = {
  x: number;
  z: number;
  radius: number;
};

interface ResolvedRenderablePlacement {
  item: RenderableObject;
  position: Vec3;
  size: Vec3;
  rotationY: number;
}

interface RenderableObject {
  key: string;
  position: Vec3;
  size: Vec3;
  rotationY: number;
  label: string;
  roomIndex: number | null;
  textureUrl?: string;
  modelUrl?: string;
}

export interface ManualAssetCatalogItem {
  id: string;
  title: string;
  modelUrl: string;
  thumbnailUrl?: string | null;
  textureUrl?: string | null;
}

export interface ManualPlacedObject {
  objectId: string;
  assetId: string;
  label: string;
  modelUrl: string;
  textureUrl?: string;
  x: number;
  z: number;
  yBase?: number;
  rotationY: number;
  baseSize: Vec3;
  roomIndex: number | null;
  roomScaleFactor?: number;
  scaleFactor: number;
}

export interface ManualPlacementRequest {
  asset: ManualAssetCatalogItem;
  x: number;
  z: number;
  roomIndex: number | null;
  scaleFactor: number;
}

const ROOM_SPACING_FACTOR = 1.12;
const FLOOR_PLANK_WORLD_SIZE = 2.5;
const OBJECT_BASE_CLEARANCE = 0.14;
const OBJECT_COMFORT_BUFFER = 0.28;
const LARGE_OBJECT_SIZE_THRESHOLD = 1.2;
const WALL_ANCHORED_LABEL_REGEX =
  /(bed|sofa|couch|wardrobe|cabinet|desk|bookshelf|dresser|nightstand|tv|console)/i;
const CENTER_FACING_LABEL_REGEX =
  /(chair|sofa|couch|desk|table|bed|bench|stool)/i;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const tryVec3 = (value: unknown): Vec3 | null => {
  if (Array.isArray(value) && value.length >= 3) {
    const x = toFiniteNumber(value[0], Number.NaN);
    const y = toFiniteNumber(value[1], Number.NaN);
    const z = toFiniteNumber(value[2], Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return [x, y, z];
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const x = toFiniteNumber(record.x, Number.NaN);
    const y = toFiniteNumber(record.y, Number.NaN);
    const z = toFiniteNumber(record.z, Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return [x, y, z];
    }
  }

  return null;
};

const tryBBoxCenterAndSize = (
  value: unknown,
): { center: Vec3; size: Vec3 } | null => {
  if (!Array.isArray(value) || value.length < 6) {
    return null;
  }

  const x1 = toFiniteNumber(value[0], Number.NaN);
  const y1 = toFiniteNumber(value[1], Number.NaN);
  const z1 = toFiniteNumber(value[2], Number.NaN);
  const x2 = toFiniteNumber(value[3], Number.NaN);
  const y2 = toFiniteNumber(value[4], Number.NaN);
  const z2 = toFiniteNumber(value[5], Number.NaN);

  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(z1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(z2)
  ) {
    return null;
  }

  return {
    center: [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2],
    size: [Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1)],
  };
};

const normalizeVectorUnits = (vector: Vec3): Vec3 => {
  const maxAbs = Math.max(
    Math.abs(vector[0]),
    Math.abs(vector[1]),
    Math.abs(vector[2]),
  );

  if (maxAbs > 50) {
    return [vector[0] * 0.01, vector[1] * 0.01, vector[2] * 0.01];
  }

  return vector;
};

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const clampToBounds = (
  point: WorldPoint,
  bounds: RoomBounds | null,
  size: Vec3,
): WorldPoint => {
  if (!bounds) {
    return point;
  }

  return {
    x: clampNumber(
      point.x,
      bounds.minX + size[0] / 2 + 0.06,
      bounds.maxX - size[0] / 2 - 0.06,
    ),
    z: clampNumber(
      point.z,
      bounds.minZ + size[2] / 2 + 0.06,
      bounds.maxZ - size[2] / 2 - 0.06,
    ),
  };
};

const getStableUnitVector = (seed: string): WorldPoint => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const angle = ((hash % 360) * Math.PI) / 180;
  return {
    x: Math.cos(angle),
    z: Math.sin(angle),
  };
};

const projectPointToSegment = (
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint,
): { point: WorldPoint; t: number; distance: number } => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const denom = dx * dx + dz * dz;

  if (denom <= 1e-8) {
    const distance = Math.hypot(point.x - start.x, point.z - start.z);
    return { point: { x: start.x, z: start.z }, t: 0, distance };
  }

  const tUnclamped =
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / denom;
  const t = clampNumber(tUnclamped, 0, 1);
  const projected = {
    x: start.x + dx * t,
    z: start.z + dz * t,
  };

  return {
    point: projected,
    t,
    distance: Math.hypot(point.x - projected.x, point.z - projected.z),
  };
};

const toSharedEdgeKey = (from: Point2D, to: Point2D): string => {
  const round = (value: number) => Number(value.toFixed(1));
  const ax = round(from.x);
  const ay = round(from.y);
  const bx = round(to.x);
  const by = round(to.y);

  const keyAB = `${ax},${ay}|${bx},${by}`;
  const keyBA = `${bx},${by}|${ax},${ay}`;

  return keyAB < keyBA ? keyAB : keyBA;
};

const getRoomIndexForPoint = (point: Point2D, rooms: Point2D[][]): number => {
  for (let index = 0; index < rooms.length; index += 1) {
    if (isPointInPolygon(point, rooms[index])) {
      return index;
    }
  }

  return -1;
};

const isPointInPolygon = (point: Point2D, polygon: Point2D[]): boolean => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const extractVec3 = (
  objectValue: unknown,
  candidates: string[],
): Vec3 | null => {
  if (!objectValue || typeof objectValue !== "object") {
    return null;
  }

  const record = objectValue as Record<string, unknown>;
  for (const key of candidates) {
    const result = tryVec3(record[key]);
    if (result) {
      return result;
    }
  }

  return null;
};

const getRenderableObject = (objectValue: unknown): RenderableObject | null => {
  const directPosition = extractVec3(objectValue, [
    "position",
    "pos",
    "translation",
    "location",
    "center",
    "centroid",
  ]);

  const record =
    objectValue && typeof objectValue === "object"
      ? (objectValue as Record<string, unknown>)
      : {};

  const bboxDerived = tryBBoxCenterAndSize(record.bbox);
  const resolvedPosition = directPosition ?? bboxDerived?.center ?? null;
  if (!resolvedPosition) {
    return null;
  }

  const sizeFromVec =
    extractVec3(objectValue, [
      "size",
      "dimensions",
      "extent",
      "bbox_size",
      "sampled_asset_size",
    ]) ?? null;

  const resolvedSize = sizeFromVec ?? bboxDerived?.size ?? [0.9, 0.9, 0.9];

  const rotationSource = record.rotation ?? record.rot;
  let rotationY = 0;
  if (Array.isArray(rotationSource) && rotationSource.length >= 3) {
    if (rotationSource.length >= 4) {
      const qy = toFiniteNumber(rotationSource[1], 0);
      const qw = toFiniteNumber(rotationSource[3], 1);
      rotationY = 2 * Math.atan2(qy, qw);
    } else {
      rotationY = toFiniteNumber(rotationSource[1], 0);
    }
  } else if (rotationSource && typeof rotationSource === "object") {
    const yaw = (rotationSource as Record<string, unknown>).y;
    rotationY = toFiniteNumber(yaw, 0);
  } else {
    rotationY = toFiniteNumber(record.yaw, 0);
  }

  if (Math.abs(rotationY) > Math.PI * 2) {
    rotationY = (rotationY * Math.PI) / 180;
  }

  const normalizedPosition = normalizeVectorUnits(resolvedPosition);
  const normalizedSize = normalizeVectorUnits(resolvedSize);

  const rawLabel =
    (typeof record.label === "string" && record.label) ||
    (typeof record.name === "string" && record.name) ||
    (typeof record.object_name === "string" && record.object_name) ||
    (typeof record.category === "string" && record.category) ||
    "object";

  const textureUrl =
    (typeof record.asset_texture_url === "string" &&
      record.asset_texture_url) ||
    (typeof record.assetTextureUrl === "string" && record.assetTextureUrl) ||
    undefined;

  const modelUrl =
    (typeof record.asset_glb_url === "string" && record.asset_glb_url) ||
    (typeof record.assetGlbUrl === "string" && record.assetGlbUrl) ||
    undefined;

  const objectId = record.id ?? record.object_id;
  const stableFallbackKey = `${rawLabel}-${normalizedPosition
    .map((value) => value.toFixed(3))
    .join("-")}-${normalizedSize.map((value) => value.toFixed(3)).join("-")}`;

  const roomIndexRaw =
    record.__fp3dRoomIndex ?? record.roomIndex ?? record.room_index ?? null;
  const parsedRoomIndex = toFiniteNumber(roomIndexRaw, Number.NaN);
  const roomIndex = Number.isInteger(parsedRoomIndex) ? parsedRoomIndex : null;

  return {
    key:
      objectId !== undefined && objectId !== null
        ? String(objectId)
        : stableFallbackKey,
    label: rawLabel,
    position: normalizedPosition,
    size: [
      Math.max(0.35, Math.min(4, Math.abs(normalizedSize[0]))),
      Math.max(0.35, Math.min(4, Math.abs(normalizedSize[1]))),
      Math.max(0.35, Math.min(4, Math.abs(normalizedSize[2]))),
    ],
    rotationY,
    roomIndex,
    textureUrl,
    modelUrl,
  };
};

const ModelObject = ({
  meshKey,
  modelUrl,
  position,
  targetSize,
  rotationY,
  centerOnXZ = true,
}: {
  meshKey: string;
  modelUrl: string;
  position: Vec3;
  targetSize: Vec3;
  rotationY: number;
  centerOnXZ?: boolean;
}) => {
  const gltf = useGLTF(modelUrl);

  const sceneClone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const modelBounds = useMemo(() => {
    const measurementClone = gltf.scene.clone(true);
    const box = new Box3().setFromObject(measurementClone);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    return {
      size,
      center,
      minY: box.min.y,
    };
  }, [gltf.scene]);

  const fit = useMemo(() => {
    const baseX = Math.max(modelBounds.size.x, 0.01);
    const baseY = Math.max(modelBounds.size.y, 0.01);
    const baseZ = Math.max(modelBounds.size.z, 0.01);

    const fitScale = Math.min(
      targetSize[0] / baseX,
      targetSize[1] / baseY,
      targetSize[2] / baseZ,
    );

    const uniformScale = Math.max(0.01, Math.min(fitScale, 4));

    return {
      uniformScale,
      offsetX: centerOnXZ ? -modelBounds.center.x : 0,
      offsetY: -modelBounds.minY,
      offsetZ: centerOnXZ ? -modelBounds.center.z : 0,
    };
  }, [centerOnXZ, modelBounds, targetSize]);

  return (
    <group
      key={meshKey}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={[fit.uniformScale, fit.uniformScale, fit.uniformScale]}
    >
      <primitive
        object={sceneClone}
        position={[fit.offsetX, fit.offsetY, fit.offsetZ]}
      />
    </group>
  );
};

const TexturedObjectBox = ({
  meshKey,
  position,
  size,
  rotationY,
  textureUrl,
}: {
  meshKey: string;
  position: Vec3;
  size: Vec3;
  rotationY: number;
  textureUrl: string;
}) => {
  const texture = useTexture(textureUrl);

  return (
    <mesh key={meshKey} position={position} rotation={[0, rotationY, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={texture} roughness={0.72} metalness={0.05} />
    </mesh>
  );
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toPoint = (value: unknown): Point2D | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const x = asNumber(value[0]);
    const y = asNumber(value[1]);
    if (x !== null && y !== null) {
      return { x, y };
    }
  }

  if (value && typeof value === "object") {
    const candidate = value as { x?: unknown; y?: unknown };
    const x = asNumber(candidate.x);
    const y = asNumber(candidate.y);
    if (x !== null && y !== null) {
      return { x, y };
    }
  }

  return null;
};

const toBBox = (value: unknown): [number, number, number, number] | null => {
  if (Array.isArray(value) && value.length === 4) {
    const nums = value.map(asNumber);
    if (nums.every((n) => n !== null)) {
      return nums as [number, number, number, number];
    }
  }

  if (value && typeof value === "object") {
    const candidate = value as { bbox?: unknown };
    if (candidate.bbox) {
      return toBBox(candidate.bbox);
    }
  }

  return null;
};

const toPolygon = (value: unknown): Point2D[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const points = value
    .map(toPoint)
    .filter((point): point is Point2D => !!point);
  if (points.length < 3) {
    return [];
  }

  const cleaned: Point2D[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      cleaned.push(point);
    }
  }

  if (cleaned.length >= 3) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first.x === last.x && first.y === last.y) {
      cleaned.pop();
    }
  }

  return cleaned.length >= 3 ? cleaned : [];
};

const toPath = (value: unknown): Point2D[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const points = value
    .map(toPoint)
    .filter((point): point is Point2D => !!point);
  if (points.length >= 2) {
    return points;
  }

  return [];
};

const segmentToBox = (
  from: Point2D,
  to: Point2D,
  thickness: number,
): WallBox | null => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length <= 0.0001) {
    return null;
  }

  return {
    centerX: (from.x + to.x) / 2,
    centerY: (from.y + to.y) / 2,
    width: length,
    depth: thickness,
    rotationY: Math.atan2(dy, dx),
  };
};

const normalizeGeometry = (
  data: ParsedPlanData,
  wallThickness: number,
): { walls: WallBox[]; doors: DoorBox[]; rooms: Point2D[][] } => {
  const wallSegments: Segment[] = [];
  const roomEdges: RoomEdge[] = [];
  const doors: DoorBox[] = [];
  const rooms: Point2D[][] = [];

  const addSegment = (from: Point2D, to: Point2D) => {
    if (from.x === to.x && from.y === to.y) {
      return;
    }
    wallSegments.push({ from, to });
  };

  for (const wall of data.walls ?? []) {
    const bbox = toBBox(wall);
    if (bbox) {
      const [x1, y1, x2, y2] = bbox;
      addSegment({ x: x1, y: y1 }, { x: x2, y: y2 });
      continue;
    }

    const path = toPath(wall);
    if (path.length >= 2) {
      for (let index = 0; index < path.length - 1; index += 1) {
        addSegment(path[index], path[index + 1]);
      }
    }
  }

  for (const [roomIndex, room] of (data.rooms ?? []).entries()) {
    const polygon = toPolygon(room);
    if (polygon.length >= 3) {
      rooms.push(polygon);

      for (let index = 0; index < polygon.length; index += 1) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        addSegment(from, to);

        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length > 0.0001) {
          roomEdges.push({
            roomIndex,
            from,
            to,
            length,
          });
        }
      }
    }
  }

  const dedupedSegmentMap = new Map<string, Segment>();
  const roundPoint = (point: Point2D) => ({
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  });

  for (const segment of wallSegments) {
    const a = roundPoint(segment.from);
    const b = roundPoint(segment.to);

    const keyAB = `${a.x},${a.y}|${b.x},${b.y}`;
    const keyBA = `${b.x},${b.y}|${a.x},${a.y}`;
    const key = keyAB < keyBA ? keyAB : keyBA;

    if (!dedupedSegmentMap.has(key)) {
      dedupedSegmentMap.set(key, segment);
    }
  }

  const walls: WallBox[] = [];
  const dedupedSegments = Array.from(dedupedSegmentMap.values());

  for (const segment of dedupedSegments) {
    const box = segmentToBox(segment.from, segment.to, wallThickness);
    if (box) {
      walls.push(box);
    }
  }

  const bestDoorByRoomPair = new Map<string, DoorBox & { overlap: number }>();
  const doorDepth = clampNumber(
    wallThickness * 0.96,
    wallThickness * 0.85,
    wallThickness,
  );

  const sharedEdgeBuckets = new Map<string, RoomEdge[]>();
  for (const edge of roomEdges) {
    const key = toSharedEdgeKey(edge.from, edge.to);
    const bucket = sharedEdgeBuckets.get(key);
    if (bucket) {
      bucket.push(edge);
    } else {
      sharedEdgeBuckets.set(key, [edge]);
    }
  }

  for (const edges of sharedEdgeBuckets.values()) {
    if (edges.length < 2) {
      continue;
    }

    for (let i = 0; i < edges.length; i += 1) {
      const first = edges[i];
      for (let j = i + 1; j < edges.length; j += 1) {
        const second = edges[j];
        if (first.roomIndex === second.roomIndex) {
          continue;
        }

        const dx = first.to.x - first.from.x;
        const dy = first.to.y - first.from.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0.0001) {
          continue;
        }

        const roomA = Math.min(first.roomIndex, second.roomIndex);
        const roomB = Math.max(first.roomIndex, second.roomIndex);
        const roomPairKey = `${roomA}|${roomB}`;

        const width = clampNumber(
          length * 0.4,
          Math.max(wallThickness * 1.2, 1.2),
          Math.max(wallThickness * 8, 2),
        );

        const candidate: DoorBox & { overlap: number } = {
          centerX: (first.from.x + first.to.x) / 2,
          centerY: (first.from.y + first.to.y) / 2,
          width,
          depth: doorDepth,
          rotationY: Math.atan2(dy, dx),
          overlap: length,
        };

        const existing = bestDoorByRoomPair.get(roomPairKey);
        if (!existing || candidate.overlap > existing.overlap) {
          bestDoorByRoomPair.set(roomPairKey, candidate);
        }
      }
    }
  }

  // Fallback: infer connected-room walls by checking points on both sides
  // of each wall segment. This catches inter-room boundaries that do not
  // appear as perfectly duplicated polygon edges.
  for (const segment of dedupedSegments) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0.0001) {
      continue;
    }

    const mid: Point2D = {
      x: (segment.from.x + segment.to.x) / 2,
      y: (segment.from.y + segment.to.y) / 2,
    };

    const nx = -dy / length;
    const ny = dx / length;
    const sampleOffset = Math.max(wallThickness * 0.9, 3);

    const a = getRoomIndexForPoint(
      {
        x: mid.x + nx * sampleOffset,
        y: mid.y + ny * sampleOffset,
      },
      rooms,
    );
    const b = getRoomIndexForPoint(
      {
        x: mid.x - nx * sampleOffset,
        y: mid.y - ny * sampleOffset,
      },
      rooms,
    );

    if (a < 0 || b < 0 || a === b) {
      continue;
    }

    const roomA = Math.min(a, b);
    const roomB = Math.max(a, b);
    const roomPairKey = `${roomA}|${roomB}`;

    const width = clampNumber(
      length * 0.34,
      Math.max(wallThickness * 1.2, 1.2),
      Math.max(wallThickness * 5.2, 2),
    );

    const candidate: DoorBox & { overlap: number } = {
      centerX: mid.x,
      centerY: mid.y,
      width,
      depth: doorDepth,
      rotationY: Math.atan2(dy, dx),
      overlap: length,
    };

    const existing = bestDoorByRoomPair.get(roomPairKey);
    if (!existing || candidate.overlap > existing.overlap) {
      bestDoorByRoomPair.set(roomPairKey, candidate);
    }
  }

  for (const candidate of bestDoorByRoomPair.values()) {
    doors.push({
      centerX: candidate.centerX,
      centerY: candidate.centerY,
      width: candidate.width,
      depth: candidate.depth,
      rotationY: candidate.rotationY,
    });
  }

  return { walls, doors, rooms };
};

const FloorPlan3DPreview = ({
  data,
  wallHeight,
  wallThickness,
  unitScale,
  roomNames = [],
  runningRoomIndices = [],
  respaceObjects = [],
  onRoomClick,
  manualObjects = [],
  pendingAsset = null,
  onPlaceManualObject,
  selectedManualObjectId = null,
  onSelectManualObject,
  selectedRespaceObjectKey = null,
  respaceObjectOverrides = {},
  onSelectRespaceObject,
}: FloorPlan3DPreviewProps) => {
  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [isTopView, setIsTopView] = useState(true);
  const [surfaceTextures, setSurfaceTextures] = useState<{
    floor: Texture;
    wallBase: Texture;
    wallNormal?: Texture;
    wallRoughness: Texture;
    door: Texture;
  } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    let disposed = false;
    const loader = new TextureLoader();

    const loadTexture = (url: string) =>
      new Promise<Texture>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

    const configureTexture = (
      texture: Texture,
      repeatX: number,
      repeatY: number,
      withSrgb = false,
    ) => {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (withSrgb) {
        texture.colorSpace = SRGBColorSpace;
      }
      texture.anisotropy = 16;
      texture.needsUpdate = true;
      return texture;
    };

    const createFloorCanvasTexture = (baseTexture: Texture): CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 2048;
      canvas.height = 2048;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return new CanvasTexture(canvas);
      }

      ctx.fillStyle = "#9e6e42";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const baseImage = baseTexture.image as
        | CanvasImageSource
        | undefined
        | null;
      if (baseImage) {
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = 512;
        tileCanvas.height = 512;
        const tileCtx = tileCanvas.getContext("2d");
        if (tileCtx) {
          tileCtx.drawImage(baseImage, 0, 0, 512, 512);
          const pattern = ctx.createPattern(tileCanvas, "repeat");
          if (pattern) {
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          }
        }
      }

      // Add plank seams and subtle tone shifts so floor detail remains visible from top view.
      const plankPx = 120;
      const rows = Math.ceil(canvas.height / plankPx);
      for (let row = 0; row < rows; row += 1) {
        const y = row * plankPx;
        const tone = 0.88 + (row % 5) * 0.03;
        ctx.fillStyle = `rgba(110, 70, 38, ${Math.min(0.22, tone * 0.18)})`;
        ctx.fillRect(0, y, canvas.width, plankPx);

        ctx.strokeStyle = "rgba(58, 34, 18, 0.34)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + plankPx - 1);
        ctx.lineTo(canvas.width, y + plankPx - 1);
        ctx.stroke();
      }

      for (let i = 0; i < 1800; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const len = 8 + Math.random() * 24;
        ctx.strokeStyle =
          Math.random() > 0.5
            ? "rgba(88, 56, 30, 0.13)"
            : "rgba(214, 176, 128, 0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + Math.random() * 2 - 1);
        ctx.stroke();
      }

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = 16;
      texture.needsUpdate = true;
      return texture;
    };

    (async () => {
      try {
        const [floorBase, wallBase, wallRoughness, door] = await Promise.all([
          loadTexture(
            "/textures/floor_textures4/laminate_floor_02_diff_4k.jpg",
          ),
          loadTexture("/textures/wall_texture2/concrete_wall_001_diff_4k.jpg"),
          loadTexture("/textures/wall_texture2/concrete_wall_001_rough_4k.jpg"),
          loadTexture(
            "/textures/door_textures/10057_wooden_door_v1_diffuse.jpg",
          ),
        ]);

        const floor = createFloorCanvasTexture(floorBase);
        floorBase.dispose();

        if (disposed) {
          floor.dispose();
          wallBase.dispose();
          wallRoughness.dispose();
          door.dispose();
          return;
        }

        setSurfaceTextures({
          floor: configureTexture(floor, 1, 1, true),
          wallBase: configureTexture(wallBase, 4, 2, true),
          wallRoughness: configureTexture(wallRoughness, 4, 2),
          door: configureTexture(door, 1, 1, true),
        });
      } catch (error) {
        console.error("[FloorPlan3DPreview] Failed to load textures", error);
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (hoveredRoomIndex === null) {
      document.body.style.cursor = "default";
      return;
    }

    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [hoveredRoomIndex]);

  const geometry = useMemo(() => {
    if (!data) {
      return {
        walls: [],
        doors: [],
        roomShapes: [] as Shape[],
        roomPolygons: [] as Point2D[][],
      };
    }

    const normalized = normalizeGeometry(data, wallThickness / unitScale);

    const roomShapes = normalized.rooms
      .map((polygon) => {
        const vectors = polygon.map((point) => new Vector2(point.x, -point.y));
        if (vectors.length < 3) {
          return null;
        }

        const shape = new Shape(vectors);
        return shape;
      })
      .filter((shape): shape is Shape => !!shape);

    return {
      walls: normalized.walls,
      doors: normalized.doors,
      roomShapes,
      roomPolygons: normalized.rooms,
    };
  }, [data, wallThickness, unitScale]);

  const allPoints = useMemo(() => {
    if (geometry.roomPolygons.length) {
      return geometry.roomPolygons.flatMap((polygon) => polygon);
    }

    const points: Point2D[] = [];

    geometry.walls.forEach((wall) => {
      points.push({ x: wall.centerX, y: wall.centerY });
    });

    geometry.doors.forEach((door) => {
      points.push({ x: door.centerX, y: door.centerY });
    });

    return points;
  }, [geometry]);

  const center = useMemo(() => {
    if (!allPoints.length) {
      return { x: 0, y: 0 };
    }

    const sum = allPoints.reduce(
      (acc, point) => {
        return { x: acc.x + point.x, y: acc.y + point.y };
      },
      { x: 0, y: 0 },
    );

    return {
      x: sum.x / allPoints.length,
      y: sum.y / allPoints.length,
    };
  }, [allPoints]);

  const renderableObjects = useMemo(
    () =>
      respaceObjects
        .map((objectValue) => getRenderableObject(objectValue))
        .filter((item): item is RenderableObject => !!item),
    [respaceObjects],
  );

  const roomBoundsWorld = useMemo(() => {
    if (!geometry.roomPolygons.length) {
      return null;
    }

    const points = geometry.roomPolygons.flatMap((polygon) => polygon);
    const xs = points.map(
      (point) => (point.x - center.x) * unitScale * ROOM_SPACING_FACTOR,
    );
    const zs = points.map(
      (point) => (point.y - center.y) * unitScale * ROOM_SPACING_FACTOR,
    );

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  }, [center.x, center.y, geometry.roomPolygons, unitScale]);

  const roomBoundsByIndex = useMemo(() => {
    return geometry.roomPolygons.map((polygon) => {
      const xs = polygon.map(
        (point) => (point.x - center.x) * unitScale * ROOM_SPACING_FACTOR,
      );
      const zs = polygon.map(
        (point) => (point.y - center.y) * unitScale * ROOM_SPACING_FACTOR,
      );

      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      };
    });
  }, [center.x, center.y, geometry.roomPolygons, unitScale]);

  const roomCentersByIndex = useMemo(() => {
    return roomBoundsByIndex.map((bounds) => ({
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    }));
  }, [roomBoundsByIndex]);

  const roomPolygonsWorld = useMemo(() => {
    return geometry.roomPolygons.map((polygon) =>
      polygon.map((point) => ({
        x: (point.x - center.x) * unitScale * ROOM_SPACING_FACTOR,
        z: (point.y - center.y) * unitScale * ROOM_SPACING_FACTOR,
      })),
    );
  }, [center.x, center.y, geometry.roomPolygons, unitScale]);

  const doorZones = useMemo(() => {
    return geometry.doors.map((door) => {
      const worldWidth = door.width * unitScale * ROOM_SPACING_FACTOR;
      const worldDepth = door.depth * unitScale * ROOM_SPACING_FACTOR;
      return {
        x: (door.centerX - center.x) * unitScale * ROOM_SPACING_FACTOR,
        z: (door.centerY - center.y) * unitScale * ROOM_SPACING_FACTOR,
        radius: Math.max(0.4, worldWidth * 0.52 + worldDepth * 1.4),
      } as DoorZone;
    });
  }, [center.x, center.y, geometry.doors, unitScale]);

  const resolvedRenderablePlacements = useMemo(() => {
    const placements: ResolvedRenderablePlacement[] = [];

    const isOverlappingPlaced = (
      candidate: WorldPoint,
      size: Vec3,
      roomIndex: number | null,
    ) => {
      for (const placed of placements) {
        const sameRoom =
          roomIndex === placed.item.roomIndex ||
          roomIndex === null ||
          placed.item.roomIndex === null;
        if (!sameRoom) {
          continue;
        }

        const dx = candidate.x - placed.position[0];
        const dz = candidate.z - placed.position[2];
        const minX =
          (size[0] + placed.size[0]) / 2 +
          OBJECT_BASE_CLEARANCE +
          (Math.max(size[0], placed.size[0]) >= LARGE_OBJECT_SIZE_THRESHOLD
            ? 0.06
            : 0);
        const minZ =
          (size[2] + placed.size[2]) / 2 +
          OBJECT_BASE_CLEARANCE +
          (Math.max(size[2], placed.size[2]) >= LARGE_OBJECT_SIZE_THRESHOLD
            ? 0.06
            : 0);

        if (Math.abs(dx) < minX && Math.abs(dz) < minZ) {
          return true;
        }

        const minCenterDistance =
          (Math.max(size[0], size[2]) +
            Math.max(placed.size[0], placed.size[2])) /
            2 +
          OBJECT_COMFORT_BUFFER;
        if (Math.hypot(dx, dz) < minCenterDistance) {
          return true;
        }
      }

      return false;
    };

    for (const item of renderableObjects) {
      let sizeX = item.size[0];
      let sizeY = item.size[1];
      let sizeZ = item.size[2];

      const initialRoomBounds =
        item.roomIndex !== null &&
        item.roomIndex >= 0 &&
        item.roomIndex < roomBoundsByIndex.length
          ? roomBoundsByIndex[item.roomIndex]
          : roomBoundsWorld;

      if (initialRoomBounds) {
        const roomWidth = initialRoomBounds.maxX - initialRoomBounds.minX;
        const roomDepth = initialRoomBounds.maxZ - initialRoomBounds.minZ;
        const maxObjWidth = Math.max(0.55, roomWidth * 0.45);
        const maxObjDepth = Math.max(0.55, roomDepth * 0.45);
        const fitScale = Math.min(
          1,
          maxObjWidth / Math.max(0.01, sizeX),
          maxObjDepth / Math.max(0.01, sizeZ),
        );

        sizeX *= fitScale;
        sizeY *= fitScale;
        sizeZ *= fitScale;
      }

      const fittedSize: Vec3 = [
        Math.max(0.25, sizeX),
        Math.max(0.25, sizeY),
        Math.max(0.25, sizeZ),
      ];

      const worldSpaceCandidate: WorldPoint = {
        x: (item.position[0] - center.x * unitScale) * ROOM_SPACING_FACTOR,
        z: (item.position[2] - center.y * unitScale) * ROOM_SPACING_FACTOR,
      };
      const planSpaceCandidate: WorldPoint = {
        x: (item.position[0] - center.x) * unitScale * ROOM_SPACING_FACTOR,
        z: (item.position[2] - center.y) * unitScale * ROOM_SPACING_FACTOR,
      };

      const roomBoundsForObject =
        item.roomIndex !== null &&
        item.roomIndex >= 0 &&
        item.roomIndex < roomBoundsByIndex.length
          ? roomBoundsByIndex[item.roomIndex]
          : roomBoundsWorld;

      const roomCenterForObject =
        item.roomIndex !== null &&
        item.roomIndex >= 0 &&
        item.roomIndex < roomCentersByIndex.length
          ? roomCentersByIndex[item.roomIndex]
          : roomBoundsForObject
            ? {
                x: (roomBoundsForObject.minX + roomBoundsForObject.maxX) / 2,
                z: (roomBoundsForObject.minZ + roomBoundsForObject.maxZ) / 2,
              }
            : null;

      const scoreCandidate = (candidate: WorldPoint) => {
        if (!roomBoundsForObject) {
          return 0;
        }

        const centerDist = roomCenterForObject
          ? Math.hypot(
              candidate.x - roomCenterForObject.x,
              candidate.z - roomCenterForObject.z,
            )
          : 0;

        const overflowX =
          candidate.x < roomBoundsForObject.minX
            ? roomBoundsForObject.minX - candidate.x
            : candidate.x > roomBoundsForObject.maxX
              ? candidate.x - roomBoundsForObject.maxX
              : 0;
        const overflowZ =
          candidate.z < roomBoundsForObject.minZ
            ? roomBoundsForObject.minZ - candidate.z
            : candidate.z > roomBoundsForObject.maxZ
              ? candidate.z - roomBoundsForObject.maxZ
              : 0;

        return centerDist + (overflowX + overflowZ) * 20;
      };

      let candidate =
        scoreCandidate(planSpaceCandidate) < scoreCandidate(worldSpaceCandidate)
          ? planSpaceCandidate
          : worldSpaceCandidate;

      candidate = clampToBounds(candidate, roomBoundsForObject, fittedSize);

      // Push objects away from door swings/openings to keep pathways clear.
      for (let iter = 0; iter < 3; iter += 1) {
        for (const zone of doorZones) {
          const dx = candidate.x - zone.x;
          const dz = candidate.z - zone.z;
          const distance = Math.hypot(dx, dz);
          const minDistance =
            zone.radius + Math.max(fittedSize[0], fittedSize[2]) * 0.45;
          if (distance >= minDistance) {
            continue;
          }

          const push = minDistance - distance + 0.02;
          const fallbackDir = roomCenterForObject
            ? {
                x: candidate.x - roomCenterForObject.x,
                z: candidate.z - roomCenterForObject.z,
              }
            : getStableUnitVector(item.key);
          const dirLength = Math.hypot(
            distance > 1e-6 ? dx : fallbackDir.x,
            distance > 1e-6 ? dz : fallbackDir.z,
          );
          const nx =
            dirLength > 1e-6
              ? (distance > 1e-6 ? dx : fallbackDir.x) / dirLength
              : 1;
          const nz =
            dirLength > 1e-6
              ? (distance > 1e-6 ? dz : fallbackDir.z) / dirLength
              : 0;

          candidate = clampToBounds(
            {
              x: candidate.x + nx * push,
              z: candidate.z + nz * push,
            },
            roomBoundsForObject,
            fittedSize,
          );
        }
      }

      let resolvedRotationY = item.rotationY;

      // Keep wall-attached furniture against the nearest wall and facing inward.
      if (
        roomCenterForObject &&
        item.roomIndex !== null &&
        item.roomIndex >= 0 &&
        item.roomIndex < roomPolygonsWorld.length &&
        WALL_ANCHORED_LABEL_REGEX.test(item.label)
      ) {
        const polygon = roomPolygonsWorld[item.roomIndex];
        if (polygon.length >= 2) {
          let best: {
            point: WorldPoint;
            start: WorldPoint;
            end: WorldPoint;
            distance: number;
          } | null = null;

          for (let index = 0; index < polygon.length; index += 1) {
            const start = polygon[index];
            const end = polygon[(index + 1) % polygon.length];
            const projected = projectPointToSegment(candidate, start, end);
            if (!best || projected.distance < best.distance) {
              best = {
                point: projected.point,
                start,
                end,
                distance: projected.distance,
              };
            }
          }

          if (best) {
            const edgeX = best.end.x - best.start.x;
            const edgeZ = best.end.z - best.start.z;
            const edgeLength = Math.hypot(edgeX, edgeZ);

            if (edgeLength > 1e-6) {
              let nx = -edgeZ / edgeLength;
              let nz = edgeX / edgeLength;
              const toCenterX = roomCenterForObject.x - best.point.x;
              const toCenterZ = roomCenterForObject.z - best.point.z;
              if (toCenterX * nx + toCenterZ * nz < 0) {
                nx *= -1;
                nz *= -1;
              }

              const inset = Math.max(0.22, fittedSize[2] * 0.46);
              candidate = clampToBounds(
                {
                  x: best.point.x + nx * inset,
                  z: best.point.z + nz * inset,
                },
                roomBoundsForObject,
                fittedSize,
              );

              resolvedRotationY = Math.atan2(
                roomCenterForObject.z - candidate.z,
                roomCenterForObject.x - candidate.x,
              );
            }
          }
        }
      }

      // Resolve object stacking by iteratively separating overlapping footprints.
      for (let iter = 0; iter < 8; iter += 1) {
        let moved = false;

        for (const placed of placements) {
          const sameRoom =
            item.roomIndex === placed.item.roomIndex ||
            item.roomIndex === null ||
            placed.item.roomIndex === null;
          if (!sameRoom) {
            continue;
          }

          const dx = candidate.x - placed.position[0];
          const dz = candidate.z - placed.position[2];
          const overlapX =
            (fittedSize[0] + placed.size[0]) / 2 +
            OBJECT_BASE_CLEARANCE -
            Math.abs(dx);
          const overlapZ =
            (fittedSize[2] + placed.size[2]) / 2 +
            OBJECT_BASE_CLEARANCE -
            Math.abs(dz);

          if (overlapX <= 0 || overlapZ <= 0) {
            continue;
          }

          const fallback = getStableUnitVector(
            `${item.key}-${placed.item.key}`,
          );
          const dirX = Math.abs(dx) > 1e-5 ? Math.sign(dx) : fallback.x;
          const dirZ = Math.abs(dz) > 1e-5 ? Math.sign(dz) : fallback.z;

          if (overlapX < overlapZ) {
            candidate.x += dirX * (overlapX + 0.04);
          } else {
            candidate.z += dirZ * (overlapZ + 0.04);
          }

          candidate = clampToBounds(candidate, roomBoundsForObject, fittedSize);
          moved = true;
        }

        if (!moved) {
          break;
        }
      }

      // Try nearby fallback slots before giving up on an overlapping placement.
      if (isOverlappingPlaced(candidate, fittedSize, item.roomIndex)) {
        let foundFreeSpot = false;
        const radiusStep = 0.12;
        const maxRadius = 1.6;

        for (
          let radius = radiusStep;
          radius <= maxRadius;
          radius += radiusStep
        ) {
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const trial = clampToBounds(
              {
                x: candidate.x + Math.cos(angle) * radius,
                z: candidate.z + Math.sin(angle) * radius,
              },
              roomBoundsForObject,
              fittedSize,
            );

            if (!isOverlappingPlaced(trial, fittedSize, item.roomIndex)) {
              candidate = trial;
              foundFreeSpot = true;
              break;
            }
          }

          if (foundFreeSpot) {
            break;
          }
        }

        // Last resort: skip rendering this object to guarantee no visual stacking.
        if (!foundFreeSpot) {
          continue;
        }
      }

      if (
        roomCenterForObject &&
        !WALL_ANCHORED_LABEL_REGEX.test(item.label) &&
        CENTER_FACING_LABEL_REGEX.test(item.label)
      ) {
        resolvedRotationY = Math.atan2(
          roomCenterForObject.z - candidate.z,
          roomCenterForObject.x - candidate.x,
        );
      }

      placements.push({
        item,
        size: fittedSize,
        rotationY: resolvedRotationY,
        position: [
          candidate.x,
          item.modelUrl
            ? 0.02
            : Math.max(item.position[1] + fittedSize[1] / 2, fittedSize[1] / 2),
          candidate.z,
        ],
      });
    }

    return placements;
  }, [
    center.x,
    center.y,
    doorZones,
    renderableObjects,
    roomBoundsByIndex,
    roomBoundsWorld,
    roomCentersByIndex,
    roomPolygonsWorld,
    unitScale,
  ]);

  // Apply per-object user overrides (move/rotate/scale via hotkeys) on top of solver output.
  const finalRenderablePlacements = useMemo(() => {
    if (Object.keys(respaceObjectOverrides).length === 0) {
      return resolvedRenderablePlacements;
    }
    return resolvedRenderablePlacements.map((p) => {
      const override = respaceObjectOverrides[p.item.key];
      if (!override) return p;
      const sf = Math.max(0.2, Math.min(2, override.scaleFactor ?? 1));
      return {
        ...p,
        position: [
          p.position[0] + (override.dx ?? 0),
          p.position[1],
          p.position[2] + (override.dz ?? 0),
        ] as Vec3,
        size: [p.size[0] * sf, p.size[1] * sf, p.size[2] * sf] as Vec3,
        rotationY: p.rotationY + (override.dRotY ?? 0),
      };
    });
  }, [resolvedRenderablePlacements, respaceObjectOverrides]);

  const roomFloorGeometries = useMemo(() => {
    const uvWorldScale =
      (unitScale * ROOM_SPACING_FACTOR) / FLOOR_PLANK_WORLD_SIZE;

    return geometry.roomShapes.map((shape) => {
      const floorGeometry = new ShapeGeometry(shape);
      const position = floorGeometry.getAttribute("position");
      const uv = floorGeometry.getAttribute("uv");

      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = -position.getY(index);
        uv.setXY(index, x * uvWorldScale, y * uvWorldScale);
      }

      uv.needsUpdate = true;
      return floorGeometry;
    });
  }, [geometry.roomShapes, unitScale]);

  useEffect(() => {
    return () => {
      roomFloorGeometries.forEach((floorGeometry) => floorGeometry.dispose());
    };
  }, [roomFloorGeometries]);

  const getRoomIndexForWorld = (x: number, z: number): number | null => {
    const planPoint: Point2D = {
      x: x / (unitScale * ROOM_SPACING_FACTOR) + center.x,
      y: z / (unitScale * ROOM_SPACING_FACTOR) + center.y,
    };

    for (let index = 0; index < geometry.roomPolygons.length; index += 1) {
      if (isPointInPolygon(planPoint, geometry.roomPolygons[index])) {
        return index;
      }
    }

    return null;
  };

  const getScaleForRoom = (
    roomIndex: number | null,
    baseSize: Vec3,
  ): number => {
    if (
      roomIndex === null ||
      roomIndex < 0 ||
      roomIndex >= roomBoundsByIndex.length
    ) {
      return 1;
    }

    const bounds = roomBoundsByIndex[roomIndex];
    const roomWidth = bounds.maxX - bounds.minX;
    const roomDepth = bounds.maxZ - bounds.minZ;
    const maxObjWidth = Math.max(0.45, roomWidth * 0.42);
    const maxObjDepth = Math.max(0.45, roomDepth * 0.42);

    return Math.min(
      1,
      maxObjWidth / Math.max(0.01, baseSize[0]),
      maxObjDepth / Math.max(0.01, baseSize[2]),
    );
  };

  const clampToRoomBounds = (
    x: number,
    z: number,
    roomIndex: number | null,
    fittedSize: Vec3,
  ): { x: number; z: number } => {
    if (
      roomIndex === null ||
      roomIndex < 0 ||
      roomIndex >= roomBoundsByIndex.length
    ) {
      return { x, z };
    }

    const bounds = roomBoundsByIndex[roomIndex];
    return {
      x: clampNumber(
        x,
        bounds.minX + fittedSize[0] / 2 + 0.05,
        bounds.maxX - fittedSize[0] / 2 - 0.05,
      ),
      z: clampNumber(
        z,
        bounds.minZ + fittedSize[2] / 2 + 0.05,
        bounds.maxZ - fittedSize[2] / 2 - 0.05,
      ),
    };
  };

  if (!data || (!geometry.walls.length && !geometry.roomShapes.length)) {
    return <div className="fp3d-canvas-note">No renderable geometry yet.</div>;
  }

  return (
    <div className="fp3d-canvas-wrap">
      <Canvas
        camera={{ position: [0.01, 24, 0.01], fov: 45 }}
        style={{ width: "100vw", height: "100vh" }}
      >
        <color attach="background" args={["#0b1020"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 10, 6]} intensity={1.1} />
        <gridHelper args={[40, 40, "#29324f", "#1a2239"]} />

        {geometry.roomShapes.map((shape, index) => (
          <group key={`room-${index}`}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[
                -center.x * unitScale * ROOM_SPACING_FACTOR,
                0.01,
                -center.y * unitScale * ROOM_SPACING_FACTOR,
              ]}
              scale={[
                unitScale * ROOM_SPACING_FACTOR,
                unitScale * ROOM_SPACING_FACTOR,
                unitScale * ROOM_SPACING_FACTOR,
              ]}
            >
              {roomFloorGeometries[index] && (
                <primitive
                  object={roomFloorGeometries[index]}
                  attach="geometry"
                />
              )}
              <meshStandardMaterial
                map={surfaceTextures?.floor}
                roughness={0.76}
                metalness={0.02}
                side={DoubleSide}
              />
            </mesh>

            {(() => {
              const overlayColor =
                ROOM_OVERLAY_COLORS[index % ROOM_OVERLAY_COLORS.length];
              const edgeColor = roomNames[index]?.trim()
                ? "#d6ffe8"
                : "#dfe8ff";
              const isRoomRunning = runningRoomIndices.includes(index);
              const roomShapeGeometry = new ShapeGeometry(shape);

              return (
                <>
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[
                      -center.x * unitScale * ROOM_SPACING_FACTOR,
                      wallHeight + 0.08,
                      -center.y * unitScale * ROOM_SPACING_FACTOR,
                    ]}
                    scale={[
                      unitScale * ROOM_SPACING_FACTOR,
                      unitScale * ROOM_SPACING_FACTOR,
                      unitScale * ROOM_SPACING_FACTOR,
                    ]}
                  >
                    <shapeGeometry args={[shape]} />
                    <meshBasicMaterial
                      color={overlayColor}
                      transparent
                      opacity={
                        !isTopView || hoveredRoomIndex !== index ? 0 : 0.18
                      }
                      side={DoubleSide}
                      depthWrite={false}
                      depthTest={false}
                    />
                  </mesh>

                  <lineSegments
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[
                      -center.x * unitScale * ROOM_SPACING_FACTOR,
                      wallHeight + 0.095,
                      -center.y * unitScale * ROOM_SPACING_FACTOR,
                    ]}
                    scale={[
                      unitScale * ROOM_SPACING_FACTOR,
                      unitScale * ROOM_SPACING_FACTOR,
                      unitScale * ROOM_SPACING_FACTOR,
                    ]}
                  >
                    <edgesGeometry args={[roomShapeGeometry]} />
                    <lineBasicMaterial
                      color={edgeColor}
                      transparent
                      opacity={
                        !isTopView || hoveredRoomIndex !== index ? 0 : 0.96
                      }
                      depthWrite={false}
                      depthTest={false}
                    />
                  </lineSegments>

                  {isRoomRunning && (
                    <mesh
                      rotation={[-Math.PI / 2, 0, 0]}
                      position={[
                        -center.x * unitScale * ROOM_SPACING_FACTOR,
                        wallHeight + 0.21,
                        -center.y * unitScale * ROOM_SPACING_FACTOR,
                      ]}
                      scale={[
                        unitScale * ROOM_SPACING_FACTOR,
                        unitScale * ROOM_SPACING_FACTOR,
                        unitScale * ROOM_SPACING_FACTOR,
                      ]}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <shapeGeometry args={[shape]} />
                      <meshBasicMaterial
                        color="#0c1326"
                        transparent
                        opacity={0.55}
                        side={DoubleSide}
                        depthWrite={false}
                        depthTest={false}
                      />
                    </mesh>
                  )}
                </>
              );
            })()}

            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[
                -center.x * unitScale * ROOM_SPACING_FACTOR,
                wallHeight + 0.16,
                -center.y * unitScale * ROOM_SPACING_FACTOR,
              ]}
              scale={[
                unitScale * ROOM_SPACING_FACTOR,
                unitScale * ROOM_SPACING_FACTOR,
                unitScale * ROOM_SPACING_FACTOR,
              ]}
              onPointerOver={(event) => {
                if (!isTopView) {
                  return;
                }
                event.stopPropagation();
                setHoveredRoomIndex(index);
              }}
              onPointerOut={(event) => {
                if (!isTopView) {
                  return;
                }
                event.stopPropagation();
                setHoveredRoomIndex((current) =>
                  current === index ? null : current,
                );
              }}
              onClick={(event) => {
                if (pendingAsset) {
                  return;
                }

                if (runningRoomIndices.includes(index)) {
                  return;
                }

                if (!isTopView) {
                  return;
                }
                event.stopPropagation();
                onRoomClick?.(index);
              }}
            >
              <shapeGeometry args={[shape]} />
              <meshBasicMaterial
                transparent
                opacity={0.001}
                side={DoubleSide}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
          </group>
        ))}

        {geometry.walls.map((wall, index) => {
          const wallWorldWidth = wall.width * unitScale * ROOM_SPACING_FACTOR;
          const wallWorldDepth = wall.depth * unitScale * ROOM_SPACING_FACTOR;
          // Scale texture repeat proportionally to physical wall size so
          // texture density stays consistent regardless of wall length.
          const wallTileSize = 1.8; // world-units per texture tile
          const wallRepeatX = Math.max(1, wallWorldWidth / wallTileSize);
          const wallRepeatY = Math.max(1, wallHeight / wallTileSize);

          return (
            <mesh
              key={`wall-${index}`}
              position={[
                (wall.centerX - center.x) * unitScale * ROOM_SPACING_FACTOR,
                wallHeight / 2,
                (wall.centerY - center.y) * unitScale * ROOM_SPACING_FACTOR,
              ]}
              rotation={[0, -wall.rotationY, 0]}
            >
              <boxGeometry
                args={[wallWorldWidth, wallHeight, wallWorldDepth]}
              />
              <meshStandardMaterial
                map={
                  surfaceTextures?.wallBase
                    ? (() => {
                        const t = surfaceTextures.wallBase.clone();
                        t.repeat.set(wallRepeatX, wallRepeatY);
                        t.needsUpdate = true;
                        return t;
                      })()
                    : undefined
                }
                normalMap={
                  surfaceTextures?.wallNormal
                    ? (() => {
                        const t = surfaceTextures.wallNormal.clone();
                        t.repeat.set(wallRepeatX, wallRepeatY);
                        t.needsUpdate = true;
                        return t;
                      })()
                    : undefined
                }
                roughnessMap={
                  surfaceTextures?.wallRoughness
                    ? (() => {
                        const t = surfaceTextures.wallRoughness.clone();
                        t.repeat.set(wallRepeatX, wallRepeatY);
                        t.needsUpdate = true;
                        return t;
                      })()
                    : undefined
                }
                roughness={0.88}
                metalness={0.03}
              />
            </mesh>
          );
        })}

        {geometry.doors.map((door, index) => (
          <mesh
            key={`door-${index}`}
            position={[
              (door.centerX - center.x) * unitScale * ROOM_SPACING_FACTOR,
              1,
              (door.centerY - center.y) * unitScale * ROOM_SPACING_FACTOR,
            ]}
            rotation={[0, -door.rotationY, 0]}
          >
            <boxGeometry
              args={[
                door.width * unitScale * ROOM_SPACING_FACTOR,
                2,
                door.depth * unitScale * ROOM_SPACING_FACTOR,
              ]}
            />
            <meshStandardMaterial
              map={surfaceTextures?.door}
              roughness={0.82}
              metalness={0.02}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        ))}

        {finalRenderablePlacements.map((placement) => {
          const { item, position, size, rotationY } = placement;
          const meshKey = `respace-object-${item.key}`;
          const isSelected = selectedRespaceObjectKey === item.key;

          const selectionRing = isSelected ? (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[position[0], 0.03, position[2]]}
            >
              <ringGeometry
                args={[
                  Math.max(size[0], size[2]) * 0.48,
                  Math.max(size[0], size[2]) * 0.56,
                  40,
                ]}
              />
              <meshBasicMaterial
                color="#ffd580"
                transparent
                opacity={0.9}
                side={DoubleSide}
              />
            </mesh>
          ) : null;

          if (item.modelUrl) {
            return (
              <group
                key={`${meshKey}-group`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectRespaceObject?.(isSelected ? null : item.key);
                  if (!isSelected) onSelectManualObject?.(null);
                }}
              >
                {selectionRing}
                <Suspense key={`${meshKey}-suspense`} fallback={null}>
                  <ModelObject
                    meshKey={meshKey}
                    modelUrl={item.modelUrl}
                    position={position}
                    targetSize={size}
                    rotationY={rotationY}
                  />
                </Suspense>
              </group>
            );
          }

          if (item.textureUrl) {
            return (
              <group
                key={`${meshKey}-group`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectRespaceObject?.(isSelected ? null : item.key);
                  if (!isSelected) onSelectManualObject?.(null);
                }}
              >
                {selectionRing}
                <TexturedObjectBox
                  key={meshKey}
                  meshKey={meshKey}
                  position={position}
                  size={size}
                  rotationY={rotationY}
                  textureUrl={item.textureUrl}
                />
              </group>
            );
          }

          return (
            <group
              key={`${meshKey}-group`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectRespaceObject?.(isSelected ? null : item.key);
                if (!isSelected) onSelectManualObject?.(null);
              }}
            >
              {selectionRing}
              <mesh
                key={meshKey}
                position={position}
                rotation={[0, rotationY, 0]}
              >
                <boxGeometry args={size} />
                <meshStandardMaterial color="#7e8a94" roughness={0.75} />
              </mesh>
            </group>
          );
        })}

        {manualObjects.map((item) => {
          const roomScale = Math.max(
            0.2,
            Math.min(
              1,
              item.roomScaleFactor ??
                getScaleForRoom(item.roomIndex, item.baseSize),
            ),
          );
          const userScale = Math.max(0.2, Math.min(2, item.scaleFactor));
          const finalScale = Math.max(
            0.2,
            Math.min(2.5, roomScale * userScale),
          );
          const fittedSize: Vec3 = [
            Math.max(0.2, item.baseSize[0] * finalScale),
            Math.max(0.2, item.baseSize[1] * finalScale),
            Math.max(0.2, item.baseSize[2] * finalScale),
          ];

          const clamped = clampToRoomBounds(
            item.x,
            item.z,
            item.roomIndex,
            fittedSize,
          );

          const isModelObject = Boolean(item.modelUrl);
          const position: Vec3 = [
            clamped.x,
            isModelObject
              ? 0.02
              : Math.max(item.yBase ?? 0, 0) + fittedSize[1] / 2,
            clamped.z,
          ];

          const meshKey = `manual-object-${item.objectId}`;

          return (
            <group
              key={meshKey}
              onClick={(event) => {
                event.stopPropagation();
                onSelectManualObject?.(item.objectId);
              }}
            >
              {selectedManualObjectId === item.objectId && (
                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[position[0], 0.03, position[2]]}
                >
                  <ringGeometry
                    args={[
                      Math.max(fittedSize[0], fittedSize[2]) * 0.48,
                      Math.max(fittedSize[0], fittedSize[2]) * 0.56,
                      40,
                    ]}
                  />
                  <meshBasicMaterial
                    color="#a9f3ff"
                    transparent
                    opacity={0.92}
                    side={DoubleSide}
                  />
                </mesh>
              )}

              {item.modelUrl ? (
                <Suspense fallback={null}>
                  <ModelObject
                    meshKey={meshKey}
                    modelUrl={item.modelUrl}
                    position={position}
                    targetSize={fittedSize}
                    rotationY={item.rotationY}
                    centerOnXZ={false}
                  />
                </Suspense>
              ) : item.textureUrl ? (
                <TexturedObjectBox
                  meshKey={meshKey}
                  position={position}
                  size={fittedSize}
                  rotationY={item.rotationY}
                  textureUrl={item.textureUrl}
                />
              ) : (
                <mesh position={position} rotation={[0, item.rotationY, 0]}>
                  <boxGeometry args={fittedSize} />
                  <meshStandardMaterial color="#92a1ad" roughness={0.78} />
                </mesh>
              )}
            </group>
          );
        })}

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, 0]}
          onClick={(event) => {
            if (!pendingAsset || !onPlaceManualObject) {
              return;
            }

            event.stopPropagation();
            const x = event.point.x;
            const z = event.point.z;
            const roomIndex = getRoomIndexForWorld(x, z);
            const scaleFactor = getScaleForRoom(roomIndex, [1, 1, 1]);
            onPlaceManualObject({
              asset: pendingAsset,
              x,
              z,
              roomIndex,
              scaleFactor,
            });
          }}
        >
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled
          onChange={() => {
            const polar = controlsRef.current?.getPolarAngle() ?? Math.PI / 2;
            const topView = polar < 0.28;
            setIsTopView(topView);
            if (!topView) {
              setHoveredRoomIndex(null);
            }
          }}
        />
      </Canvas>
    </div>
  );
};

export default FloorPlan3DPreview;
