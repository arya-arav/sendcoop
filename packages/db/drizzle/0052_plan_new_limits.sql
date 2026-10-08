-- New plan limits and features (the plans editor): existing plans get them
-- unlimited and on, so nothing anyone can do today changes. Keys a plan
-- already has win.
UPDATE "plans" SET
  "limits" = '{"lists": null, "automations": null, "forms": null, "segments": null, "sendingDomains": null, "sendingServers": null, "uploadMb": null}'::jsonb || "limits",
  "features" = '{"importContacts": true, "exportContacts": true, "ownSendingServers": true}'::jsonb || "features";
