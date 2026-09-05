import { describe, expect, test } from "vitest";

import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";
import {
  MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  validateScreenCatalog,
} from "./presentation-catalog";

describe("T07.1 Screen Catalog foundation", () => {
  test("declares four unique Management Hub PSNs with resolvable Stories", () => {
    expect(MANAGEMENT_HUB_PRESENTATION_DECLARATIONS).toHaveLength(4);
    expect(
      MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
    ).toStrictEqual([
      MANAGEMENT_HUB_PRESENTATION.default.psn,
      MANAGEMENT_HUB_PRESENTATION.loading.psn,
      MANAGEMENT_HUB_PRESENTATION.empty.psn,
      MANAGEMENT_HUB_PRESENTATION.recoverableError.psn,
    ]);
    expect(
      validateScreenCatalog(
        SCREEN_CATALOG,
        MANAGEMENT_HUB_PRESENTATION_DECLARATIONS
      )
    ).toStrictEqual([]);
  });
});
