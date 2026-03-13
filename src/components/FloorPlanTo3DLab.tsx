import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
  Cuboid,
  FileUp,
  LoaderCircle,
  Map,
  Move3D,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import FloorPlan3DPreview, {
  type ManualAssetCatalogItem,
  type ManualPlacedObject,
} from "./FloorPlan3DPreview";
import "./FloorPlanTo3DLab.css";

type RunState = "idle" | "running" | "success" | "error";

interface ParsedPlanData {
  doors: unknown[];
  walls: unknown[];
  rooms: unknown[];
  area?: number;
  perimeter?: number;
}

interface RespaceApiResponse {
  ok: boolean;
  mode: string;
  message: string;
  isSuccess?: boolean | null;
  scene?: {
    objects?: unknown[];
  } | null;
}

interface RoomObjectBundle {
  roomIndex: number;
  objects: unknown[];
}

interface AssetCatalogResponse {
  page: number;
  pageSize: number;
  total?: number | null;
  totalPages?: number | null;
  hasMore?: boolean;
  items: ManualAssetCatalogItem[];
}

type Point2D = { x: number; y: number };

interface LabelableRoom {
  points: Point2D[];
  centroid: Point2D;
  sourceIndex: number;
}

const ROOM_HIGHLIGHT_COLORS = [
  "#7f8cff",
  "#4ed3d0",
  "#8cd56c",
  "#ffb86a",
  "#f48fb1",
  "#9fa8da",
  "#80cbc4",
  "#ffd54f",
];

const ROOM_ASSET_PRESETS: Array<{ pattern: RegExp; assets: string[] }> = [
  {
    pattern: /(living|lounge)/i,
    assets: ["sofa", "coffee table", "floor lamp"],
  },
  {
    pattern: /kitchen/i,
    assets: ["island", "bar stools", "pendant lights"],
  },
  {
    pattern: /(dining)/i,
    assets: ["dining table", "chairs", "chandelier"],
  },
  {
    pattern: /(bed|master|guest)/i,
    assets: ["bed frame", "nightstands", "wardrobe"],
  },
  {
    pattern: /(bath)/i,
    assets: ["vanity", "mirror", "shower enclosure"],
  },
  {
    pattern: /(office|study)/i,
    assets: ["desk", "task chair", "bookshelf"],
  },
];

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

const getCentroid = (points: Point2D[]): Point2D => {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
};

const getAssetsForRoom = (roomName: string): string[] => {
  const matchedPreset = ROOM_ASSET_PRESETS.find((preset) =>
    preset.pattern.test(roomName),
  );

  if (matchedPreset) {
    return matchedPreset.assets;
  }

  return ["accent chair", "area rug", "ceiling light"];
};

const buildDefaultRespacePrompt = (
  roomName: string,
  requestedAssetCount: number,
): string => {
  const baseAssets = getAssetsForRoom(roomName);
  const fallbackAssets = [
    "accent chair",
    "area rug",
    "ceiling light",
    "side table",
    "wall art",
  ];

  const assetCount = Math.max(3, requestedAssetCount);
  const assets = [...baseAssets, ...fallbackAssets].slice(0, assetCount);

  return `Construct ${roomName} with a functional, realistic layout while preserving circulation and door clearances. Include at least ${assetCount} assets: ${assets.join(", ")}.`;
};

const deriveApiBaseUrl = (respaceRunUrl: string): string => {
  const trimmed = respaceRunUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname
      .replace(/\/respace\/run\/?$/, "")
      .replace(/\/assets\/3dfuture\/list\/?$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed
      .replace(/\/respace\/run\/?$/, "")
      .replace(/\/assets\/3dfuture\/list\/?$/, "")
      .replace(/\/$/, "");
  }
};

interface FloorPlanTo3DLabProps {
  onGoHome: () => void;
}

