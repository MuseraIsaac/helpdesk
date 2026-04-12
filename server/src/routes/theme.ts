import { Router } from "express";
import { getSection } from "../lib/settings";

const router = Router();

/**
 * GET /api/theme
 * Public — no authentication required.
 * Returns only the custom color fields from appearance settings so that
 * all page types (agent UI, customer portal, help center) can apply
 * admin-configured colors without needing a session.
 */
router.get("/", async (_req, res) => {
  const appearance = await getSection("appearance");
  res.json({
    customPrimaryColor:      appearance.customPrimaryColor,
    customSuccessColor:      appearance.customSuccessColor,
    customWarningColor:      appearance.customWarningColor,
    customDangerColor:       appearance.customDangerColor,
    customSecondaryColor:    appearance.customSecondaryColor,
    customAccentColor:       appearance.customAccentColor,
    customSidebarLightColor: appearance.customSidebarLightColor,
    customSidebarDarkColor:  appearance.customSidebarDarkColor,
  });
});

export default router;
