import React, {
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { MousePointerClick, DoorOpen, MoveRight } from "lucide-react";
import type { ParsedPano } from "../utils/zindDataParser";
import { getRoomDestinations } from "../constants/roomMarkers";
import { getComponentsForRoom } from "../utils/componentStorage";
import type { RoomComponent } from "../types/roomComponents";
import { getMarkersForRoom } from "../utils/navigationMarkerStorage";
import { XRComponentRenderer } from "./XRComponentRenderer";
import "./PanoramaViewer.css";

interface PanoramaViewerProps {
  pano: ParsedPano;
  navigationHotspots: unknown[];
  onNavigate: (pano: ParsedPano) => void;
  allPanos?: ParsedPano[];
  isEditMode?: boolean;
  onCoordinateClick?: (coords: [number, number, number]) => void;
  onEditComponent?: (component: RoomComponent) => void;
  onDeleteComponent?: (componentId: string) => void;
}

/**
 * Glass-card navigation marker matching the XR component aesthetic
 */
const NavigationMarker: React.FC<{
  position: [number, number, number];
  destinationRoom: string;
  onClick: () => void;
}> = ({ position, destinationRoom, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Slowly spin the outer ring
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.6;
      const s = 1 + Math.sin(t * 1.8) * 0.12;
      ringRef.current.scale.set(s, s, 1);
      const mat = ringRef.current.material as THREE.Material & {
        opacity: number;
      };
      mat.opacity = isHovered ? 0.95 : 0.55 + Math.sin(t * 1.8) * 0.2;
    }

    // Gentle glow pulse
    if (glowRef.current) {
      const gs = 1 + Math.sin(t * 2.4) * 0.18;
      glowRef.current.scale.set(gs, gs, gs);
      const mat = glowRef.current.material as THREE.Material & {
        opacity: number;
      };
      mat.opacity = isHovered ? 0.55 : 0.25 + Math.sin(t * 2.4) * 0.1;
    }
  });

  const accentColor = isHovered ? 0x00ffee : 0x00d9ff;

  return (
    <group ref={groupRef} position={position}>
      {/* Outer spinning ring */}
      <mesh
        ref={ringRef}
        onClick={onClick}
        onPointerEnter={() => {
          setIsHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <torusGeometry args={[2.2, 0.12, 32, 80]} />
        <meshBasicMaterial color={accentColor} transparent />
      </mesh>

      {/* Soft glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial color={accentColor} transparent />
      </mesh>

      {/* Solid core — clickable */}
      <mesh
        onClick={onClick}
        onPointerEnter={() => {
          setIsHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshBasicMaterial color={accentColor} />
      </mesh>

      {/* Glass label card */}
      <Html position={[0, 4, 0]} center distanceFactor={60}>
        <div
          className="nav-marker-card"
          style={{
            borderColor: isHovered
              ? "rgba(0,255,238,0.75)"
              : "rgba(0,217,255,0.35)",
            boxShadow: isHovered
              ? "0 0 28px rgba(0,255,238,0.55), 0 8px 32px rgba(0,0,0,0.7)"
              : "0 0 16px rgba(0,217,255,0.3), 0 6px 24px rgba(0,0,0,0.65)",
          }}
          onClick={onClick}
        >
          <span
            className="nav-marker-icon"
            style={{ color: isHovered ? "#00ffee" : "#00d9ff" }}
          >
            <DoorOpen size={16} />
          </span>
          <div className="nav-marker-text">
            <span className="nav-marker-label">Go to</span>
            <span className="nav-marker-room">{destinationRoom}</span>
          </div>
          <span
            className="nav-marker-arrow"
            style={{ color: isHovered ? "#00ffee" : "rgba(255,255,255,0.5)" }}
          >
            <MoveRight size={14} />
          </span>
        </div>
      </Html>
    </group>
  );
};

const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  pano,
  onNavigate,
  allPanos = [],
  isEditMode = false,
  onCoordinateClick,
  onEditComponent,
  onDeleteComponent,
}) => {
  const sphereRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Load room components when pano changes - use useMemo to avoid effect warnings
  const roomComponents = useMemo(() => {
    return getComponentsForRoom(pano.label);
  }, [pano.label]);

  // Load navigation markers for current room
  const navMarkers = useMemo(() => {
    return getMarkersForRoom(pano.label);
  }, [pano.label]);

  const [hoveredCoords, setHoveredCoords] = useState<
    [number, number, number] | null
  >(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useRef(new THREE.Vector2());

  const createFallbackTexture = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const gradient = ctx.createLinearGradient(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      gradient.addColorStop(0, "#2c3e50");
      gradient.addColorStop(1, "#34495e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "white";
      ctx.font = "bold 48px Arial";
      ctx.textAlign = "center";
      ctx.fillText(pano.label, canvas.width / 2, canvas.height / 2 - 30);
      ctx.font = "32px Arial";
      ctx.fillStyle = "#bdc3c7";
      ctx.fillText(
        "Panorama not found",
        canvas.width / 2,
        canvas.height / 2 + 20,
      );
      ctx.fillText(pano.imagePath, canvas.width / 2, canvas.height / 2 + 60);
    }

    const fallbackTexture = new THREE.CanvasTexture(canvas);
    fallbackTexture.mapping = THREE.EquirectangularReflectionMapping;
    setTexture(fallbackTexture);
  }, [pano]);

  // Load panorama texture
  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();

    loader.load(
      pano.imagePath,
      (loadedTexture) => {
        if (isMounted) {
          loadedTexture.mapping = THREE.EquirectangularReflectionMapping;
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          setTexture(loadedTexture);
        }
      },
      undefined,
      (error) => {
        console.error("Error loading panorama:", pano.imagePath, error);
        if (isMounted) {
          createFallbackTexture();
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, [pano.imagePath, createFallbackTexture]);

  // Edit mode: Track mouse for coordinate capture
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isEditMode || !sphereRef.current) return;

      const canvas = document.querySelector("canvas");
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse.current, camera);
      const intersects = raycaster.intersectObject(sphereRef.current);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const x = parseFloat(point.x.toFixed(2));
        const y = parseFloat(point.y.toFixed(2));
        const z = parseFloat(point.z.toFixed(2));
        setHoveredCoords([x, y, z]);
      }
    },
    [isEditMode, camera, raycaster],
  );

  // Edit mode: Handle click to capture coordinates (requires Shift key)
  const handleCanvasClick = useCallback(
    (event: MouseEvent) => {
      if (isEditMode && hoveredCoords && onCoordinateClick && event.shiftKey) {
        onCoordinateClick(hoveredCoords);
      }
    },
    [isEditMode, hoveredCoords, onCoordinateClick],
  );

  // Track mouse when in edit mode
  useEffect(() => {
    if (!isEditMode) return;
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove, isEditMode]);

  // Click capture when in edit mode (requires Shift key)
  useEffect(() => {
    if (!isEditMode) return;
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.addEventListener("click", handleCanvasClick);
      return () => canvas.removeEventListener("click", handleCanvasClick);
    }
  }, [handleCanvasClick, isEditMode]);

  // Track Shift key state for edit mode
  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      setIsShiftPressed(false);
    };
  }, [isEditMode]);

  // Reset camera position when changing panos
  useEffect(() => {
    camera.position.set(0, 0, 0.1);
    camera.rotation.set(0, 0, 0);
  }, [pano.id, camera]);

  const geometry = useMemo(() => new THREE.SphereGeometry(50, 64, 64), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
      }),
    [texture],
  );

  // Get navigation destinations for current room (hardcoded + dynamic)
  const hardcodedDestinations = getRoomDestinations(pano.label);

  // Combine hardcoded markers with dynamic markers from localStorage
  const allDestinations = useMemo(() => {
    const dynamicMarkers = navMarkers.map((marker) => ({
      room: marker.toRoom,
      coords: marker.position,
    }));

    return [...hardcodedDestinations, ...dynamicMarkers];
  }, [hardcodedDestinations, navMarkers]);

  // Handle marker navigation
  const handleMarkerClick = useCallback(
    (destinationRoom: string) => {
      // Find pano with matching room label
      const targetPano = allPanos.find(
        (p) =>
          p.label.toLowerCase().trim() === destinationRoom.toLowerCase().trim(),
      );
      if (targetPano) {
        onNavigate(targetPano);
      }
    },
    [allPanos, onNavigate],
  );

  return (
    <group>
      <mesh ref={sphereRef} geometry={geometry} material={material} />

      {/* Navigation markers (hardcoded + dynamic) */}
      {allDestinations.map((destination, index) => {
        const [x, y, z] = destination.coords;
        // Normalize to unit vector direction from sphere center
        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;
        // Place marker at scaled position on sphere surface
        const markerPos: [number, number, number] = [nx * 48, ny * 48, nz * 48];

        return (
          <NavigationMarker
            key={`${destination.room}-${index}`}
            position={markerPos}
            destinationRoom={destination.room}
            onClick={() => handleMarkerClick(destination.room)}
          />
        );
      })}

      {/* Render XR Room Components */}
      {roomComponents.map((component) => {
        const [x, y, z] = component.position;
        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;
        const componentPos: [number, number, number] = [
          nx * 48,
          ny * 48,
          nz * 48,
        ];

        return (
          <XRComponentRenderer
            key={component.id}
            component={component}
            position={componentPos}
            isEditMode={isEditMode}
            onEdit={onEditComponent}
            onDelete={onDeleteComponent}
          />
        );
      })}

      <OrbitControls
        enableZoom={true}
        enablePan={false}
        enableDamping={true}
        dampingFactor={0.05}
        rotateSpeed={-0.5}
        minDistance={0.1}
        maxDistance={0.1}
      />

      {/* Edit Mode: Coordinate display */}
      {isEditMode && hoveredCoords && (
        <Html
          position={[0, 0, -50]}
          scale={1}
          style={{
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div className="edit-help-shell">
            <div className={`edit-help-panel ${isShiftPressed ? "ready" : ""}`}>
              <div className="edit-help-header">
                <span className="edit-help-icon">
                  <MousePointerClick size={18} />
                </span>
                <div className="edit-help-title-group">
                  <span className="edit-help-label">Edit Mode</span>
                  <span className="edit-help-title">
                    {isShiftPressed
                      ? "Ready to place component"
                      : "Hold SHIFT + click to place"}
                  </span>
                </div>
              </div>

              <div className="edit-help-body">
                {isShiftPressed
                  ? "Click anywhere on the panorama to drop a component or navigation marker at the highlighted position."
                  : "Move your cursor over the panorama to preview coordinates, then hold SHIFT and click to place."}
              </div>

              {/* <div className="edit-help-coords">
                [{hoveredCoords[0]}, {hoveredCoords[1]}, {hoveredCoords[2]}]
              </div> */}
            </div>
          </div>
        </Html>
      )}

      {/* Coordinate display - OLD (commented out) */}
      {/* 
        {coordinates && (
          <Html
            position={[0, 0, -50]}
            scale={1}
            style={{
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            <div
              style={{
                position: "fixed",
                top: "80px",
                left: "20px",
                background: "rgba(0, 217, 255, 0.95)",
                color: "#000",
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "monospace",
                fontWeight: "600",
                boxShadow: "0 4px 20px rgba(0, 217, 255, 0.4)",
                maxWidth: "300px",
                wordBreak: "break-all",
                zIndex: 100,
              }}
            >
              <div>Current Coordinates:</div>
              <div style={{ marginTop: "8px", fontSize: "14px" }}>
                [{coordinates[0]}, {coordinates[1]}, {coordinates[2]}]
              </div>
              <div style={{ marginTop: "8px", fontSize: "11px", opacity: 0.8 }}>
                Click to copy • Press SPACE to copy
              </div>
            </div>
          </Html>
        )}
      */}

      <ambientLight intensity={0.5} />
    </group>
  );
};

export default PanoramaViewer;
