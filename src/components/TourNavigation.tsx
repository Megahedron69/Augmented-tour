import React, { useState } from "react";
import type { ParsedPano, RoomGroup } from "../utils/zindDataParser";

interface TourNavigationProps {
  roomGroups: RoomGroup[];
  currentPano: ParsedPano;
  onRoomChange: (roomLabel: string) => void;
}

const TourNavigation: React.FC<TourNavigationProps> = ({
  roomGroups,
  currentPano,
  onRoomChange,
}) => {
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  return (
    <div className="tour-navigation">
      {/* Main navigation controls */}
      <div className="nav-controls">
        <div className="current-location">
          <span className="room-name">{currentPano.label}</span>
        </div>
      </div>

      {/* Room selector */}
      <div className="selector-section">
        <button
          className="selector-toggle"
          onClick={() => {
            setShowRoomSelector(!showRoomSelector);
          }}
        >
          📍 Rooms ({roomGroups.length})
        </button>

        {showRoomSelector && (
          <div className="selector-panel rooms-panel">
            <div className="panel-header">
              <h4>Select Room</h4>
              <button onClick={() => setShowRoomSelector(false)}>✕</button>
            </div>
            <div className="room-grid">
              {roomGroups.map((room) => (
                <button
                  key={room.label}
                  className={`room-card ${
                    room.label === currentPano.label ? "active" : ""
                  }`}
                  onClick={() => {
                    onRoomChange(room.label);
                    setShowRoomSelector(false);
                  }}
                >
                  <div className="room-name">{room.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TourNavigation;
