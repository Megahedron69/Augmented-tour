/**
 * LocalStorage utilities for room components
 */

import type {
  RoomComponent,
  RoomComponentsStorage,
} from "../types/roomComponents";

const STORAGE_KEY = "roomComponents";

export const loadRoomComponents = (): RoomComponentsStorage => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error("Error loading room components:", error);
    return {};
  }
};

export const saveRoomComponents = (components: RoomComponentsStorage): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(components));
  } catch (error) {
    console.error("Error saving room components:", error);
  }
};

export const getComponentsForRoom = (roomLabel: string): RoomComponent[] => {
  const allComponents = loadRoomComponents();
  return allComponents[roomLabel.toLowerCase().trim()] || [];
};

export const addComponent = (component: RoomComponent): void => {
  const allComponents = loadRoomComponents();
  const roomLabel = component.roomLabel.toLowerCase().trim();

  if (!allComponents[roomLabel]) {
    allComponents[roomLabel] = [];
  }

  allComponents[roomLabel].push(component);
  saveRoomComponents(allComponents);
};

export const updateComponent = (
  componentId: string,
  updates: Partial<RoomComponent>,
): void => {
  const allComponents = loadRoomComponents();

  for (const roomLabel in allComponents) {
    const index = allComponents[roomLabel].findIndex(
      (c) => c.id === componentId,
    );
    if (index !== -1) {
      allComponents[roomLabel][index] = {
        ...allComponents[roomLabel][index],
        ...updates,
      };
      saveRoomComponents(allComponents);
      return;
    }
  }
};

export const deleteComponent = (componentId: string): void => {
  const allComponents = loadRoomComponents();

  for (const roomLabel in allComponents) {
    allComponents[roomLabel] = allComponents[roomLabel].filter(
      (c) => c.id !== componentId,
    );
  }

  saveRoomComponents(allComponents);
};

export const clearAllComponents = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
