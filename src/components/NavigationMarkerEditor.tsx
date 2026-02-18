/**
 * Navigation Marker Editor Modal
 * For selecting destination room when placing navigation markers
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DoorOpen, X, CheckCircle2, AlertCircle } from "lucide-react";
import type { NavigationMarker } from "../types/navigationMarkers";
import "../components/ComponentEditor.css"; // Reuse the glassmorphism styles

interface NavigationMarkerEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (marker: Omit<NavigationMarker, "id" | "createdAt">) => void;
  position: [number, number, number];
  fromRoom: string;
  availableRooms: string[];
}

export const NavigationMarkerEditor: React.FC<NavigationMarkerEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  position,
  fromRoom,
  availableRooms,
}) => {
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [error, setError] = useState(false);

  const handleSave = () => {
    if (!selectedRoom) {
      setError(true);
      return;
    }

    onSave({
      fromRoom,
      toRoom: selectedRoom,
      position,
    });
    setSelectedRoom("");
    setError(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 30, rotateX: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30, rotateX: 10 }}
            transition={{
              type: "spring",
              damping: 20,
              stiffness: 300,
              duration: 0.4,
            }}
          >
            <motion.div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DoorOpen size={24} />
                <h2>Navigation Marker</h2>
              </div>
              <motion.button
                className="close-btn"
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.95 }}
              >
                <X size={20} />
              </motion.button>
            </motion.div>

            <motion.div className="modal-body">
              <motion.div
                className="form-group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <label className="form-label">From Room</label>
                <motion.input
                  type="text"
                  value={fromRoom}
                  disabled
                  className="form-input disabled-input"
                  layoutId="fromRoom"
                />
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <label className="form-label">To Room (Destination)</label>
                <motion.select
                  value={selectedRoom}
                  onChange={(e) => {
                    setSelectedRoom(e.target.value);
                    setError(false);
                  }}
                  autoFocus
                  className={`form-input form-select ${error && !selectedRoom ? "error" : ""}`}
                  animate={{
                    boxShadow:
                      error && !selectedRoom
                        ? "0 0 10px rgba(255, 107, 107, 0.5)"
                        : "none",
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <option value="">Select destination room...</option>
                  {availableRooms
                    .filter((room) => room !== fromRoom)
                    .map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                </motion.select>
                {error && !selectedRoom && (
                  <motion.div
                    className="form-error"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <AlertCircle size={14} />
                    Please select a destination room
                  </motion.div>
                )}
              </motion.div>

              <motion.div
                className="position-info"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <small>
                  <strong>Position:</strong> [{position[0].toFixed(2)},
                  {position[1].toFixed(2)}, {position[2].toFixed(2)}]
                </small>
              </motion.div>
            </motion.div>

            <motion.div className="modal-footer">
              <motion.button
                className="btn btn-secondary"
                onClick={onClose}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                className="btn btn-primary"
                onClick={handleSave}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <CheckCircle2 size={16} />
                Create Marker
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
