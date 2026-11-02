import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning" | "danger";

/** Действие по нажатию на уведомление (кнопка и вся карточка); после него тост закрывается. */
export type ToastAction = { label: string; onPress: () => void };

export type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Время показа, мс. 0 — не закрывать автоматически. */
  duration: number;
  action?: ToastAction;
};

type ToastState = {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
};

const MAX_VISIBLE = 4;
let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { duration: 4000, ...toast, id }].slice(-MAX_VISIBLE),
    }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

type ToastInput = string | { title: string; description?: string; duration?: number; action?: ToastAction };

function show(tone: ToastTone, input: ToastInput, description?: string): number {
  const data = typeof input === "string" ? { title: input, description } : input;
  return useToastStore.getState().push({ tone, ...data });
}

/**
 * Кратковременное уведомление: `toast.success("Профиль сохранён")`, `toast.error("Не удалось отправить", "Сервер недоступен")`.
 * Контейнер `ToastHost` должен быть смонтирован один раз (в оболочке приложения).
 */
export const toast = {
  info: (input: ToastInput, description?: string) => show("info", input, description),
  success: (input: ToastInput, description?: string) => show("success", input, description),
  warning: (input: ToastInput, description?: string) => show("warning", input, description),
  error: (input: ToastInput, description?: string) => show("danger", input, description),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
