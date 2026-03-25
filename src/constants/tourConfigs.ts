import { MANUAL_PANOS } from "./manualPanos";
import { OFFICE_PANOS } from "./officePanos";
import type { ParsedPano } from "../utils/zindDataParser";
import { DEFAULT_TOUR_ID, type TourId } from "../types/tours";

export interface TourConfig {
  id: TourId;
  title: string;
  shortTitle: string;
  description: string;
  previewImage: string;
  startRoomLabel: string;
  usesZindData: boolean;
  manualPanos: ParsedPano[];
}

export const TOUR_CONFIGS: Record<TourId, TourConfig> = {
  home: {
    id: "home",
    title: "Home Tour",
    shortTitle: "Home",
    description:
      "Residential mixed reality walkthrough with the existing home panorama pipeline and XR overlays.",
    previewImage: "/360Assets/panos_floor2/bedroom.jpg",
    startRoomLabel: "living room",
    usesZindData: true,
    manualPanos: MANUAL_PANOS,
  },
  office: {
    id: "office",
    title: "IOCL Office Tour",
    shortTitle: "IOCL Office",
    description:
      "Corporate office demo spanning basement, ground floor, and floor 1 with isolated XR and navigation data.",
    previewImage: "/360Assets/ioclPanos/reception.png",
    startRoomLabel: "reception",
    usesZindData: false,
    manualPanos: OFFICE_PANOS,
  },
};

export const getTourConfig = (tourId: TourId): TourConfig => {
  return TOUR_CONFIGS[tourId] ?? TOUR_CONFIGS[DEFAULT_TOUR_ID];
};
