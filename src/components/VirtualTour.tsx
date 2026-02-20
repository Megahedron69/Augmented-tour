import React, { useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import {
  Edit3,
  Eye,
  RotateCcw,
  Package,
  DoorOpen,
  Map,
  MapPin,
  X,
} from "lucide-react";
import "./VirtualTour.css";
import PanoramaViewer from "./PanoramaViewer.tsx";
import LoadingScreen from "./LoadingScreen.tsx";
import { ComponentEditor } from "./ComponentEditor.tsx";
import { NavigationMarkerEditor } from "./NavigationMarkerEditor.tsx";
import { FloorPlan2D } from "./FloorPlan2D.tsx";
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

  // Floor Plan State
  const [showFloorPlan, setShowFloorPlan] = useState(false);

  // Room Selector State
  const [showRoomSelector, setShowRoomSelector] = useState(false);

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

      <div className="top-right-controls">
        {/* Floor Plan Toggle Button */}
        <motion.button
          className={`floor-plan-toggle ${showFloorPlan ? "active" : ""}`}
          onClick={() => setShowFloorPlan(!showFloorPlan)}
          title={showFloorPlan ? "Close Floor Plan" : "Open Floor Plan"}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Map size={24} strokeWidth={2} />
        </motion.button>

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
      </div>

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
      <motion.div
        className="info-panel"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2, type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="info-panel-header">
          <h3>
            {currentPano.label.charAt(0).toUpperCase() +
              currentPano.label.slice(1)}
          </h3>
          <motion.button
            className="room-selector-btn"
            onClick={() => setShowRoomSelector(!showRoomSelector)}
            title="Select Room"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <MapPin size={18} />
          </motion.button>
        </div>
        <p className="pano-info">
          Floor {currentPano.floorNumber} • Camera Height:{" "}
          {currentPano.cameraHeight.toFixed(2)}m
        </p>
        <div className="stats">
          <span>{allPanos.length} total views</span>
          <span>{roomGroups.length} rooms</span>
        </div>
      </motion.div>

      {/* Room Selector Modal - portalled to body to escape transformed parent */}
      {createPortal(
        <AnimatePresence>
          {showRoomSelector && (
            <>
              {/* Backdrop */}
              <motion.div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                  backdropFilter: "blur(6px)",
                  zIndex: 999,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRoomSelector(false)}
              />

              {/* Panel */}
              <motion.div
                className="selector-panel rooms-panel"
                style={{
                  position: "fixed",
                  top: "50%",
                  left: "50%",
                  zIndex: 1000,
                }}
                initial={{ opacity: 0, scale: 0.94, x: "-50%", y: "-46%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.94, x: "-50%", y: "-46%" }}
                transition={{ type: "spring", damping: 22, stiffness: 320 }}
              >
                <div className="panel-header">
                  <h4>Select Room</h4>
                  <motion.button
                    onClick={() => setShowRoomSelector(false)}
                    className="close-panel-btn"
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X size={18} />
                  </motion.button>
                </div>
                <div className="room-grid">
                  {roomGroups.map((room, idx) => (
                    <motion.button
                      key={room.label}
                      className={`room-card ${room.label === currentPano.label ? "active" : ""}`}
                      onClick={() => {
                        handleRoomChange(room.label);
                        setShowRoomSelector(false);
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: idx * 0.04 }}
                      whileHover={{ scale: 1.03, y: -3 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="room-name">
                        {room.label.charAt(0).toUpperCase() +
                          room.label.slice(1)}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

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

      {/* Floor Plan Overlay */}
      <AnimatePresence>
        {showFloorPlan && (
          <motion.div
            className="floor-plan-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FloorPlan2D
              roomGroups={roomGroups}
              currentRoom={currentPano?.label || ""}
              onRoomClick={handleRoomChange}
              onClose={() => setShowFloorPlan(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VirtualTour;
