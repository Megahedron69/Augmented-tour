/**
 * Component Editor Modal
 * Modal for creating and editing XR room components
 */

import React, { useState, useEffect, useRef, startTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  Activity,
  Zap,
  AlertCircle,
  Image as ImageIcon,
  Globe,
  X,
  CheckCircle2,
  RefreshCw,
  WifiOff,
  ChevronDown,
} from "lucide-react";
import type {
  ComponentType,
  ComponentData,
  RoomComponent,
  ApiConfig,
} from "../types/roomComponents";
import { COMPONENT_TEMPLATES } from "../types/roomComponents";
import "./ComponentEditor.css";

interface ComponentEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (componentData: Omit<RoomComponent, "id" | "createdAt">) => void;
  position: [number, number, number];
  roomLabel: string;
  editingComponent?: RoomComponent | null;
}

export const ComponentEditor: React.FC<ComponentEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  position,
  roomLabel,
  editingComponent,
}) => {
  // Initialize state based on editingComponent
  const initialType = editingComponent?.type || "infobox";
  const initialData = editingComponent?.data || {
    ...COMPONENT_TEMPLATES.infobox.data,
  };

  const [selectedType, setSelectedType] = useState<ComponentType>(initialType);
  const [componentData, setComponentData] =
    useState<ComponentData>(initialData);
  const prevOpenRef = useRef(isOpen);

  // API test state
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);

  // Reset state only when modal transitions from closed to open
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;

    // Only update state when transitioning from closed to open
    // Use startTransition to avoid cascading render warnings
    if (!wasOpen && isOpen) {
      startTransition(() => {
        if (editingComponent) {
          setSelectedType(editingComponent.type);
          setComponentData(editingComponent.data);
        } else {
          setSelectedType("infobox");
          setComponentData({ ...COMPONENT_TEMPLATES.infobox.data });
        }
      });
    }
  }, [isOpen, editingComponent]);

  // Update data when type changes
  const handleTypeChange = (type: ComponentType) => {
    setSelectedType(type);
    setComponentData({ ...COMPONENT_TEMPLATES[type].data });
    setTestStatus("idle");
    setTestPreview(null);
  };

  const handleSave = () => {
    onSave({
      roomLabel,
      type: selectedType,
      position,
      data: componentData,
    });
    onClose();
  };

  // ── Schema guide text per render-as type ────────────────────────────────
  const SCHEMA_GUIDES: Record<
    Exclude<ComponentType, "api">,
    { fields: { key: string; type: string; note?: string }[] }
  > = {
    infobox: {
      fields: [
        { key: "title", type: "string" },
        { key: "text", type: "string", note: "Body text" },
        { key: "color", type: "string", note: "Optional hex colour" },
      ],
    },
    status: {
      fields: [
        { key: "title", type: "string" },
        { key: "status", type: '"working" | "warning" | "error"' },
      ],
    },
    instruction: {
      fields: [
        { key: "title", type: "string" },
        { key: "steps", type: "string[]" },
      ],
    },
    alert: {
      fields: [
        { key: "severity", type: '"warning" | "danger"' },
        { key: "message", type: "string" },
      ],
    },
    image: {
      fields: [
        { key: "title", type: "string" },
        { key: "imageUrl", type: "string" },
        { key: "caption", type: "string", note: "Optional" },
      ],
    },
  };

  const handleTestUrl = async () => {
    const url = componentData._api?.url?.trim();
    if (!url) return;
    setTestStatus("loading");
    setTestPreview(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      setTestPreview(JSON.stringify(json, null, 2));
      setTestStatus("ok");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestPreview(msg);
      setTestStatus("error");
    }
  };

  if (!isOpen) return null;

  const renderFields = () => {
    switch (selectedType) {
      case "infobox":
        return (
          <>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={componentData.title || ""}
                onChange={(e) =>
                  setComponentData({ ...componentData, title: e.target.value })
                }
                placeholder="Enter title"
              />
            </div>
            <div className="form-group">
              <label>Text</label>
              <textarea
                value={componentData.text || ""}
                onChange={(e) =>
                  setComponentData({ ...componentData, text: e.target.value })
                }
                placeholder="Enter description"
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>Color</label>
              <input
                type="color"
                value={componentData.color || "#00d9ff"}
                onChange={(e) =>
                  setComponentData({ ...componentData, color: e.target.value })
                }
              />
            </div>
          </>
        );

      case "status":
        return (
          <>
            <div className="form-group">
              <label>Label</label>
              <input
                type="text"
                value={componentData.title || ""}
                onChange={(e) =>
                  setComponentData({ ...componentData, title: e.target.value })
                }
                placeholder="System name"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={componentData.status || "working"}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    status: e.target.value as "working" | "warning" | "error",
                  })
                }
              >
                <option value="working">Working</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </>
        );

      case "instruction":
        return (
          <>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={componentData.title || ""}
                onChange={(e) =>
                  setComponentData({ ...componentData, title: e.target.value })
                }
                placeholder="Instruction title"
              />
            </div>
            <div className="form-group">
              <label>Steps (one per line)</label>
              <textarea
                value={(componentData.steps || []).join("\n")}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    steps: e.target.value.split("\n"),
                  })
                }
                placeholder="Step 1\nStep 2\nStep 3"
                rows={6}
              />
            </div>
          </>
        );

      case "alert":
        return (
          <>
            <div className="form-group">
              <label>Severity</label>
              <select
                value={componentData.severity || "warning"}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    severity: e.target.value as "warning" | "danger",
                  })
                }
              >
                <option value="warning">Warning</option>
                <option value="danger">Danger</option>
              </select>
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea
                value={componentData.message || ""}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    message: e.target.value,
                  })
                }
                placeholder="Alert message"
                rows={3}
              />
            </div>
          </>
        );

      case "api": {
        const api = componentData._api || {
          url: "",
          renderAs: "status" as Exclude<ComponentType, "api">,
          refreshInterval: 30,
        };
        const setApi = (patch: Partial<ApiConfig>) =>
          setComponentData({ ...componentData, _api: { ...api, ...patch } });
        const renderAsType = api.renderAs as Exclude<ComponentType, "api">;
        const schema = SCHEMA_GUIDES[renderAsType];

        return (
          <>
            <div className="form-group">
              <label>API Endpoint URL</label>
              <input
                type="text"
                value={api.url}
                onChange={(e) => {
                  setApi({ url: e.target.value });
                  setTestStatus("idle");
                  setTestPreview(null);
                }}
                placeholder="https://your-api.example.com/endpoint"
              />
            </div>

            <div className="form-group">
              <label>Render As</label>
              <select
                value={api.renderAs}
                onChange={(e) =>
                  setApi({
                    renderAs: e.target.value as Exclude<ComponentType, "api">,
                  })
                }
              >
                <option value="infobox">Info Box</option>
                <option value="status">Status</option>
                <option value="instruction">Instructions</option>
                <option value="alert">Alert</option>
                <option value="image">Image</option>
              </select>
            </div>

            <div className="form-group">
              <label>Auto-refresh every (seconds)</label>
              <input
                type="number"
                min={0}
                max={3600}
                value={api.refreshInterval}
                onChange={(e) =>
                  setApi({ refreshInterval: Number(e.target.value) })
                }
                placeholder="30"
              />
              <span className="form-hint">
                Set to 0 to only fetch on room entry
              </span>
            </div>

            {/* Schema guide */}
            <div className="api-schema-box">
              <button
                type="button"
                className="api-schema-toggle"
                onClick={() => setSchemaOpen((v) => !v)}
              >
                <span>
                  Expected JSON shape for <strong>{renderAsType}</strong>
                </span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: schemaOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                />
              </button>
              <AnimatePresence initial={false}>
                {schemaOpen && (
                  <motion.pre
                    className="api-schema-pre"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                  >{`{
${schema.fields.map((f) => `  "${f.key}": ${f.type}${f.note ? `  // ${f.note}` : ""}`).join(",\n")}
}`}</motion.pre>
                )}
              </AnimatePresence>
            </div>

            {/* Test URL */}
            <div className="form-group api-test-group">
              <motion.button
                type="button"
                className={`api-test-btn api-test-btn--${testStatus}`}
                onClick={handleTestUrl}
                disabled={!api.url.trim() || testStatus === "loading"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {testStatus === "loading" ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                  >
                    <RefreshCw size={14} />
                  </motion.span>
                ) : testStatus === "error" ? (
                  <WifiOff size={14} />
                ) : testStatus === "ok" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Globe size={14} />
                )}
                {testStatus === "loading"
                  ? "Fetching…"
                  : testStatus === "ok"
                    ? "Success"
                    : testStatus === "error"
                      ? "Failed"
                      : "Test URL"}
              </motion.button>

              <AnimatePresence initial={false}>
                {testPreview && (
                  <motion.pre
                    className={`api-test-preview api-test-preview--${testStatus}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {testPreview.length > 600
                      ? testPreview.slice(0, 600) + "…"
                      : testPreview}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          </>
        );
      }

      case "image":
        return (
          <>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={componentData.title || ""}
                onChange={(e) =>
                  setComponentData({ ...componentData, title: e.target.value })
                }
                placeholder="Image title"
              />
            </div>
            <div className="form-group">
              <label>Image URL</label>
              <input
                type="text"
                value={componentData.imageUrl || ""}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    imageUrl: e.target.value,
                  })
                }
                placeholder="https://..."
              />
            </div>
            <div className="form-group">
              <label>Caption</label>
              <input
                type="text"
                value={componentData.caption || ""}
                onChange={(e) =>
                  setComponentData({
                    ...componentData,
                    caption: e.target.value,
                  })
                }
                placeholder="Image caption"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

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
            style={{ perspective: 1000 }}
          >
            <motion.div className="modal-header">
              <h2>
                {editingComponent ? "Edit Component" : "Create Component"}
              </h2>
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
              <div className="form-group">
                <label className="form-label">Component Type</label>
                <div className="type-selector">
                  {[
                    { type: "infobox" as const, icon: Info, label: "Info" },
                    {
                      type: "status" as const,
                      icon: Activity,
                      label: "Status",
                    },
                    { type: "instruction" as const, icon: Zap, label: "Steps" },
                    {
                      type: "alert" as const,
                      icon: AlertCircle,
                      label: "Alert",
                    },
                    { type: "image" as const, icon: ImageIcon, label: "Image" },
                    { type: "api" as const, icon: Globe, label: "API" },
                  ].map((item, idx) => {
                    const IconComponent = item.icon;
                    return (
                      <motion.button
                        key={item.type}
                        className={`type-btn ${selectedType === item.type ? "active" : ""}`}
                        onClick={() => handleTypeChange(item.type)}
                        disabled={!!editingComponent}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{
                          scale: editingComponent ? 1 : 1.05,
                          y: -2,
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <IconComponent size={20} className="type-icon" />
                        <span className="type-label">{item.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="form-fields">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedType}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderFields()}
                  </motion.div>
                </AnimatePresence>
              </div>

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
                {editingComponent ? "Update" : "Create"}
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
