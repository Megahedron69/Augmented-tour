export type TourId = "home" | "office";

export const DEFAULT_TOUR_ID: TourId = "home";

export const isTourId = (value: string | null): value is TourId => {
  return value === "home" || value === "office";
};
