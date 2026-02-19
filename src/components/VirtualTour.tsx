import React, { useState, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { motion } from "framer-motion";
import { Edit3, Eye, RotateCcw, Package, DoorOpen } from "lucide-react";
import "./VirtualTour.css";
import PanoramaViewer from "./PanoramaViewer.tsx";
import TourNavigation from "./TourNavigation.tsx";
import LoadingScreen from "./LoadingScreen.tsx";
import { ComponentEditor } from "./ComponentEditor.tsx";
import { NavigationMarkerEditor } from "./NavigationMarkerEditor.tsx";
import {
  loadZindData,
  parseZindData,
  groupPanosByRoom,
  preloadPanoramaImages,
} from "../utils/zindDataParser";
import type { ParsedPano, RoomGroup } from "../utils/zindDataParser";
import type { RoomComponent } from "../types/roomComponents";
import {
  addComponent,
  updateComponent,
  deleteComponent,
} from "../utils/componentStorage";
import type { NavigationMarker } from "../types/navigationMarkers";
import { addNavigationMarker } from "../utils/navigationMarkerStorage";

const VirtualTour: React.FC = () => {
  const [allPanos, setAllPanos] = useState<ParsedPano[]>([]);
  const [roomGroups, setRoomGroups] = useState<RoomGroup[]>([]);
  const [currentPano, setCurrentPano] = useState<ParsedPano | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{
    loaded: number;
    total: number;
  }>({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // XR Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editModeType, setEditModeType] = useState<"component" | "navigation">(
    "component",
  );
  const [showComponentEditor, setShowComponentEditor] = useState(false);
  const [showNavMarkerEditor, setShowNavMarkerEditor] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<
    [number, number, number] | null
  >(null);
  const [editingComponent, setEditingComponent] =
    useState<RoomComponent | null>(null);
  const [componentRefresh, setComponentRefresh] = useState(0);
  const [navMarkerRefresh, setNavMarkerRefresh] = useState(0);

  // Load and parse ZInD data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await loadZindData();
        const panos = parseZindData(data);
        const rooms = groupPanosByRoom(panos);

        console.log(
          `Loaded ${panos.length} panoramas in ${rooms.length} rooms`,
        );

        setAllPanos(panos);
        setRoomGroups(rooms);

        // Start with living room (or first room if living room not found)
        const livingRoom = rooms.find(
          (r) => r.label.toLowerCase() === "living room",
        );
        const startPano =
          livingRoom?.primaryPano || rooms[0]?.primaryPano || panos[0];
        setCurrentPano(startPano);

        // Preload all panorama images to prevent white flashes
        console.log("Preloading panorama images...");
        setLoadingProgress({ loaded: 0, total: panos.length });
        await preloadPanoramaImages(panos, (loaded, total) => {
          setLoadingProgress({ loaded, total });
          console.log(`Preloaded ${loaded}/${total} panoramas`);
        });
        console.log("All panoramas preloaded!");

        setLoading(false);
      } catch (err) {
        console.error("Error loading ZInD data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handlePanoChange = (pano: ParsedPano) => {
    setCurrentPano(pano);
  };

  const handleRoomChange = (roomLabel: string) => {
    const room = roomGroups.find((r) => r.label === roomLabel);
    if (room && room.primaryPano) {
      setCurrentPano(room.primaryPano);
    }
  };

  // Handle coordinate click in edit mode
  const handleCoordinateClick = (coords: [number, number, number]) => {
    setSelectedPosition(coords);

    if (editModeType === "component") {
      setShowComponentEditor(true);
    } else {
      setShowNavMarkerEditor(true);
    }
  };

  // Save new or edited component
  const handleSaveComponent = (
    componentData: Omit<RoomComponent, "id" | "createdAt">,
  ) => {
    if (editingComponent) {
      // Update existing component
      updateComponent(editingComponent.id, componentData);
      setEditingComponent(null);
    } else {
      // Add new component
      const newComponent: RoomComponent = {
        ...componentData,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      addComponent(newComponent);
    }

    setComponentRefresh((prev) => prev + 1); // Trigger re-render in PanoramaViewer
    setShowComponentEditor(false);
    setSelectedPosition(null);
  };

  // Edit existing component
  const handleEditComponent = (component: RoomComponent) => {
    setEditingComponent(component);
    setSelectedPosition(component.position);
    setShowComponentEditor(true);
  };

  // Delete component
  const handleDeleteComponent = (componentId: string) => {
    if (window.confirm("Delete this component?")) {
      deleteComponent(componentId);
      setComponentRefresh((prev) => prev + 1);
    }
  };

  // Save new navigation marker
  const handleSaveNavMarker = (
    markerData: Omit<NavigationMarker, "id" | "createdAt">,
  ) => {
    const newMarker: NavigationMarker = {
      ...markerData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    addNavigationMarker(newMarker);
    setNavMarkerRefresh((prev) => prev + 1); // Trigger re-render in PanoramaViewer
    setShowNavMarkerEditor(false);
    setSelectedPosition(null);
  };

  // Reset XR components (clear localStorage for XR components only, NOT navigation markers)
  const handleResetXRComponents = () => {
    if (
      window.confirm(
        "Clear all XR components from this world? (Navigation markers will be preserved)",
      )
    ) {
      import("../utils/componentStorage").then(({ clearAllComponents }) => {
        clearAllComponents();
        setComponentRefresh((prev) => prev + 1);
      });
    }
  };

  if (loading) {
    return (
      <LoadingScreen
        message="Loading virtual tour..."
        progress={loadingProgress}
      />
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Error Loading Tour</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!currentPano) {
    return (
      <div className="error-screen">
        <h2>No Panoramas Found</h2>
        <p>Please check your data files.</p>
      </div>
    );
  }

  return (
    <div className="virtual-tour">
      <div className={`tour-canvas-container ${isEditMode ? "edit-mode" : ""}`}>
        <Canvas>
          <Suspense fallback={null}>
            <PanoramaViewer
              pano={currentPano}
              navigationHotspots={[]}
              onNavigate={handlePanoChange}
              allPanos={allPanos}
              isEditMode={isEditMode}
              onCoordinateClick={handleCoordinateClick}
              onEditComponent={handleEditComponent}
              onDeleteComponent={handleDeleteComponent}
              key={`${currentPano.id}-${componentRefresh}-${navMarkerRefresh}`}
            />
          </Suspense>
        </Canvas>
      </div>

      <TourNavigation
        roomGroups={roomGroups}
        currentPano={currentPano}
        onRoomChange={handleRoomChange}
      />

      {/* Edit Mode Toggle Button */}
      <motion.button
        className={`edit-mode-toggle ${isEditMode ? "active" : ""}`}
        onClick={() => setIsEditMode(!isEditMode)}
        title={isEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
        layoutId="editToggle"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {isEditMode ? (
          <Eye size={24} strokeWidth={2} />
        ) : (
          <Edit3 size={24} strokeWidth={2} />
        )}
      </motion.button>

      {/* Reset XR Components Button */}
      {isEditMode && (
        <motion.button
          className="reset-xr-button"
          onClick={handleResetXRComponents}
          title="Clear all XR components (navigation markers preserved)"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <RotateCcw size={20} strokeWidth={2} />
        </motion.button>
      )}

      {/* Edit Mode Type Switcher */}
      {isEditMode && (
        <motion.div
          className="edit-mode-switcher"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
        >
          <motion.button
            className={`mode-btn ${editModeType === "component" ? "active" : ""}`}
            onClick={() => setEditModeType("component")}
            title="Place XR Components"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Package size={16} />
            Components
          </motion.button>
          <motion.button
            className={`mode-btn ${editModeType === "navigation" ? "active" : ""}`}
            onClick={() => setEditModeType("navigation")}
            title="Place Navigation Markers"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <DoorOpen size={16} />
            Navigation
          </motion.button>
        </motion.div>
      )}

      {/* Info Panel */}
      <div className="info-panel">
        <h3>{currentPano.label}</h3>
        <p className="pano-info">
          Floor {currentPano.floorNumber} • Camera Height:{" "}
          {currentPano.cameraHeight.toFixed(2)}m
        </p>
        <div className="stats">
          <span>{allPanos.length} total views</span>
          <span>{roomGroups.length} rooms</span>
        </div>
      </div>

      {/* Component Editor Modal */}
      {selectedPosition && currentPano && (
        <ComponentEditor
          isOpen={showComponentEditor}
          onClose={() => {
            setShowComponentEditor(false);
            setSelectedPosition(null);
            setEditingComponent(null);
          }}
          onSave={handleSaveComponent}
          position={selectedPosition}
          roomLabel={currentPano.label}
          editingComponent={editingComponent}
        />
      )}

      {/* Navigation Marker Editor Modal */}
      {selectedPosition && currentPano && (
        <NavigationMarkerEditor
          isOpen={showNavMarkerEditor}
          onClose={() => {
            setShowNavMarkerEditor(false);
            setSelectedPosition(null);
          }}
          onSave={handleSaveNavMarker}
          position={selectedPosition}
          fromRoom={currentPano.label}
          availableRooms={roomGroups.map((r) => r.label)}
        />
      )}
    </div>
  );
};

export default VirtualTour;
