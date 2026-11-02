import { useSyncExternalStore } from "react";

const screens = {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
};

/**
 * Checks whether a particular Tailwind CSS viewport size applies.
 *
 * @param size The size to check, which must either be included in Tailwind CSS's
 * list of default screen sizes, or added to the Tailwind CSS config file.
 *
 * @returns A boolean indicating whether the viewport size applies.
 */
export const useBreakpoint = (size: "sm" | "md" | "lg" | "xl" | "2xl") => {
    return useSyncExternalStore(
        (onStoreChange) => {
            if (typeof window === "undefined") {
                return () => {};
            }

            const breakpoint = window.matchMedia(`(min-width: ${screens[size]})`);
            breakpoint.addEventListener("change", onStoreChange);

            return () => breakpoint.removeEventListener("change", onStoreChange);
        },
        () => {
            if (typeof window === "undefined") {
                return true;
            }

            return window.matchMedia(`(min-width: ${screens[size]})`).matches;
        },
        () => true,
    );
};

const subscribeMedia = (query: string) => (onStoreChange: () => void) => {
    if (typeof window === "undefined") {
        return () => {};
    }

    const media = window.matchMedia(query);
    media.addEventListener("change", onStoreChange);

    return () => media.removeEventListener("change", onStoreChange);
};

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
const subscribeTouch = subscribeMedia(TOUCH_QUERY);

/** Сенсорный ввод (телефон, планшет). Мышь на любой ширине — `false`: десктопное поведение не меняется. */
export const useIsTouch = () =>
    useSyncExternalStore(
        subscribeTouch,
        () => typeof window !== "undefined" && window.matchMedia(TOUCH_QUERY).matches,
        () => false,
    );

/** Мобильная раскладка: ширина меньше `md` (768px). */
export const useIsMobile = () => !useBreakpoint("md");

/** То же, что useIsTouch, для обработчиков событий (вне рендера). */
export const isTouchInput = () => typeof window !== "undefined" && window.matchMedia(TOUCH_QUERY).matches;
