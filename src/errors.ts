/** Domain errors. The HTTP layer maps each one to a `failed.code`. */

/** The search URL is not a Skyscanner flight search URL. */
export class InvalidSearchUrlError extends Error {}

/** No warmed browser session became ready in time. */
export class NoSessionAvailableError extends Error {}

/** PerimeterX rejected the browser session (HTTP 403 or a captcha redirect). */
export class SessionBlockedError extends Error {}

/** Skyscanner answered, but not with usable results. */
export class UpstreamError extends Error {}

/** A script running in the page threw (e.g. its fetch failed); Chrome itself still works. */
export class PageScriptError extends UpstreamError {}

/** Chrome or its DevTools connection failed. */
export class BrowserError extends Error {}
