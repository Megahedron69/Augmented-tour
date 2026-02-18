import React, { useState, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import "./VirtualTour.css";
import PanoramaViewer from "./PanoramaViewer.tsx";
import TourNavigation from "./TourNavigation.tsx";
import LoadingScreen from "./LoadingScreen.tsx";
import {
  loadZindData,
  parseZindData,
  groupPanosByRoom,
} from "../utils/zindDataParser";
import type { ParsedPano, RoomGroup } from "../utils/zindDataParser";

const VirtualTour: React.FC = () => {
  const [allPanos, setAllPanos] = useState<ParsedPano[]>([]);
  const [roomGroups, setRoomGroups] = useState<RoomGroup[]>([]);
  const [currentPano, setCurrentPano] = useState<ParsedPano | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return <LoadingScreen message="Loading virtual tour..." />;
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
      <div className="tour-canvas-container">
        <Canvas>
          <Suspense fallback={null}>
            <PanoramaViewer
              pano={currentPano}
              navigationHotspots={[]}
              onNavigate={handlePanoChange}
              allPanos={allPanos}
            />
          </Suspense>
        </Canvas>
      </div>

      <TourNavigation
        roomGroups={roomGroups}
        currentPano={currentPano}
        onRoomChange={handleRoomChange}
      />

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
    </div>
  );
};

export default VirtualTour;
