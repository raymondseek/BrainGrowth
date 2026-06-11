export interface AnimateNumberOptions {
  element: HTMLElement;
  from: number;
  to: number;
  durationMs?: number;
  format?: (value: number) => string;
  round?: boolean;
}

export function animateNumber({
  element,
  from,
  to,
  durationMs = 650,
  format = (value) => String(value),
  round = true
}: AnimateNumberOptions): void {
  if (from === to || prefersReducedMotion()) {
    element.textContent = format(to);
    return;
  }

  const fromValue = round ? Math.round(from) : from;
  const toValue = round ? Math.round(to) : to;
  const fromText = format(fromValue);
  const toText = format(toValue);
  if (fromText === toText) {
    element.textContent = toText;
    return;
  }

  element.textContent = "";
  element.style.setProperty("--brain-growth-number-roll-duration", `${Math.min(520, Math.max(280, durationMs * 0.72))}ms`);
  element.classList.remove("is-rolling", "is-rolling-up", "is-rolling-down", "brain-growth-number-changed");
  element.addClass("brain-growth-number-rolling");
  element.addClass(to >= from ? "is-rolling-up" : "is-rolling-down");

  const fromDigits = Array.from(fromText).filter(isDigit);
  const toChars = Array.from(toText);
  const toDigitCount = toChars.filter(isDigit).length;
  let toDigitIndex = 0;
  let changedDigitIndexFromRight = 0;
  let maxDelay = 0;

  for (const char of toChars) {
    if (!isDigit(char)) {
      element.createSpan({ text: char, cls: "brain-growth-number-static-char" });
      continue;
    }

    const digitIndexFromRight = toDigitCount - toDigitIndex - 1;
    const fromDigitIndex = fromDigits.length - digitIndexFromRight - 1;
    const oldDigit = fromDigitIndex >= 0 ? fromDigits[fromDigitIndex] : "0";
    const shouldRoll = oldDigit !== char;
    const digit = element.createSpan({ cls: shouldRoll ? "brain-growth-number-digit is-changing" : "brain-growth-number-digit" });
    const delay = shouldRoll ? changedDigitIndexFromRight * 70 : 0;
    if (shouldRoll) {
      digit.style.setProperty("--brain-growth-number-roll-delay", `${delay}ms`);
      maxDelay = Math.max(maxDelay, delay);
      changedDigitIndexFromRight += 1;
    }

    digit.createSpan({ text: oldDigit, cls: "brain-growth-number-digit-value is-old" });
    digit.createSpan({ text: char, cls: "brain-growth-number-digit-value is-new" });
    toDigitIndex += 1;
  }

  requestAnimationFrame(() => {
    element.addClass("is-rolling");
  });

  window.setTimeout(() => {
    element.textContent = format(to);
    element.style.removeProperty("--brain-growth-number-roll-duration");
    element.style.removeProperty("--brain-growth-number-roll-height");
    element.classList.remove("is-rolling", "is-rolling-up", "is-rolling-down");
    element.addClass("brain-growth-number-changed");
    window.setTimeout(() => element.removeClass("brain-growth-number-changed"), 520);
  }, Math.min(520, Math.max(280, durationMs * 0.72)) + maxDelay + 40);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
