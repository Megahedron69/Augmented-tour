/**
 * XR Room Component System
 * Defines types for interactive 3D annotations in panoramas
 */

export type ComponentType =
  | "infobox"
  | "status"
  | "image"
  | "instruction"
  | "alert"
  | "api";

/** Stored alongside component data when the component is API-driven */
export interface ApiConfig {
  url: string;
  /** Which existing type the API data should render as */
  renderAs: Exclude<ComponentType, "api">;
  /** Auto-refresh interval in seconds (0 = on room entry only) */
  refreshInterval: number;
}

export type StatusType = "working" | "warning" | "error";
export type AlertSeverity = "warning" | "danger";

export interface ComponentData {
  // Common fields
  title?: string;
  text?: string;
  icon?: string;
  color?: string;

  // Status indicator
  status?: StatusType;

  // Image annotation
  imageUrl?: string;
  caption?: string;

  // Instruction card
  steps?: string[];

  // Alert marker
  severity?: AlertSeverity;
  message?: string;

  // API-driven component config (not rendered, drives fetch logic)
  _api?: ApiConfig;
}

export interface RoomComponent {
  id: string;
  roomLabel: string;
  type: ComponentType;
  position: [number, number, number]; // 3D coordinates from raycaster
  data: ComponentData;
  createdAt: number;
}

export interface RoomComponentsStorage {
  [roomLabel: string]: RoomComponent[];
}

// Helper to get status color
export const getStatusColor = (status: StatusType): string => {
  switch (status) {
    case "working":
      return "#f59e0b";
    case "warning":
      return "#ff6b6b";
    case "error":
      return "#ef4444";
    default:
      return "#00d9ff";
  }
};

// Helper to get alert color
export const getAlertColor = (severity: AlertSeverity): string => {
  switch (severity) {
    case "warning":
      return "#f59e0b";
    case "danger":
      return "#ef4444";
    default:
      return "#f59e0b";
  }
};

// Component templates
export const COMPONENT_TEMPLATES = {
  infobox: {
    type: "infobox" as const,
    data: {
      title: "Information",
      text: "Add your information here",
      icon: "ℹ️",
      color: "#00d9ff",
    },
  },
  status: {
    type: "status" as const,
    data: {
      title: "Status Indicator",
      status: "working" as StatusType,
    },
  },
  image: {
    type: "image" as const,
    data: {
      title: "Image Annotation",
      imageUrl: "",
      caption: "",
    },
  },
  instruction: {
    type: "instruction" as const,
    data: {
      title: "Instructions",
      steps: ["Step 1", "Step 2", "Step 3"],
    },
  },
  alert: {
    type: "alert" as const,
    data: {
      severity: "warning" as AlertSeverity,
      message: "Caution required",
    },
  },
  api: {
    type: "api" as const,
    data: {
      _api: {
        url: "",
        renderAs: "status" as Exclude<ComponentType, "api">,
        refreshInterval: 30,
      },
    },
  },
};
