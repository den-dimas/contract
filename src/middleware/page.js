const FLASH_COOKIE = 'flash';
const FLASH_MS = 10000;

/**
 * Adds res.flash and res.page.
 * res.page renders a full page, or only the page body for HTMX requests.
 */
function pageHelpers(req, res, next) {
  res.flash = (message) => {
    res.cookie(FLASH_COOKIE, message, { signed: true, maxAge: FLASH_MS });
  };

  res.page = (view, data = {}) => {
    const isPartial = req.get('HX-Request') && !req.get('HX-History-Restore-Request');
    const flash = req.signedCookies[FLASH_COOKIE];
    if (flash) res.clearCookie(FLASH_COOKIE);
    res.render(view, { ...data, flash, layout: isPartial ? false : 'main' });
  };

  next();
}

module.exports = { pageHelpers };
