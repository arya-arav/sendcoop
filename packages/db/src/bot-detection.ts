// Browser-safe. Telling people from machines in opens and clicks.
//
// Mail security scanners (Barracuda, Mimecast, Proofpoint, Microsoft
// Defender...) open every link of an email as it arrives; link previewers
// (Slack, WhatsApp...) fetch links when they're shared; Apple Mail Privacy
// Protection loads every image through Apple's proxy whether or not the
// email is read. Counting those would make every number wrong. Signals used
// here: the user agent and, for opens, Apple's network. The database adds
// timing signals (within seconds of sending, bursts) when recording.

const BOT_AGENT =
  /bot\b|crawler|spider|scanner|preview|headless|phantomjs|python|curl\/|wget\/|go-http-client|java\/|okhttp|axios\/|node-fetch|libwww|httpclient|barracuda|mimecast|proofpoint|symantec|forcepoint|fireeye|trendmicro|sophos|messagelabs|ironport|cisco|zscaler|safelinks|facebookexternalhit|slackbot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|bingpreview|googleother|yahoo! slurp/i;

/** A user agent that belongs to a machine, or none at all. */
export function isBotUserAgent(userAgent: string | null | undefined) {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT_AGENT.test(userAgent);
}

/**
 * Apple's network (17.0.0.0/8, and its IPv6 ranges): Mail Privacy Protection
 * fetches images from here for every delivered email, read or not.
 */
export function isAppleProxyIp(ip: string | null | undefined) {
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/i, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.startsWith("17.");
  const lower = ip.toLowerCase();
  return lower.startsWith("2620:149:") || lower.startsWith("2a01:b740:");
}

/** An open that a machine made (MPP or a scanner), not a person reading. */
export function isMachineOpen(ip: string | null | undefined, userAgent: string | null | undefined) {
  if (isAppleProxyIp(ip)) return true;
  // Gmail's image proxy fetches when the email is opened: that's a person.
  if (userAgent && /GoogleImageProxy/i.test(userAgent)) return false;
  return isBotUserAgent(userAgent);
}
