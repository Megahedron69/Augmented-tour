import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import {
  Box3,
  DoubleSide,
  Shape,
  ShapeGeometry,
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

interface FloorPlan3DPreviewProps {
  data: ParsedPlanData | null;
  wallHeight: number;
  wallThickness: number;
  unitScale: number;
  roomNames?: string[];
  respaceObjects?: unknown[];
  onRoomClick?: (roomIndex: number) => void;
  manualObjects?: ManualPlacedObject[];
  pendingAsset?: ManualAssetCatalogItem | null;
  onPlaceManualObject?: (placement: ManualPlacementRequest) => void;
  selectedManualObjectId?: string | null;
  onSelectManualObject?: (objectId: string | null) => void;
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
};

type Segment = { from: Point2D; to: Point2D };

type Vec3 = [number, number, number];

interface RenderableObject {
  key: string;
  position: Vec3;
  size: Vec3;
  rotationY: number;
  label: string;
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

  for (const door of data.doors ?? []) {
    const bbox = toBBox(door);
    if (!bbox) {
      continue;
    }

    const [x1, y1, x2, y2] = bbox;
    doors.push({
      centerX: (x1 + x2) / 2,
      centerY: (y1 + y2) / 2,
      width: Math.max(Math.abs(x2 - x1), wallThickness * 0.8),
      depth: Math.max(Math.abs(y2 - y1), wallThickness * 0.8),
    });
  }

  for (const room of data.rooms ?? []) {
    const polygon = toPolygon(room);
    if (polygon.length >= 3) {
      rooms.push(polygon);

      for (let index = 0; index < polygon.length; index += 1) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        addSegment(from, to);
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
  for (const segment of dedupedSegmentMap.values()) {
    const box = segmentToBox(segment.from, segment.to, wallThickness);
    if (box) {
      walls.push(box);
    }
  }

  return { walls, doors, rooms };
};

const FloorPlan3DPreview = ({
  data,
  wallHeight,
  wallThickness,
  unitScale,
  roomNames = [],
  respaceObjects = [],
  onRoomClick,
  manualObjects = [],
  pendingAsset = null,
  onPlaceManualObject,
  selectedManualObjectId = null,
  onSelectManualObject,
}: FloorPlan3DPreviewProps) => {
  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [isTopView, setIsTopView] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

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
            {(() => {
              const overlayColor =
                ROOM_OVERLAY_COLORS[index % ROOM_OVERLAY_COLORS.length];
              const edgeColor = roomNames[index]?.trim()
                ? "#d6ffe8"
                : "#dfe8ff";
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

        {geometry.walls.map((wall, index) => (
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
              args={[
                wall.width * unitScale * ROOM_SPACING_FACTOR,
                wallHeight,
                wall.depth * unitScale * ROOM_SPACING_FACTOR,
              ]}
            />
            <meshStandardMaterial color="#d3cec4" roughness={0.92} />
          </mesh>
        ))}

        {geometry.doors.map((door, index) => (
          <mesh
            key={`door-${index}`}
            position={[
              (door.centerX - center.x) * unitScale * ROOM_SPACING_FACTOR,
              1,
              (door.centerY - center.y) * unitScale * ROOM_SPACING_FACTOR,
            ]}
          >
            <boxGeometry
              args={[
                door.width * unitScale * ROOM_SPACING_FACTOR,
                2,
                door.depth * unitScale * ROOM_SPACING_FACTOR,
              ]}
            />
            <meshStandardMaterial color="#b4762f" roughness={0.82} />
          </mesh>
        ))}

        {renderableObjects.map((item) =>
          (() => {
            let sizeX = item.size[0];
            let sizeY = item.size[1];
            let sizeZ = item.size[2];

            if (roomBoundsWorld) {
              const roomWidth = roomBoundsWorld.maxX - roomBoundsWorld.minX;
              const roomDepth = roomBoundsWorld.maxZ - roomBoundsWorld.minZ;
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

            const rawX =
              (item.position[0] - center.x * unitScale) * ROOM_SPACING_FACTOR;
            const rawZ =
              (item.position[2] - center.y * unitScale) * ROOM_SPACING_FACTOR;

            const x = roomBoundsWorld
              ? clampNumber(
                  rawX,
                  roomBoundsWorld.minX + fittedSize[0] / 2 + 0.06,
                  roomBoundsWorld.maxX - fittedSize[0] / 2 - 0.06,
                )
              : rawX;
            const z = roomBoundsWorld
              ? clampNumber(
                  rawZ,
                  roomBoundsWorld.minZ + fittedSize[2] / 2 + 0.06,
                  roomBoundsWorld.maxZ - fittedSize[2] / 2 - 0.06,
                )
              : rawZ;

            const meshPosition: Vec3 = [
              x,
              Math.max(item.position[1] + fittedSize[1] / 2, fittedSize[1] / 2),
              z,
            ];

            const meshKey = `respace-object-${item.key}`;

            if (item.modelUrl) {
              return (
                <Suspense key={`${meshKey}-suspense`} fallback={null}>
                  <ModelObject
                    meshKey={meshKey}
                    modelUrl={item.modelUrl}
                    position={meshPosition}
                    targetSize={fittedSize}
                    rotationY={item.rotationY}
                  />
                </Suspense>
              );
            }

            if (item.textureUrl) {
              return (
                <TexturedObjectBox
                  key={meshKey}
                  meshKey={meshKey}
                  position={meshPosition}
                  size={fittedSize}
                  rotationY={item.rotationY}
                  textureUrl={item.textureUrl}
                />
              );
            }

            return (
              <mesh
                key={meshKey}
                position={meshPosition}
                rotation={[0, item.rotationY, 0]}
              >
                <boxGeometry args={fittedSize} />
                <meshStandardMaterial color="#7e8a94" roughness={0.75} />
              </mesh>
            );
          })(),
        )}

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
