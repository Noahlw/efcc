import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const rootEl = document.querySelector("#root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
