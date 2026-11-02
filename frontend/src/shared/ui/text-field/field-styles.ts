/** Общие стили полей ввода (TextField, PasswordField, Textarea). Токены — tokens.css. */

export const INPUT_BASE =
  "w-full min-w-0 border border-line-strong bg-surface px-3 text-[13px] text-fg caret-accent outline-none " +
  "placeholder:text-disabled-text transition-[border-color,box-shadow] " +
  "data-[hovered]:border-muted " +
  "data-[focused]:border-brand data-[focused]:shadow-soft " +
  "data-[invalid]:border-danger data-[invalid]:data-[focused]:shadow-[3px_3px_0_var(--color-danger-deep)] " +
  "group-data-[readonly]:border-dashed group-data-[readonly]:bg-bg " +
  "data-[disabled]:cursor-not-allowed data-[disabled]:border-dashed data-[disabled]:border-disabled-line " +
  "data-[disabled]:text-disabled-text data-[disabled]:[background:var(--ds-hatch),var(--color-bg)] " +
  "data-[disabled]:placeholder:text-disabled-line";

export const LABEL =
  "flex items-center justify-between gap-2 font-label text-[10px] uppercase leading-snug tracking-[0.06em] text-muted " +
  "group-data-[disabled]:text-disabled-text";

export const HINT = "text-[11px] leading-relaxed text-muted group-data-[disabled]:text-disabled-text";
export const ERROR = "text-[11px] leading-relaxed text-danger";
export const SUCCESS = "text-[11px] leading-relaxed text-success";

export const ADDON =
  "inline-flex items-center whitespace-nowrap border border-line-strong bg-bg px-3 font-label text-[11px] text-muted";
