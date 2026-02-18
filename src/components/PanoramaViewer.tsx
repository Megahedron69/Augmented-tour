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
import type { ParsedPano } from "../utils/zindDataParser";
import { getRoomDestinations } from "../constants/roomMarkers";

interface PanoramaViewerProps {
  pano: ParsedPano;
  navigationHotspots: unknown[];
  onNavigate: (pano: ParsedPano) => void;
  allPanos?: ParsedPano[];
}

/**
 * Modern animated navigation marker component
 */
const NavigationMarker: React.FC<{
  position: [number, number, number];
  destinationRoom: string;
  onClick: () => void;
}> = ({ position, destinationRoom, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Animation loop
  useFrame((state) => {
    if (!groupRef.current) return;

    // Rotate group slightly
    groupRef.current.rotation.z += 0.005;

    // Core pulse
    if (coreRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      coreRef.current.scale.set(scale, scale, scale);
    }

    // Ring animations with different phases
    if (
      ring1Ref.current &&
      ring1Ref.current.material instanceof THREE.Material
    ) {
      const scale1 = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.4;
      ring1Ref.current.scale.set(scale1, scale1, 1);
      const material = ring1Ref.current.material as THREE.Material & {
        opacity: number;
      };
      material.opacity = 0.8 - (scale1 - 1) * 0.4;
    }

    if (
      ring2Ref.current &&
      ring2Ref.current.material instanceof THREE.Material
    ) {
      const scale2 =
        1 + Math.sin(state.clock.elapsedTime * 2 + Math.PI / 3) * 0.4;
      ring2Ref.current.scale.set(scale2, scale2, 1);
      const material = ring2Ref.current.material as THREE.Material & {
        opacity: number;
      };
      material.opacity = 0.8 - (scale2 - 1) * 0.4;
    }

    if (
      ring3Ref.current &&
      ring3Ref.current.material instanceof THREE.Material
    ) {
      const scale3 =
        1 + Math.sin(state.clock.elapsedTime * 2 + (Math.PI * 2) / 3) * 0.4;
      ring3Ref.current.scale.set(scale3, scale3, 1);
      const material = ring3Ref.current.material as THREE.Material & {
        opacity: number;
      };
      material.opacity = 0.8 - (scale3 - 1) * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Central glowing sphere */}
      <mesh
        ref={coreRef}
        onClick={onClick}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial color={isHovered ? 0x00ffff : 0x00d9ff} />
      </mesh>

      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[1.25, 32, 32]} />
        <meshBasicMaterial color={0x00d9ff} transparent opacity={0.3} />
      </mesh>

      {/* Pulsing rings */}
      <mesh ref={ring1Ref} onClick={onClick}>
        <torusGeometry args={[2.5, 0.15, 32, 32]} />
        <meshBasicMaterial color={0x00d9ff} transparent />
      </mesh>

      <mesh ref={ring2Ref} onClick={onClick}>
        <torusGeometry args={[2.5, 0.15, 32, 32]} />
        <meshBasicMaterial color={0x0099ff} transparent />
      </mesh>

      <mesh ref={ring3Ref} onClick={onClick}>
        <torusGeometry args={[2.5, 0.15, 32, 32]} />
        <meshBasicMaterial color={0x00aaff} transparent />
      </mesh>

      {/* Label */}
      <Html position={[0, 3.5, 0]} scale={1}>
        <div
          style={{
            background: isHovered
              ? "rgba(0, 255, 255, 0.95)"
              : "rgba(0, 217, 255, 0.9)",
            color: "#000",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "Arial, sans-serif",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            cursor: "pointer",
            textTransform: "capitalize",
            boxShadow: isHovered
              ? "0 4px 20px rgba(0, 255, 255, 0.6)"
              : "0 4px 20px rgba(0, 217, 255, 0.3)",
            transition: "all 0.2s ease",
            pointerEvents: "none",
          }}
        >
          → {destinationRoom}
        </div>
      </Html>
    </group>
  );
};

const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  pano,
  onNavigate,
  allPanos = [],
}) => {
  const sphereRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const { camera } = useThree();

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

  // // DEBUGGING: Manual coordinate capture (commented out - all rooms mapped)
  // const handleMouseMove = useCallback(
  //   (event: MouseEvent) => {
  //     if (!sphereRef.current) return;
  //
  //     const canvas = document.querySelector("canvas");
  //     if (!canvas) return;
  //
  //     const rect = canvas.getBoundingClientRect();
  //     mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  //     mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  //
  //     raycaster.setFromCamera(mouse.current, camera);
  //     const intersects = raycaster.intersectObject(sphereRef.current);
  //
  //     if (intersects.length > 0) {
  //       const point = intersects[0].point;
  //       const x = parseFloat(point.x.toFixed(2));
  //       const y = parseFloat(point.y.toFixed(2));
  //       const z = parseFloat(point.z.toFixed(2));
  //       const coords: [number, number, number] = [x, y, z];
  //       setCoordinates(coords);
  //       onCoordinatesUpdate?.(coords);
  //     }
  //   },
  //   [camera, raycaster, onCoordinatesUpdate],
  // );
  //
  // // Handle click to capture coordinates
  // const handleCanvasClick = useCallback(() => {
  //   if (coordinates) {
  //     const coordString = `[${coordinates[0]}, ${coordinates[1]}, ${coordinates[2]}]`;
  //     navigator.clipboard.writeText(coordString);
  //     console.log(`✅ Copied to clipboard: ${coordString}`);
  //     console.log(`Room: ${pano.label}`);
  //   }
  // }, [coordinates, pano.label]);
  //
  // // Handle spacebar or other keys
  // useEffect(() => {
  //   const handleKeyDown = (event: KeyboardEvent) => {
  //     if (event.code === "Space" && coordinates) {
  //       const coordString = `[${coordinates[0]}, ${coordinates[1]}, ${coordinates[2]}]`;
  //       navigator.clipboard.writeText(coordString);
  //       console.log(`✅ Copied to clipboard: ${coordString}`);
  //       console.log(`Room: ${pano.label}`);
  //       event.preventDefault();
  //     }
  //   };
  //
  //   window.addEventListener("keydown", handleKeyDown);
  //   return () => window.removeEventListener("keydown", handleKeyDown);
  // }, [coordinates, pano.label]);
  //
  // // Track mouse
  // useEffect(() => {
  //   window.addEventListener("mousemove", handleMouseMove);
  //   return () => window.removeEventListener("mousemove", handleMouseMove);
  // }, [handleMouseMove]);
  //
  // // Click capture
  // useEffect(() => {
  //   const canvas = document.querySelector("canvas");
  //   if (canvas) {
  //     canvas.addEventListener("click", handleCanvasClick);
  //     return () => canvas.removeEventListener("click", handleCanvasClick);
  //   }
  // }, [handleCanvasClick]);

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

  // Get navigation destinations for current room
  const destinations = getRoomDestinations(pano.label);

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

      {/* Navigation markers */}
      {destinations.map((destination) => {
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
            key={destination.room}
            position={markerPos}
            destinationRoom={destination.room}
            onClick={() => handleMarkerClick(destination.room)}
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

      {/* Coordinate display - COMMENTED OUT (all rooms mapped) */}
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
