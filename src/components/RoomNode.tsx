/**
 * Custom Room Node for React Flow
 * Displays room information with component details
 */

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Sparkles, Info, DoorOpen } from "lucide-react";
import ReactDOM from "react-dom";

interface RoomNodeData {
  label: string;
  components: Array<{
    type: string;
    title: string;
    text?: string;
  }>;
  isCurrentRoom: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}

export const RoomNode = memo<NodeProps<RoomNodeData>>(({ data }) => {
  const { label, components, isCurrentRoom } = data;
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`room-node ${isCurrentRoom ? "current" : ""}`}
      onClick={data.onClick}
      onMouseEnter={() => {
        setShowTooltip(true);
        data.onHover();
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        data.onLeave();
      }}
    >
      {/* Invisible handles for connections */}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* Room square (changed from circle) */}
      <div className="room-square">
        {isCurrentRoom && <div className="current-chip">You</div>}
        {/* Room name with icon */}
        <div className="room-label-wrapper">
          <DoorOpen className="room-label-icon" size={14} />
          <div className="room-label">{label}</div>
        </div>

        {/* XR component indicator */}
        {components.length > 0 && (
          <div className="component-indicator">
            <Sparkles size={11} />
            <span className="indicator-label">XR</span>
            <span className="indicator-count">{components.length}</span>
          </div>
        )}
      </div>

      {/* Component details tooltip */}
      {showTooltip &&
        components.length > 0 &&
        ReactDOM.createPortal(
          <div
            className="component-tooltip"
            style={{
              top: `${document.querySelector(".room-node:hover")?.getBoundingClientRect().bottom ?? 0 + 10}px`,
            }}
          >
            <div className="tooltip-header">
              <Info size={12} />
              <span>XR Components ({components.length})</span>
            </div>
            <div className="tooltip-list">
              {components.map((comp, i) => (
                <div key={i} className="tooltip-item">
                  <span className={`comp-dot comp-type-${comp.type}`} />
                  <div className="comp-text">
                    <div className="comp-title">{comp.title}</div>
                    {comp.text && (
                      <div className="comp-subtext">{comp.text}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});

RoomNode.displayName = "RoomNode";
