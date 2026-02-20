/**
 * 2D Floor Plan Component
 * Interactive map showing all rooms, connections, and components
 */

import React, { useMemo, useCallback, useState } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { X } from "lucide-react";
import type { RoomGroup } from "../utils/zindDataParser";
import { ROOM_MARKERS } from "../constants/roomMarkers";
import { getComponentsForRoom } from "../utils/componentStorage";
import type { RoomComponent } from "../types/roomComponents";
import { RoomNode } from "./RoomNode.tsx";
import "./FloorPlan2D.css";

interface FloorPlan2DProps {
  roomGroups: RoomGroup[];
  currentRoom: string;
  onRoomClick: (roomLabel: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

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

const getComponentSummary = (component: RoomComponent) => {
  const { data, type } = component;
  const title = data.title || type;

  if (data.text) {
    return { type, title, text: data.text };
  }

  if (data.message) {
    return { type, title, text: data.message };
  }

  if (data.caption) {
    return { type, title, text: data.caption };
  }

  if (data.status) {
    return { type, title, text: `Status: ${data.status}` };
  }

  if (type === "instruction" && data.steps?.length) {
    return { type, title, text: `Steps: ${data.steps.length}` };
  }

  if (type === "api" && data._api?.renderAs) {
    return { type, title, text: `API -> ${data._api.renderAs}` };
  }

  return { type, title };
};

/**
 * Simple force-directed layout to position rooms
 */
const calculateRoomPositions = (
  roomGroups: RoomGroup[],
  connections: [string, string][],
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  const rooms = roomGroups.map((r) => r.label.toLowerCase());

  // Initialize with circular layout
  const centerX = 500;
  const centerY = 360;
  const radius = 340;

  rooms.forEach((room, i) => {
    const angle = (i / rooms.length) * 2 * Math.PI;
    positions.set(room, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  // Simple force-directed adjustment (50 iterations)
  for (let iter = 0; iter < 50; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();

    // Initialize forces
    rooms.forEach((room) => {
      forces.set(room, { fx: 0, fy: 0 });
    });

    // Repulsion between all nodes
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const room1 = rooms[i];
        const room2 = rooms[j];
        const pos1 = positions.get(room1)!;
        const pos2 = positions.get(room2)!;

        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist > 0 && dist < 420) {
          const repulsion = 12000 / distSq;
          const fx = (dx / dist) * repulsion;
          const fy = (dy / dist) * repulsion;

          const f1 = forces.get(room1)!;
          const f2 = forces.get(room2)!;
          f1.fx -= fx;
          f1.fy -= fy;
          f2.fx += fx;
          f2.fy += fy;
        }
      }
    }

    // Attraction along connections
    connections.forEach(([from, to]) => {
      const pos1 = positions.get(from);
      const pos2 = positions.get(to);
      if (!pos1 || !pos2) return;

      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const attraction = (dist - 220) * 0.03;
        const fx = (dx / dist) * attraction;
        const fy = (dy / dist) * attraction;

        const f1 = forces.get(from)!;
        const f2 = forces.get(to)!;
        f1.fx += fx;
        f1.fy += fy;
        f2.fx -= fx;
        f2.fy -= fy;
      }
    });

    // Apply forces with damping
    const damping = 0.6;
    rooms.forEach((room) => {
      const pos = positions.get(room)!;
      const force = forces.get(room)!;

      pos.x += force.fx * damping;
      pos.y += force.fy * damping;

      // Keep within bounds
      pos.x = Math.max(80, Math.min(920, pos.x));
      pos.y = Math.max(80, Math.min(680, pos.y));
    });
  }

  return positions;
};

export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  roomGroups,
  currentRoom,
  onRoomClick,
  onClose,
  compact = false,
}) => {
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  // Build graph data
  const { nodes, edges } = useMemo(() => {
    // Extract connections from ROOM_MARKERS
    const connections: [string, string][] = [];
    Object.entries(ROOM_MARKERS).forEach(([fromRoom, destinations]) => {
      Object.keys(destinations).forEach((toRoom) => {
        connections.push([fromRoom.toLowerCase(), toRoom.toLowerCase()]);
      });
    });

    // Calculate positions
    const positions = calculateRoomPositions(roomGroups, connections);

    const connectionSet = new Set(
      connections.map(([from, to]) => `${from}->${to}`),
    );

    // Create nodes
    const flowNodes: Node<RoomNodeData>[] = roomGroups.map((room) => {
      const roomKey = room.label.toLowerCase();
      const components = getComponentsForRoom(room.label) || [];
      const pos = positions.get(roomKey) || { x: 400, y: 300 };

      return {
        id: roomKey,
        type: "roomNode",
        position: pos,
        data: {
          label: room.label,
          components: components.map(getComponentSummary),
          isCurrentRoom: room.label.toLowerCase() === currentRoom.toLowerCase(),
          onClick: () => onRoomClick(room.label),
          onHover: () => setHoveredRoom(roomKey),
          onLeave: () => setHoveredRoom(null),
        },
      };
    });

    // Create edges: thin, curved, bidirectional markers for clarity
    const flowEdges: Edge[] = connections.map(([from, to], i) => {
      const isBidirectional = hoveredRoom
        ? (from === hoveredRoom && connectionSet.has(`${to}->${from}`)) ||
          (to === hoveredRoom && connectionSet.has(`${from}->${to}`))
        : false;
      const isIncoming = hoveredRoom
        ? to === hoveredRoom && !isBidirectional
        : false;
      const isOutgoing = hoveredRoom
        ? from === hoveredRoom && !isBidirectional
        : false;
      const isDimmed = hoveredRoom
        ? !isIncoming && !isOutgoing && !isBidirectional
        : false;
      const edgeColor = isBidirectional
        ? "#ffb347"
        : isIncoming
          ? "#ff6bd6"
          : isOutgoing
            ? "#00ffee"
            : "#00d9ff";

      return {
        id: `edge-${i}`,
        source: from,
        target: to,
        type: "smoothstep",
        animated: Boolean(
          hoveredRoom && (isIncoming || isOutgoing || isBidirectional),
        ),
        className: isIncoming
          ? "edge-incoming"
          : isOutgoing
            ? "edge-outgoing"
            : isBidirectional
              ? "edge-bidirectional"
              : isDimmed
                ? "edge-dim"
                : "",
        style: {
          stroke: edgeColor,
          strokeWidth: isIncoming || isOutgoing || isBidirectional ? 2 : 1.5,
          opacity: isDimmed ? 0.08 : isIncoming || isOutgoing ? 0.9 : 0.45,
        },
        markerStart: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 10,
          height: 10,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 10,
          height: 10,
        },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [roomGroups, currentRoom, onRoomClick, hoveredRoom]);

  const nodeTypes: NodeTypes = useMemo(() => ({ roomNode: RoomNode }), []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<RoomNodeData>) => {
      node.data.onClick();
    },
    [],
  );

  return (
    <div className={`floor-plan-2d ${compact ? "compact" : ""}`}>
      {/* Close Button */}
      {!compact && onClose && (
        <button
          className="floor-plan-close"
          onClick={onClose}
          title="Close Floor Plan"
        >
          <X size={24} />
        </button>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        minZoom={0.5}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1a2e"
        />
        {!compact && <Controls />}
      </ReactFlow>

      {!compact && (
        <div className="floor-plan-legend">
          <div className="legend-header">Legend</div>
          <div className="legend-item">
            <div
              className="legend-badge"
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "9999px",
                background: "linear-gradient(135deg, #00ffee, #7af7ff)",
                boxShadow: "0 0 8px rgba(0, 255, 238, 0.3)",
              }}
            ></div>
            <span>XR Components Active in Room</span>
          </div>
          <div className="legend-item">
            <div
              className="legend-line"
              style={{ background: "#00ffee" }}
            ></div>
            <span>Outgoing Paths (hover)</span>
          </div>
          <div className="legend-item">
            <div
              className="legend-line"
              style={{ background: "#ff6bd6" }}
            ></div>
            <span>Incoming Paths (hover)</span>
          </div>
          <div className="legend-item">
            <div
              className="legend-line"
              style={{ background: "#ffb347" }}
            ></div>
            <span>Bidirectional Paths</span>
          </div>
          <div className="legend-item">
            <div
              className="legend-square current"
              style={{ borderColor: "#00ffee" }}
            ></div>
            <span>Current Room</span>
          </div>
          <div className="legend-note">
            💡 Hover over rooms to see component details
          </div>
        </div>
      )}
    </div>
  );
};