const FloorPlanTo3DLab = ({ onGoHome }: FloorPlanTo3DLabProps) => {
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [parsedData, setParsedData] = useState<ParsedPlanData | null>(null);
  const [digitalizationState, setDigitalizationState] =
    useState<RunState>("idle");
  const [digitalizationMessage, setDigitalizationMessage] = useState<string>(
    "Upload a 2D floorplan to start.",
  );
  const [respaceState, setRespaceState] = useState<RunState>("idle");
  const [respaceMessage, setRespaceMessage] = useState<string>("");
  const [wallHeight, setWallHeight] = useState(3);
  const [wallThickness, setWallThickness] = useState(0.1);
  const [unitScale, setUnitScale] = useState(0.01);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const [roomNames, setRoomNames] = useState<string[]>([]);
  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [roomRunStates, setRoomRunStates] = useState<RunState[]>([]);
  const [respaceRoomObjects, setRespaceRoomObjects] = useState<
    RoomObjectBundle[]
  >([]);
  const [mapCollapsed, setMapCollapsed] = useState(true);
  const [namingDialogRoomIndex, setNamingDialogRoomIndex] = useState<
    number | null
  >(null);
  const [roomDialogName, setRoomDialogName] = useState("");
  const [roomDialogAssetCount, setRoomDialogAssetCount] = useState(3);
  const [assetsSidebarCollapsed, setAssetsSidebarCollapsed] = useState(false);
  const [assetCatalogPage, setAssetCatalogPage] = useState(1);
  const [assetCatalogHasMore, setAssetCatalogHasMore] = useState(false);
  const [assetCatalogTotalPages, setAssetCatalogTotalPages] = useState(1);
  const [assetCatalogTotal, setAssetCatalogTotal] = useState(0);
  const [assetCatalogItems, setAssetCatalogItems] = useState<
    ManualAssetCatalogItem[]
  >([]);
  const [assetCatalogState, setAssetCatalogState] = useState<RunState>("idle");
  const [assetCatalogMessage, setAssetCatalogMessage] = useState("");
  const [selectedManualAsset, setSelectedManualAsset] =
    useState<ManualAssetCatalogItem | null>(null);
  const [manualObjects, setManualObjects] = useState<ManualPlacedObject[]>([]);
  const [selectedManualObjectId, setSelectedManualObjectId] = useState<
    string | null
  >(null);

  const digitalizationEndpoint =
    (import.meta.env.VITE_RASTERSCAN_GRADIO_URL as string | undefined) ??
    "https://rasterscan-automated-floor-plan-digitalization.hf.space";

  const respaceEndpoint =
    (import.meta.env.VITE_RESPACE_LOCAL_API_URL as string | undefined) ?? "";
  const assetCatalogEndpoint =
    (import.meta.env.VITE_RESPACE_ASSETS_API_URL as string | undefined) ?? "";
  const respaceTimeoutMs = Number(
    import.meta.env.VITE_RESPACE_TIMEOUT_MS ?? 300000,
  );

  const hasPlanShape = (value: unknown): value is ParsedPlanData => {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as ParsedPlanData;
    return (
      Array.isArray(candidate.doors) &&
      Array.isArray(candidate.walls) &&
      Array.isArray(candidate.rooms)
    );
  };

  const findPlanDataDeep = (value: unknown): ParsedPlanData | null => {
    if (hasPlanShape(value)) {
      return value;
    }

    if (typeof value === "string") {
      try {
        return findPlanDataDeep(JSON.parse(value) as unknown);
      } catch {
        return null;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findPlanDataDeep(item);
        if (found) {
          return found;
        }
      }
      return null;
    }

    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        const found = findPlanDataDeep(nested);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  const parseSsePayloads = (eventText: string): unknown[] => {
    const payloads: unknown[] = [];
    const eventChunks = eventText.split(/\n\s*\n/);

    for (const chunk of eventChunks) {
      const trimmedChunk = chunk.trim();
      if (!trimmedChunk) {
        continue;
      }

      const eventNameMatch = trimmedChunk.match(/^event:\s*([^\n]+)/m);
      const eventName = eventNameMatch?.[1]?.trim();
      if (eventName && eventName !== "complete" && eventName !== "data") {
        continue;
      }

      const dataMatches = [...trimmedChunk.matchAll(/^data:\s*(.*)$/gm)];
      if (dataMatches.length === 0) {
        continue;
      }

      const dataText = dataMatches
        .map((match) => match[1])
        .join("\n")
        .trim();

      if (!dataText || dataText === "null" || dataText === "[DONE]") {
        continue;
      }

      try {
        payloads.push(JSON.parse(dataText) as unknown);
      } catch {
        const fallbackMatch = trimmedChunk.match(/data:\s*([\s\S]*)$/m);
        if (!fallbackMatch) {
          continue;
        }

        try {
          payloads.push(JSON.parse(fallbackMatch[1].trim()) as unknown);
        } catch {
          // ignore
        }
      }
    }

    return payloads;
  };

  const runRespaceForRoom = useCallback(
    async (
      geometry: ParsedPlanData,
      roomIndex: number,
      roomName: string,
      assetCount: number,
    ) => {
      if (!respaceEndpoint.trim()) {
        setRespaceState("idle");
        setRespaceMessage(
          "Local ReSpace endpoint is not configured. Showing deterministic 3D conversion only.",
        );
        setRoomRunStates((current) => {
          const next = [...current];
          next[roomIndex] = "idle";
          return next;
        });
        return;
      }

      try {
        setRespaceState("running");
        setRespaceMessage(`Constructing ${roomName}...`);
        setRoomRunStates((current) => {
          const next = [...current];
          next[roomIndex] = "running";
          return next;
        });

        const prompt = buildDefaultRespacePrompt(roomName, assetCount);
        const orderedValidRoomPolygons = (geometry.rooms ?? [])
          .map(toPolygon)
          .filter((polygon) => polygon.length >= 3);
        const selectedRoom = orderedValidRoomPolygons[roomIndex];
        const geometryForRoom: ParsedPlanData = {
          ...geometry,
          rooms: selectedRoom
            ? [selectedRoom.map((point) => ({ x: point.x, y: point.y }))]
            : [],
        };

        const payload = {
          source: "RasterScan/Automated-Floor-Plan-Digitalization",
          geometry: geometryForRoom,
          generationConfig: {
            wallHeight,
            wallThickness,
            unitScale,
            prompt,
          },
          rooms: [roomName],
          roomContext: {
            roomIndex,
            roomName,
          },
        };

        const controller = new AbortController();
        const timeoutId = window.setTimeout(
          () => controller.abort(),
          Number.isFinite(respaceTimeoutMs) && respaceTimeoutMs > 0
            ? respaceTimeoutMs
            : 300000,
        );

        const response = await fetch(respaceEndpoint.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }).finally(() => {
          window.clearTimeout(timeoutId);
        });

        if (!response.ok) {
          throw new Error(`ReSpace endpoint failed (${response.status}).`);
        }

        const result = (await response.json()) as RespaceApiResponse;
        const objectCount = Array.isArray(result.scene?.objects)
          ? result.scene.objects.length
          : 0;

        if (objectCount === 0) {
          setRespaceState("error");
          setRespaceMessage(
            `${roomName} request completed but no visible objects were generated. Check ReSpace asset paths/logs.`,
          );
          setRoomRunStates((current) => {
            const next = [...current];
            next[roomIndex] = "error";
            return next;
          });
          return;
        }

        setRespaceState("success");
        setRespaceMessage(
          result.message ||
            `${roomName} constructed successfully with ${objectCount} object${objectCount > 1 ? "s" : ""}.`,
        );
        setRespaceRoomObjects((current) => {
          const remaining = current.filter(
            (bundle) => bundle.roomIndex !== roomIndex,
          );
          return [
            ...remaining,
            { roomIndex, objects: result.scene?.objects ?? [] },
          ];
        });
        setRoomRunStates((current) => {
          const next = [...current];
          next[roomIndex] = "success";
          return next;
        });
      } catch (error) {
        setRespaceState("error");
        if (error instanceof DOMException && error.name === "AbortError") {
          setRespaceMessage(
            "ReSpace request timed out. Reduce complexity or lower backend retry attempts.",
          );
          setRoomRunStates((current) => {
            const next = [...current];
            next[roomIndex] = "error";
            return next;
          });
          return;
        }

        setRespaceMessage(
          error instanceof Error ? error.message : "ReSpace call failed.",
        );
        setRoomRunStates((current) => {
          const next = [...current];
          next[roomIndex] = "error";
          return next;
        });
      }
    },
    [respaceEndpoint, respaceTimeoutMs, unitScale, wallHeight, wallThickness],
  );

  const resolvedApiBase = useMemo(() => {
    if (assetCatalogEndpoint.trim()) {
      return deriveApiBaseUrl(assetCatalogEndpoint);
    }

    return deriveApiBaseUrl(respaceEndpoint);
  }, [assetCatalogEndpoint, respaceEndpoint]);

  useEffect(() => {
    if (!resolvedApiBase) {
      setAssetCatalogState("error");
      setAssetCatalogMessage(
        "Asset catalog endpoint is not configured. Set VITE_RESPACE_LOCAL_API_URL or VITE_RESPACE_ASSETS_API_URL.",
      );
      return;
    }

    const controller = new AbortController();

    const loadCatalog = async () => {
      try {
        setAssetCatalogState("running");
        setAssetCatalogMessage("Loading asset catalog...");

        const response = await fetch(
          `${resolvedApiBase}/assets/3dfuture/list?page=${assetCatalogPage}&page_size=25`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Asset catalog request failed (${response.status}).`);
        }

        const payload = (await response.json()) as AssetCatalogResponse;
        setAssetCatalogItems(payload.items ?? []);
        setAssetCatalogTotal(payload.total ?? 0);
        setAssetCatalogHasMore(Boolean(payload.hasMore));
        setAssetCatalogTotalPages(
          payload.totalPages ? Math.max(1, payload.totalPages) : 1,
        );
        setAssetCatalogState("success");
        const resolvedTotalPages = payload.totalPages
          ? Math.max(1, payload.totalPages)
          : null;
        setAssetCatalogMessage(
          `Loaded ${payload.items?.length ?? 0} assets (page ${payload.page}${resolvedTotalPages ? `/${resolvedTotalPages}` : ""}).`,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setAssetCatalogState("error");
        setAssetCatalogMessage(
          error instanceof Error
            ? error.message
            : "Failed to load asset catalog.",
        );
      }
    };

    void loadCatalog();

    return () => {
      controller.abort();
    };
  }, [assetCatalogPage, resolvedApiBase]);

  const labelableRooms = useMemo<LabelableRoom[]>(() => {
    if (!parsedData?.rooms?.length) {
      return [];
    }

    return parsedData.rooms
      .map((room, sourceIndex) => ({ sourceIndex, points: toPolygon(room) }))
      .filter((room) => room.points.length >= 3)
      .map((room) => ({
        sourceIndex: room.sourceIndex,
        points: room.points,
        centroid: getCentroid(room.points),
      }));
  }, [parsedData]);

  const roomBounds = useMemo(() => {
    if (!labelableRooms.length) {
      return null;
    }

    const allPoints = labelableRooms.flatMap((room) => room.points);
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));

    return { minX, maxX, minY, maxY };
  }, [labelableRooms]);

  useEffect(() => {
    if (!labelableRooms.length) {
      setRoomNames([]);
      setRoomRunStates([]);
      setNamingDialogRoomIndex(null);
      setRoomDialogName("");
      setRoomDialogAssetCount(3);
      return;
    }

    setRoomNames((current) => {
      if (current.length === labelableRooms.length) {
        return current;
      }

      return Array.from(
        { length: labelableRooms.length },
        (_, index) => current[index] ?? "",
      );
    });

    setRoomRunStates((current) =>
      Array.from(
        { length: labelableRooms.length },
        (_, index) => current[index] ?? "idle",
      ),
    );
  }, [labelableRooms]);

  const openRoomNamingDialog = useCallback(
    (roomIndex: number) => {
      const existingRoomName = roomNames[roomIndex]?.trim() ?? "";
      if (existingRoomName) {
        setRespaceMessage(
          `${existingRoomName} is already named. Edit UI for named rooms can be added next.`,
        );
        return;
      }

      setNamingDialogRoomIndex(roomIndex);
      setRoomDialogName("");
      setRoomDialogAssetCount(3);
    },
    [roomNames],
  );

  const submitRoomNamingDialog = useCallback(
    (runRespace: boolean) => {
      if (namingDialogRoomIndex === null || !parsedData) {
        return;
      }

      const trimmedName = roomDialogName.trim();
      if (!trimmedName) {
        return;
      }

      const resolvedAssetCount = Math.max(3, roomDialogAssetCount);

      setRoomNames((current) => {
        const next = [...current];
        next[namingDialogRoomIndex] = trimmedName;
        return next;
      });

      if (runRespace) {
        void runRespaceForRoom(
          parsedData,
          namingDialogRoomIndex,
          trimmedName,
          resolvedAssetCount,
        );
      } else {
        setRespaceMessage(`${trimmedName} saved. You can construct it later.`);
      }

      setNamingDialogRoomIndex(null);
      setRoomDialogName("");
      setRoomDialogAssetCount(3);
    },
    [
      namingDialogRoomIndex,
      parsedData,
      roomDialogAssetCount,
      roomDialogName,
      runRespaceForRoom,
    ],
  );

  const clearPlacedAssets = useCallback(() => {
    setSelectedManualAsset(null);
    setSelectedManualObjectId(null);
    setManualObjects([]);
    setRespaceRoomObjects([]);
    setRespaceMessage("Cleared placed assets for this floorplan.");
  }, []);

  const activeConstructionCount = roomRunStates.filter(
    (state) => state === "running",
  ).length;

  const addManualObject = useCallback(
    (placement: {
      asset: ManualAssetCatalogItem;
      x: number;
      z: number;
      roomIndex: number | null;
      scaleFactor: number;
    }) => {
      const objectId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${placement.asset.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const baseSize: [number, number, number] = [1.1, 1.1, 1.1];

      setManualObjects((current) => [
        ...current,
        {
          objectId,
          assetId: placement.asset.id,
          label: placement.asset.title,
          modelUrl: placement.asset.modelUrl,
          textureUrl: placement.asset.textureUrl ?? undefined,
          x: placement.x,
          z: placement.z,
          yBase: 0,
          rotationY: 0,
          baseSize,
          roomIndex: placement.roomIndex,
          roomScaleFactor: Math.max(0.2, Math.min(1, placement.scaleFactor)),
          scaleFactor: 1,
        },
      ]);

      // Exit placement mode after the first drop so subsequent clicks do not keep spawning assets.
      setSelectedManualAsset(null);
      setRespaceMessage("Asset placed. Click it, then use arrow keys to move.");
    },
    [],
  );

  const moveManualObject = useCallback(
    (
      objectId: string,
      update: {
        x: number;
        z: number;
        roomIndex: number | null;
        scaleFactor: number;
      },
    ) => {
      setManualObjects((current) => {
        const target = current.find((item) => item.objectId === objectId);
        if (!target) {
          return current;
        }

        const nextRoomScale = Math.max(0.2, Math.min(1, update.scaleFactor));
        const targetVisualScale =
          nextRoomScale * Math.max(0.2, target.scaleFactor);
        const targetWidth = Math.max(
          0.2,
          target.baseSize[0] * targetVisualScale,
        );
        const targetDepth = Math.max(
          0.2,
          target.baseSize[2] * targetVisualScale,
        );
        const collisionPadding = 0.06;

        const collidesWithOther = current.some((item) => {
          if (item.objectId === objectId) {
            return false;
          }

          const otherVisualScale = Math.max(
            0.2,
            (item.roomScaleFactor ?? 1) * item.scaleFactor,
          );
          const otherWidth = Math.max(0.2, item.baseSize[0] * otherVisualScale);
          const otherDepth = Math.max(0.2, item.baseSize[2] * otherVisualScale);

          const minClearanceX =
            targetWidth / 2 + otherWidth / 2 + collisionPadding;
          const minClearanceZ =
            targetDepth / 2 + otherDepth / 2 + collisionPadding;

          return (
            Math.abs(update.x - item.x) < minClearanceX &&
            Math.abs(update.z - item.z) < minClearanceZ
          );
        });

        if (collidesWithOther) {
          return current;
        }

        return current.map((item) => {
          if (item.objectId !== objectId) {
            return item;
          }

          return {
            ...item,
            x: update.x,
            z: update.z,
            yBase: 0,
            roomIndex: update.roomIndex,
            roomScaleFactor: nextRoomScale,
          };
        });
      });
    },
    [],
  );

  const nudgeSelectedManualObjectScale = useCallback(
    (delta: number) => {
      if (!selectedManualObjectId) {
        return;
      }

      setManualObjects((current) =>
        current.map((item) => {
          if (item.objectId !== selectedManualObjectId) {
            return item;
          }

          return {
            ...item,
            scaleFactor: Math.max(0.2, Math.min(2, item.scaleFactor + delta)),
          };
        }),
      );
    },
    [selectedManualObjectId],
  );

  const rotateSelectedManualObject = useCallback(
    (deltaRadians: number) => {
      if (!selectedManualObjectId) {
        return;
      }

      setManualObjects((current) =>
        current.map((item) => {
          if (item.objectId !== selectedManualObjectId) {
            return item;
          }

          const nextRotation = item.rotationY + deltaRadians;
          return {
            ...item,
            rotationY: ((nextRotation + Math.PI) % (Math.PI * 2)) - Math.PI,
          };
        }),
      );
    },
    [selectedManualObjectId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget || !selectedManualObjectId) {
        return;
      }

      const selectedObject = manualObjects.find(
        (item) => item.objectId === selectedManualObjectId,
      );

      if (!selectedObject) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setSelectedManualObjectId(null);
        return;
      }

      if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        rotateSelectedManualObject(-Math.PI / 12);
        return;
      }

      if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        rotateSelectedManualObject(Math.PI / 12);
        return;
      }

      const moveStep = 0.08;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveManualObject(selectedObject.objectId, {
          x: selectedObject.x,
          z: selectedObject.z - moveStep,
          roomIndex: selectedObject.roomIndex,
          scaleFactor: selectedObject.roomScaleFactor ?? 1,
        });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveManualObject(selectedObject.objectId, {
          x: selectedObject.x,
          z: selectedObject.z + moveStep,
          roomIndex: selectedObject.roomIndex,
          scaleFactor: selectedObject.roomScaleFactor ?? 1,
        });
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveManualObject(selectedObject.objectId, {
          x: selectedObject.x - moveStep,
          z: selectedObject.z,
          roomIndex: selectedObject.roomIndex,
          scaleFactor: selectedObject.roomScaleFactor ?? 1,
        });
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveManualObject(selectedObject.objectId, {
          x: selectedObject.x + moveStep,
          z: selectedObject.z,
          roomIndex: selectedObject.roomIndex,
          scaleFactor: selectedObject.roomScaleFactor ?? 1,
        });
        return;
      }

      if (event.key === "+" || event.key === "=" || event.key === "]") {
        event.preventDefault();
        nudgeSelectedManualObjectScale(0.08);
        return;
      }

      if (event.key === "-" || event.key === "_" || event.key === "[") {
        event.preventDefault();
        nudgeSelectedManualObjectScale(-0.08);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    manualObjects,
    moveManualObject,
    nudgeSelectedManualObjectScale,
    rotateSelectedManualObject,
    selectedManualObjectId,
  ]);

  const processUploadedFloorplan = async (file: File) => {
    setUploadedFileName(file.name);
    setDigitalizationState("running");
    setDigitalizationMessage(
      "Uploading floorplan and running digitalization...",
    );

    try {
      setRoomNames([]);
      setHoveredRoomIndex(null);
      setRoomRunStates([]);
      setRespaceRoomObjects([]);
      setRespaceState("idle");
      setRespaceMessage("");
      setSelectedManualAsset(null);
      setSelectedManualObjectId(null);
      setManualObjects([]);
      setAssetCatalogPage(1);

      const baseUrl = digitalizationEndpoint.replace(/\/$/, "");

      const uploadFormData = new FormData();
      uploadFormData.append("files", file, file.name);

      const uploadResponse = await fetch(`${baseUrl}/gradio_api/upload`, {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed (${uploadResponse.status}).`);
      }

      const uploadResult = (await uploadResponse.json()) as unknown;
      const uploadedPath =
        Array.isArray(uploadResult) &&
        typeof uploadResult[0] === "string" &&
        uploadResult[0].length > 0
          ? uploadResult[0]
          : null;

      if (!uploadedPath) {
        throw new Error("Unable to upload image to RasterScan endpoint.");
      }

      const triggerResponse = await fetch(`${baseUrl}/gradio_api/call/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: [
            {
              path: uploadedPath,
              orig_name: file.name,
              meta: { _type: "gradio.FileData" },
            },
          ],
        }),
      });

      if (!triggerResponse.ok) {
        throw new Error(
          `Digitalization run failed (${triggerResponse.status}).`,
        );
      }

      const triggerResult = (await triggerResponse.json()) as {
        event_id?: string;
      };
      if (!triggerResult.event_id) {
        throw new Error("RasterScan did not return event_id.");
      }

      const eventResponse = await fetch(
        `${baseUrl}/gradio_api/call/run/${triggerResult.event_id}`,
      );

      if (!eventResponse.ok) {
        throw new Error(
          `Unable to read digitalization output (${eventResponse.status}).`,
        );
      }

      const eventText = await eventResponse.text();
      const payloads = parseSsePayloads(eventText);

      let recognizedPayload: ParsedPlanData | null = null;
      for (let index = payloads.length - 1; index >= 0; index -= 1) {
        recognizedPayload = findPlanDataDeep(payloads[index]);
        if (recognizedPayload) {
          break;
        }
      }

      if (!recognizedPayload) {
        throw new Error("Could not parse model output.");
      }

      setParsedData(recognizedPayload);
      setDigitalizationState("success");
      setDigitalizationMessage(
        "Rasterization complete. Use ReSpace or add assets manually.",
      );
    } catch (error) {
      setDigitalizationState("error");
      setDigitalizationMessage(
        error instanceof Error ? error.message : "Digitalization failed.",
      );
    }
  };

  const statusIcon =
    digitalizationState === "running" ? (
      <LoaderCircle size={14} className="spin" />
    ) : digitalizationState === "success" ? (
      <CheckCircle2 size={14} />
    ) : digitalizationState === "error" ? (
      <TriangleAlert size={14} />
    ) : (
      <Sparkles size={14} />
    );

  return (
    <div className={`fp3d-experience ${parsedData ? "fp3d-has-canvas" : ""}`}>
      <div className="fp3d-background" />

      <header className="fp3d-topbar">
        <button type="button" className="fp3d-glass-btn" onClick={onGoHome}>
          <ArrowLeft size={16} />
        </button>

        <div className="fp3d-title-wrap">
          <div className="fp3d-title">
            <Move3D size={18} />
            Floorplan to 3D
          </div>
          <div className="fp3d-status-pill">
            {statusIcon}
            <span>{digitalizationMessage}</span>
          </div>
        </div>
      </header>

      <motion.main
        className="fp3d-main-canvas"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <FloorPlan3DPreview
          data={parsedData}
          wallHeight={wallHeight}
          wallThickness={wallThickness}
          unitScale={unitScale}
          roomNames={roomNames}
          respaceObjects={respaceRoomObjects.flatMap(
            (bundle) => bundle.objects,
          )}
          onRoomClick={openRoomNamingDialog}
          manualObjects={manualObjects}
          pendingAsset={selectedManualAsset}
          onPlaceManualObject={addManualObject}
          selectedManualObjectId={selectedManualObjectId}
          onSelectManualObject={(objectId) =>
            setSelectedManualObjectId(objectId)
          }
        />
      </motion.main>

      {!parsedData && (
        <div className="fp3d-center-actions">
          <label className="fp3d-upload-btn" htmlFor="floorplan-upload-single">
            <FileUp size={16} />
            Upload Floorplan
            <input
              id="floorplan-upload-single"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void processUploadedFloorplan(file);
                }
              }}
            />
          </label>
        </div>
      )}

      {parsedData && (
        <div className="fp3d-top-right-actions">
          <label className="fp3d-icon-btn" htmlFor="floorplan-upload-another">
            <Upload size={16} />
            <input
              id="floorplan-upload-another"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void processUploadedFloorplan(file);
                }
              }}
            />
          </label>

          <button
            type="button"
            className="fp3d-icon-btn"
            onClick={clearPlacedAssets}
            style={{ padding: 0 }}
            title="Clear placed assets"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      )}

      {labelableRooms.length > 0 && roomBounds && (
        <section className="fp3d-room-labeler">
          <button
            type="button"
            className="fp3d-map-toggle"
            onClick={() => setMapCollapsed((current) => !current)}
          >
            <span>
              <Map size={13} />
              Map
            </span>
            <ChevronDown
              size={14}
              className={mapCollapsed ? "" : "fp3d-panel-open"}
            />
          </button>

          {!mapCollapsed && (
            <div className="fp3d-room-svg-wrap">
              <svg
                className="fp3d-room-svg"
                viewBox={`0 0 ${roomBounds.maxX - roomBounds.minX + 20} ${roomBounds.maxY - roomBounds.minY + 20}`}
              >
                <defs>
                  {labelableRooms.map((_, index) => {
                    const color =
                      ROOM_HIGHLIGHT_COLORS[
                        index % ROOM_HIGHLIGHT_COLORS.length
                      ];
                    return (
                      <pattern
                        key={`pattern-${index}`}
                        id={`room-hatch-${index}`}
                        patternUnits="userSpaceOnUse"
                        width="8"
                        height="8"
                        patternTransform="rotate(30)"
                      >
                        <rect width="8" height="8" fill="transparent" />
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="8"
                          stroke={color}
                          strokeOpacity="0.38"
                          strokeWidth="1.4"
                        />
                      </pattern>
                    );
                  })}
                </defs>

                {labelableRooms.map((room, index) => {
                  const color =
                    ROOM_HIGHLIGHT_COLORS[index % ROOM_HIGHLIGHT_COLORS.length];
                  const isHovered = hoveredRoomIndex === index;

                  const points = room.points
                    .map(
                      (point) =>
                        `${point.x - roomBounds.minX + 10},${point.y - roomBounds.minY + 10}`,
                    )
                    .join(" ");

                  const cx = room.centroid.x - roomBounds.minX + 10;
                  const cy = room.centroid.y - roomBounds.minY + 10;
                  const roomLabel =
                    roomNames[index]?.trim() || `Room ${index + 1}`;

                  return (
                    <g
                      key={`label-room-${index}`}
                      onMouseEnter={() => setHoveredRoomIndex(index)}
                      onMouseLeave={() => setHoveredRoomIndex(null)}
                    >
                      <polygon
                        points={points}
                        fill={`url(#room-hatch-${index})`}
                        stroke={color}
                        strokeWidth={isHovered ? 2.2 : 1.4}
                        strokeDasharray={isHovered ? "2 2" : "4 3"}
                        opacity={isHovered ? 1 : 0.8}
                      />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fp3d-room-svg-label"
                      >
                        {roomLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>
      )}

      {parsedData && (
        <aside className="fp3d-assets-sidebar" style={{ top: "113px" }}>
          <button
            type="button"
            className="fp3d-assets-toggle"
            onClick={() => setAssetsSidebarCollapsed((current) => !current)}
          >
            <span>
              <Cuboid size={14} />
              Asset Library
            </span>
            <ChevronDown
              size={14}
              className={assetsSidebarCollapsed ? "" : "fp3d-panel-open"}
            />
          </button>

          {!assetsSidebarCollapsed && (
            <>
              <p className="fp3d-assets-meta">
                {assetCatalogTotal > 0
                  ? `${assetCatalogTotal} assets`
                  : "3D-FUTURE assets"}{" "}
                · 25 per page
              </p>

              {selectedManualAsset && (
                <p className="fp3d-assets-selected">
                  Asset selected. Click once in 3D to place.
                </p>
              )}

              {selectedManualObjectId && (
                <p className="fp3d-assets-selected">
                  Selected in scene. Arrow keys move, Shift+Left/Right rotate,
                  +/- resize, Enter deselects.
                </p>
              )}

              {assetCatalogState === "running" && (
                <p className="fp3d-assets-message">Loading assets...</p>
              )}
              {assetCatalogState === "error" && (
                <p className="fp3d-assets-message fp3d-assets-message-error">
                  {assetCatalogMessage}
                </p>
              )}

              <div className="fp3d-assets-list">
                {assetCatalogItems.map((asset) => (
                  <article
                    key={asset.id}
                    className={`fp3d-asset-card ${selectedManualAsset?.id === asset.id ? "is-selected" : ""}`}
                  >
                    <div className="fp3d-asset-preview">
                      {asset.thumbnailUrl ? (
                        <img src={asset.thumbnailUrl} alt={asset.title} />
                      ) : (
                        <span>No preview</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedManualAsset(asset)}
                      >
                        Place
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="fp3d-assets-pagination">
                <button
                  type="button"
                  disabled={assetCatalogPage <= 1}
                  onClick={() =>
                    setAssetCatalogPage((current) => Math.max(1, current - 1))
                  }
                >
                  Prev
                </button>
                <span>
                  Page {assetCatalogPage}
                  {assetCatalogTotalPages > 1
                    ? ` / ${assetCatalogTotalPages}`
                    : ""}
                </span>
                <button
                  type="button"
                  disabled={!assetCatalogHasMore}
                  onClick={() => setAssetCatalogPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </aside>
      )}

      {namingDialogRoomIndex !== null && (
        <div className="fp3d-room-dialog-overlay">
          <div className="fp3d-room-dialog">
            <div className="fp3d-room-dialog-head">
              <p>Name Room</p>
              <button
                type="button"
                onClick={() => setNamingDialogRoomIndex(null)}
                className="fp3d-room-dialog-close"
                style={{ padding: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            <label className="fp3d-room-dialog-field">
              Room name
              <input
                type="text"
                value={roomDialogName}
                placeholder={`Room ${namingDialogRoomIndex + 1}`}
                onChange={(event) => setRoomDialogName(event.target.value)}
              />
            </label>

            <label className="fp3d-room-dialog-field">
              Number of assets
              <input
                type="number"
                min={2}
                max={8}
                value={roomDialogAssetCount}
                onChange={(event) =>
                  setRoomDialogAssetCount(Number(event.target.value) || 3)
                }
              />
            </label>

            <p className="fp3d-room-dialog-note">
              Choose whether to only save the room name or start ReSpace
              construction now.
            </p>

            <div className="fp3d-room-dialog-actions">
              <button
                type="button"
                className="fp3d-room-dialog-submit fp3d-room-dialog-submit-secondary"
                onClick={() => submitRoomNamingDialog(false)}
                style={{ paddingBottom: "3px", paddingTop: "3px" }}
              >
                Save
              </button>
              <button
                type="button"
                className="fp3d-room-dialog-submit"
                onClick={() => submitRoomNamingDialog(true)}
                style={{ paddingBottom: "3px", paddingTop: "3px" }}
              >
                Save + ReSpace
              </button>
            </div>
          </div>
        </div>
      )}

      {digitalizationState === "running" && (
        <div className="fp3d-loading-overlay">
          <div className="fp3d-loading-card">
            <DotLottieReact
              src="/loading.lottie"
              autoplay
              loop
              className="fp3d-loading-lottie"
            />
            <p>{digitalizationMessage}</p>
          </div>
        </div>
      )}

      {activeConstructionCount > 0 && (
        <div className="fp3d-loading-overlay">
          <div className="fp3d-loading-card">
            <DotLottieReact
              src="/loading.lottie"
              autoplay
              loop
              className="fp3d-loading-lottie"
            />
            <p>
              Constructing {activeConstructionCount} room
              {activeConstructionCount > 1 ? "s" : ""}... this can take a while
            </p>
          </div>
        </div>
      )}

      <aside className="fp3d-floating-panel">
        <button
          type="button"
          className="fp3d-panel-toggle"
          onClick={() => setControlsCollapsed((current) => !current)}
        >
          <span className="fp3d-panel-title">
            <Cuboid size={14} />
            3D Controls
          </span>
          <ChevronDown
            size={14}
            className={controlsCollapsed ? "" : "fp3d-panel-open"}
          />
        </button>

        {!controlsCollapsed && (
          <>
            <p className="fp3d-panel-text">
              {uploadedFileName || "No file uploaded yet"}
            </p>

            <label>
              Height
              <input
                type="range"
                min="2"
                max="6"
                step="0.1"
                value={wallHeight}
                onChange={(event) => setWallHeight(Number(event.target.value))}
              />
            </label>
            <label>
              Thickness
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.01"
                value={wallThickness}
                onChange={(event) =>
                  setWallThickness(Number(event.target.value))
                }
              />
            </label>
            <label>
              Scale
              <input
                type="range"
                min="0.002"
                max="0.03"
                step="0.001"
                value={unitScale}
                onChange={(event) => setUnitScale(Number(event.target.value))}
              />
            </label>
          </>
        )}

        {respaceMessage && (
          <p
            className={`fp3d-panel-note ${respaceState === "error" ? "error" : ""}`}
          >
            {respaceMessage}
          </p>
        )}
      </aside>
    </div>
  );
};

export default FloorPlanTo3DLab;
