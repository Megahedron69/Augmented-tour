/**
 * LocalStorage utilities for room components
 */

import type {
  RoomComponent,
  RoomComponentsStorage,
} from "../types/roomComponents";
import { DEFAULT_TOUR_ID, type TourId } from "../types/tours";
import { normalizeRoomLabel } from "./tourFormatting";

const LEGACY_STORAGE_KEY = "roomComponents";

const getStorageKey = (tourId: TourId): string => {
  return `${LEGACY_STORAGE_KEY}:${tourId}`;
};

export const loadRoomComponents = (
  tourId: TourId = DEFAULT_TOUR_ID,
): RoomComponentsStorage => {
  try {
    const scopedData = localStorage.getItem(getStorageKey(tourId));

    if (scopedData) {
      return JSON.parse(scopedData);
    }

    if (tourId === DEFAULT_TOUR_ID) {
      const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
      return legacyData ? JSON.parse(legacyData) : {};
    }

    return {};
  } catch (error) {
    console.error("Error loading room components:", error);
    return {};
  }
};

export const saveRoomComponents = (
  components: RoomComponentsStorage,
  tourId: TourId = DEFAULT_TOUR_ID,
): void => {
  try {
    const serialized = JSON.stringify(components);
    localStorage.setItem(getStorageKey(tourId), serialized);

    if (tourId === DEFAULT_TOUR_ID) {
      localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    }
  } catch (error) {
    console.error("Error saving room components:", error);
  }
};

export const getComponentsForRoom = (
  roomLabel: string,
  tourId: TourId = DEFAULT_TOUR_ID,
): RoomComponent[] => {
  const allComponents = loadRoomComponents(tourId);
  return allComponents[normalizeRoomLabel(roomLabel)] || [];
};

export const addComponent = (
  component: RoomComponent,
  tourId: TourId = DEFAULT_TOUR_ID,
): void => {
  const allComponents = loadRoomComponents(tourId);
  const roomLabel = normalizeRoomLabel(component.roomLabel);

  if (!allComponents[roomLabel]) {
    allComponents[roomLabel] = [];
  }

  allComponents[roomLabel].push({
    ...component,
    roomLabel,
  });
  saveRoomComponents(allComponents, tourId);
};

export const updateComponent = (
  componentId: string,
  updates: Partial<RoomComponent>,
  tourId: TourId = DEFAULT_TOUR_ID,
): void => {
  const allComponents = loadRoomComponents(tourId);

  for (const roomLabel in allComponents) {
    const index = allComponents[roomLabel].findIndex(
      (c) => c.id === componentId,
    );
    if (index !== -1) {
      allComponents[roomLabel][index] = {
        ...allComponents[roomLabel][index],
        ...updates,
        roomLabel: normalizeRoomLabel(
          updates.roomLabel ?? allComponents[roomLabel][index].roomLabel,
        ),
      };
      saveRoomComponents(allComponents, tourId);
      return;
    }
  }
};

export const deleteComponent = (
  componentId: string,
  tourId: TourId = DEFAULT_TOUR_ID,
): void => {
  const allComponents = loadRoomComponents(tourId);

  for (const roomLabel in allComponents) {
    allComponents[roomLabel] = allComponents[roomLabel].filter(
      (c) => c.id !== componentId,
    );
  }

  saveRoomComponents(allComponents, tourId);
};

export const clearAllComponents = (tourId: TourId = DEFAULT_TOUR_ID): void => {
  localStorage.removeItem(getStorageKey(tourId));

  if (tourId === DEFAULT_TOUR_ID) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
};
