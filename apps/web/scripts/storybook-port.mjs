const MAX_PORT = 65_535;

export function parseStorybookPort(value, source = "Storybook port") {
  const text = String(value ?? "").trim();
  if (!/^\d+$/u.test(text)) {
    throw new Error(`${source} must be an integer between 1 and ${MAX_PORT}.`);
  }

  const port = Number(text);
  if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`${source} must be an integer between 1 and ${MAX_PORT}.`);
  }

  return port;
}
