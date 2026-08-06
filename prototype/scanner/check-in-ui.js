/**
 * Shared UI utilities and inline scanner for the EFCC check-in prototype.
 */

const UI = {
  q: (sel, root = document) => root.querySelector(sel),
  qa: (sel, root = document) => [...root.querySelectorAll(sel)],

  show(el, visible = true) {
    el.classList.toggle("hidden", !visible);
  },

  hide(el) {
    el.classList.add("hidden");
  },

  setResult(container, { tone, glyph, title, text }) {
    container.className = `result result--${tone}`;
    container.querySelector(".result__glyph").textContent = glyph;
    container.querySelector(".result__title").textContent = title;
    container.querySelector(".result__text").textContent = text;
    this.show(container);
  },

  clearResult(container) {
    this.hide(container);
  },

  formatTime(date) {
    return new Intl.DateTimeFormat("zh-HK", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  },

  displayName(userId) {
    const m = window.MOCK.members.find((x) => x.userId === userId);
    return m ? m.name : userId;
  },
};

window.UI = UI;

class InlineScanner {
  constructor(readerId, onCode) {
    this.readerId = readerId;
    this.onCode = onCode;
    this.scanner = null;
    this.lastCode = "";
    this.cooldownUntil = 0;
  }

  async start() {
    if (this.scanner) {
      return;
    }
    try {
      this.scanner = new Html5Qrcode(this.readerId);
      await this.scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => this.handle(decodedText),
        () => null
      );
    } catch (error) {
      console.error("Scanner start failed", error);
      throw error;
    }
  }

  handle(decodedText) {
    const now = Date.now();
    const code = decodedText.trim();
    if (!code) {
      return;
    }
    if (code === this.lastCode && now < this.cooldownUntil) {
      return;
    }
    this.lastCode = code;
    this.cooldownUntil = now + 2500;
    if (this.onCode) {
      this.onCode(code);
    }
  }

  async stop() {
    if (!this.scanner) {
      return;
    }
    try {
      await this.scanner.stop();
    } catch {
      // ignore
    }
    this.scanner = null;
  }
}

window.InlineScanner = InlineScanner;

// Manual 6-character code inputs: auto-advance, backspace, and paste support.
const wireManualCodeForm = (container, onSubmit) => {
  const inputs = UI.qa(".code-char", container);

  function currentValue() {
    return inputs.map((i) => i.value.toUpperCase()).join("");
  }

  function focusNext(index) {
    if (index < inputs.length - 1) {
      inputs[index + 1].focus();
    }
  }

  function focusPrev(index) {
    if (index > 0) {
      inputs[index - 1].focus();
    }
  }

  for (const [index, input] of inputs.entries()) {
    input.addEventListener("input", () => {
      const v = input.value.replaceAll(/[^A-Za-z0-9]/gu, "").toUpperCase();
      input.value = v.slice(0, 1);
      if (v && index < inputs.length - 1) {
        focusNext(index);
      }
      if (currentValue().length === inputs.length) {
        onSubmit(currentValue());
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value) {
        e.preventDefault();
        focusPrev(index);
      } else if (e.key === "ArrowLeft" && input.selectionStart === 0) {
        focusPrev(index);
      } else if (
        e.key === "ArrowRight" &&
        input.selectionEnd === input.value.length
      ) {
        focusNext(index);
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const raw = (e.clipboardData || window.clipboardData).getData("text");
      const chars = raw
        .replaceAll(/[^A-Za-z0-9]/gu, "")
        .toUpperCase()
        .slice(0, inputs.length);
      for (const [i, char] of [...chars].entries()) {
        if (inputs[i]) {
          inputs[i].value = char;
        }
      }
      const filled = Math.min(chars.length, inputs.length);
      if (filled < inputs.length) {
        inputs[filled].focus();
      } else {
        inputs.at(-1).blur();
      }
      if (currentValue().length === inputs.length) {
        onSubmit(currentValue());
      }
    });
  }

  return {
    reset() {
      for (const input of inputs) {
        input.value = "";
      }
      inputs[0].focus();
    },
    value: currentValue,
  };
};

window.wireManualCodeForm = wireManualCodeForm;
