/**
 * Перезапускает одноразовую CSS-анимацию (по умолчанию тряска `ds-shake`): повторный клик трясёт снова.
 * Класс снимается по окончании, чтобы не висел на элементе.
 */
export function restartAnimation(el: Element | null | undefined, cls = "ds-shake"): void {
  if (!el) {
    return;
  }
  el.classList.remove(cls);
  // Чтение раскладки сбрасывает анимацию, иначе повторное добавление того же класса ничего не даст.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}
