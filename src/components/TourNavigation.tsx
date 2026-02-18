import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X } from "lucide-react";
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
      {/* Room selector toggle */}
      <div className="selector-section">
        <motion.button
          className="selector-toggle"
          onClick={() => setShowRoomSelector(!showRoomSelector)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <MapPin size={16} />
          Rooms ({roomGroups.length})
        </motion.button>
      </div>

      {/* Room selector modal — portalled to body to escape transformed parent */}
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
                        onRoomChange(room.label);
                        setShowRoomSelector(false);
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: idx * 0.04 }}
                      whileHover={{ scale: 1.03, y: -3 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="room-name">{room.label}</div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default TourNavigation;
