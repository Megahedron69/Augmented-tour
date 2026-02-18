/**
 * XR Component Renderer
 * Renders different types of interactive 3D annotations with
 * modern glassmorphism cards, lucide icons and micro-animations.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  ClipboardList,
  AlertTriangle,
  Image as ImageIcon,
  Edit3,
  Trash2,
  Globe,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import type { RoomComponent, ComponentData } from "../types/roomComponents";
import { getStatusColor, getAlertColor } from "../types/roomComponents";
import "./XRComponentRenderer.css";

interface XRComponentRendererProps {
  component: RoomComponent;
  position: [number, number, number];
  onEdit?: (component: RoomComponent) => void;
  onDelete?: (id: string) => void;
  isEditMode?: boolean;
}

export const XRComponentRenderer: React.FC<XRComponentRendererProps> = ({
  component,
  position,
  onEdit,
  onDelete,
  isEditMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // ── API fetch state ──────────────────────────────────────────────────────
  const [apiData, setApiData] = useState<ComponentData | null>(null);
  const [apiStatus, setApiStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApi = useCallback(async () => {
    const cfg = component.data._api;
    if (!cfg?.url) return;
    setApiStatus("loading");
    try {
      const res = await fetch(cfg.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      // Merge the raw object into ComponentData shape, preserving existing data fields
      setApiData({ ...component.data, ...json });
      setApiStatus("ok");
      setApiError(null);
      setLastFetched(Date.now());
    } catch (err) {
      setApiStatus("error");
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }, [component.data]);

  useEffect(() => {
    if (component.type !== "api") return;
    fetchApi();
    const interval = component.data._api?.refreshInterval ?? 0;
    if (interval > 0) {
      intervalRef.current = setInterval(fetchApi, interval * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    component.type,
    component.data._api?.url,
    component.data._api?.refreshInterval,
    fetchApi,
  ]);

  // Stale badge: show when data is older than 1.5× refresh interval
  const isStale = (() => {
    if (!lastFetched || !component.data._api?.refreshInterval) return false;
    return (
      Date.now() - lastFetched > component.data._api.refreshInterval * 1500
    );
  })();

  const cardMotion = {
    initial: { opacity: 0, y: 8, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: "spring", damping: 18, stiffness: 260 },
    whileHover: { scale: 1.03, y: -2 },
  } as const;

  const editControls = isEditMode ? (
    <div className="xr-card-actions-inline">
      <button
        type="button"
        className="xr-card-action-btn xr-card-action-btn--edit"
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.(component);
        }}
      >
        <Edit3 size={13} />
        <span>Edit</span>
      </button>
      <button
        type="button"
        className="xr-card-action-btn xr-card-action-btn--delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(component.id);
        }}
      >
        <Trash2 size={13} />
        <span>Delete</span>
      </button>
    </div>
  ) : null;

  const renderContent = () => {
    switch (component.type) {
      case "infobox":
        return (
          <motion.div
            className="xr-card xr-card--infobox"
            style={{
              // allow per-component accent override
              borderColor: component.data.color || "#00d9ff",
            }}
            {...cardMotion}
            onClick={() => setIsExpanded(!isExpanded)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="xr-card-header">
              <span className="xr-card-icon">
                <Info size={18} />
              </span>
              <div className="xr-card-title-group">
                <span className="xr-card-label">Info</span>
                <span className="xr-card-title">
                  {component.data.title || "Information"}
                </span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && component.data.text && (
                <motion.div
                  className="xr-card-body"
                  key="infobox-body"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {component.data.text}
                </motion.div>
              )}
            </AnimatePresence>
            {editControls}
          </motion.div>
        );

      case "status": {
        const statusColor = getStatusColor(component.data.status || "working");
        return (
          <motion.div
            className="xr-card xr-card--status"
            style={{ borderColor: statusColor }}
            {...cardMotion}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="xr-card-header">
              <span
                className="xr-status-dot xr-pulse-glow"
                style={{ color: statusColor }}
              />
              <div className="xr-card-title-group">
                <span className="xr-card-label">Status</span>
                <span className="xr-card-title">
                  {component.data.title || "System"}
                </span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  className="xr-card-body xr-card-body--status"
                  key="status-body"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  style={{ color: statusColor }}
                >
                  Status: {component.data.status?.toUpperCase() || "WORKING"}
                </motion.div>
              )}
            </AnimatePresence>
            {editControls}
          </motion.div>
        );
      }

      case "instruction":
        return (
          <motion.div
            className="xr-card xr-card--instruction"
            {...cardMotion}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="xr-card-header">
              <span className="xr-card-icon">
                <ClipboardList size={18} />
              </span>
              <div className="xr-card-title-group">
                <span className="xr-card-label">Instructions</span>
                <span className="xr-card-title">
                  {component.data.title || "Steps"}
                </span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && component.data.steps && (
                <motion.ol
                  key="instruction-body"
                  className="xr-card-body xr-card-body--list"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {component.data.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
            {editControls}
          </motion.div>
        );

      case "alert": {
        const alertColor = getAlertColor(component.data.severity || "warning");
        return (
          <motion.div
            className="xr-card xr-card--alert xr-pulse"
            style={{ borderColor: alertColor }}
            {...cardMotion}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="xr-card-header">
              <span className="xr-card-icon xr-card-icon--alert">
                <AlertTriangle size={18} />
              </span>
              <div className="xr-card-title-group">
                <span className="xr-card-label">Alert</span>
                <span className="xr-card-title" style={{ color: alertColor }}>
                  {component.data.severity?.toUpperCase() || "WARNING"}
                </span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && component.data.message && (
                <motion.div
                  key="alert-body"
                  className="xr-card-body"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {component.data.message}
                </motion.div>
              )}
            </AnimatePresence>
            {editControls}
          </motion.div>
        );
      }

      case "image":
        return (
          <motion.div
            className="xr-card xr-card--image"
            {...cardMotion}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="xr-card-header">
              <span className="xr-card-icon">
                <ImageIcon size={18} />
              </span>
              <div className="xr-card-title-group">
                <span className="xr-card-label">Image</span>
                <span className="xr-card-title">
                  {component.data.title || "Annotation"}
                </span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && component.data.imageUrl && (
                <motion.div
                  key="image-body"
                  className="xr-card-body xr-card-body--image"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  <img
                    src={component.data.imageUrl}
                    alt={component.data.title}
                  />
                  {component.data.caption && (
                    <span className="xr-card-caption">
                      {component.data.caption}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {editControls}
          </motion.div>
        );

      default:
        return null;
    }
  };

  // ── API component renderer ────────────────────────────────────────────────
  const renderApiContent = () => {
    const cfg = component.data._api;
    if (!cfg) return null;

    // Loading skeleton (no data yet)
    if (apiStatus === "loading" && !apiData) {
      return (
        <motion.div
          className="xr-card xr-card--loading"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 260 }}
        >
          <div className="xr-card-header">
            <span className="xr-card-icon">
              <Globe size={18} style={{ opacity: 0.5 }} />
            </span>
            <div className="xr-card-title-group">
              <span className="xr-skeleton xr-skeleton--label" />
              <span className="xr-skeleton xr-skeleton--title" />
            </div>
          </div>
          <div className="xr-skeleton xr-skeleton--body" />
        </motion.div>
      );
    }

    // Error card (no data at all)
    if (apiStatus === "error" && !apiData) {
      return (
        <motion.div
          className="xr-card xr-card--error"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 260 }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="xr-card-header">
            <span className="xr-card-icon xr-card-icon--error">
              <WifiOff size={18} />
            </span>
            <div className="xr-card-title-group">
              <span className="xr-card-label">API Error</span>
              <span
                className="xr-card-title"
                style={{ color: "rgba(255,80,100,0.95)" }}
              >
                Failed to load
              </span>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                className="xr-card-body"
                key="error-body"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                style={{ color: "rgba(255,80,100,0.8)", fontSize: "11px" }}
              >
                {apiError}
                <button
                  className="xr-retry-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchApi();
                  }}
                >
                  <RefreshCw size={11} /> Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {editControls}
        </motion.div>
      );
    }

    // Have data — render as the chosen type using a synthetic component
    const syntheticComponent: RoomComponent = {
      ...component,
      type: cfg.renderAs,
      data: { ...(apiData ?? component.data) },
    };
    const prevComponent = component;

    // Temporarily swap `component` binding for renderContent by building the
    // rendered JSX directly from the synthetic type so we stay DRY.
    const StaleBadge = isStale ? (
      <span className="xr-stale-badge">stale</span>
    ) : null;

    // Re-invoke renderContent with synthetic data by temporarily reassigning
    // (we pass the synthetic component into a local inline call)
    const renderSynthetic = () => {
      const d = syntheticComponent.data;
      switch (cfg.renderAs) {
        case "infobox":
          return (
            <motion.div
              className="xr-card xr-card--infobox"
              style={{ borderColor: d.color || "#00d9ff" }}
              {...cardMotion}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="xr-card-header">
                <span className="xr-card-icon">
                  <Info size={18} />
                </span>
                <div className="xr-card-title-group">
                  <span className="xr-card-label">Info {StaleBadge}</span>
                  <span className="xr-card-title">
                    {d.title || "Information"}
                  </span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && d.text && (
                  <motion.div
                    className="xr-card-body"
                    key="api-infobox-body"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {d.text}
                  </motion.div>
                )}
              </AnimatePresence>
              {editControls}
            </motion.div>
          );
        case "status": {
          const sc = getStatusColor(d.status || "working");
          return (
            <motion.div
              className="xr-card xr-card--status"
              style={{ borderColor: sc }}
              {...cardMotion}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="xr-card-header">
                <span
                  className="xr-status-dot xr-pulse-glow"
                  style={{ color: sc }}
                />
                <div className="xr-card-title-group">
                  <span className="xr-card-label">Status {StaleBadge}</span>
                  <span className="xr-card-title">{d.title || "System"}</span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    className="xr-card-body xr-card-body--status"
                    key="api-status-body"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    style={{ color: sc }}
                  >
                    Status: {d.status?.toUpperCase() || "WORKING"}
                  </motion.div>
                )}
              </AnimatePresence>
              {editControls}
            </motion.div>
          );
        }
        case "instruction":
          return (
            <motion.div
              className="xr-card xr-card--instruction"
              {...cardMotion}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="xr-card-header">
                <span className="xr-card-icon">
                  <ClipboardList size={18} />
                </span>
                <div className="xr-card-title-group">
                  <span className="xr-card-label">
                    Instructions {StaleBadge}
                  </span>
                  <span className="xr-card-title">{d.title || "Steps"}</span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && d.steps && (
                  <motion.ol
                    className="xr-card-body xr-card-body--list"
                    key="api-inst-body"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {d.steps.map((step: string, idx: number) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </motion.ol>
                )}
              </AnimatePresence>
              {editControls}
            </motion.div>
          );
        case "alert": {
          const ac = getAlertColor(d.severity || "warning");
          return (
            <motion.div
              className="xr-card xr-card--alert xr-pulse"
              style={{ borderColor: ac }}
              {...cardMotion}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="xr-card-header">
                <span className="xr-card-icon xr-card-icon--alert">
                  <AlertTriangle size={18} />
                </span>
                <div className="xr-card-title-group">
                  <span className="xr-card-label">Alert {StaleBadge}</span>
                  <span className="xr-card-title" style={{ color: ac }}>
                    {d.severity?.toUpperCase() || "WARNING"}
                  </span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && d.message && (
                  <motion.div
                    className="xr-card-body"
                    key="api-alert-body"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {d.message}
                  </motion.div>
                )}
              </AnimatePresence>
              {editControls}
            </motion.div>
          );
        }
        case "image":
          return (
            <motion.div
              className="xr-card xr-card--image"
              {...cardMotion}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="xr-card-header">
                <span className="xr-card-icon">
                  <ImageIcon size={18} />
                </span>
                <div className="xr-card-title-group">
                  <span className="xr-card-label">Image {StaleBadge}</span>
                  <span className="xr-card-title">
                    {d.title || "Annotation"}
                  </span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && d.imageUrl && (
                  <motion.div
                    className="xr-card-body xr-card-body--image"
                    key="api-image-body"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <img src={d.imageUrl} alt={d.title} />
                    {d.caption && (
                      <span className="xr-card-caption">{d.caption}</span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {editControls}
            </motion.div>
          );
        default:
          return null;
      }
    };

    void prevComponent; // used above; suppress lint
    return renderSynthetic();
  };

  return (
    <group position={position}>
      {/* Main component sphere marker */}
      <mesh>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial
          color={
            component.type === "status"
              ? getStatusColor(component.data.status || "working")
              : component.type === "alert"
                ? getAlertColor(component.data.severity || "warning")
                : component.data.color || "#00d9ff"
          }
          transparent
          opacity={isHovered ? 0.9 : 0.7}
        />
      </mesh>

      {/* Content */}
      <Html position={[0, 2, 0]} center>
        <motion.div
          className="xr-card-wrapper"
          style={{ pointerEvents: "auto" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {component.type === "api" ? renderApiContent() : renderContent()}
        </motion.div>
      </Html>
    </group>
  );
};
